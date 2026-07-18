#!/usr/bin/env bash
# pin-binutils.sh <version> [--write]
# Authenticated pin-setter for GNU binutils. Verifies a release tarball against
# the committed, fingerprint-pinned signing key BEFORE emitting its sha256, so
# the BINUTILS_SHA256 you commit is provably from a signed GNU release -- not
# "whatever the mirror served". Trust model: tools/keys/README.md.
#
#   cd ~/glifex
#   bash tools/pin-binutils.sh 2.43           # verify + print the sha256 line
#   bash tools/pin-binutils.sh 2.43 --write   # also write it into both pins.env
set -euo pipefail

# --- verify mode: end-to-end pre-commit check for a CANDIDATE fingerprint.
# Runs every mechanical corroboration leg against a fingerprint you supply, then
# prints the one identity step it cannot do (the sourceware announcement /
# MAINTAINERS eyeball). It never gates on that manual step. No fingerprint or
# signer name is hardcoded anywhere -- everything is read from the release/key.
#   bash tools/pin-binutils.sh --verify <40-hex-fingerprint> <version>
if [ "${1:-}" = "--verify" ]; then
  FPR="$(printf '%s' "${2:?usage: --verify <fingerprint> <version>}" | tr -d ' ' | tr '[:lower:]' '[:upper:]')"
  VER="${3:?usage: --verify <fingerprint> <version>}"
  printf '%s' "$FPR" | grep -qE '^[0-9A-F]{40}$' || { echo "FATAL: fingerprint must be 40 hex characters."; exit 2; }
  BASE="https://ftp.gnu.org/gnu/binutils"; TAR="binutils-$VER.tar.xz"
  D="$(mktemp -d "${TMPDIR:-/tmp}/bu-verify.XXXXXX")"; trap 'rm -rf "$D"' EXIT

  echo "== [1/6] GNU keyring + release signature (authenticity) =="
  curl -fsSL --max-time 120 --retry 3 https://ftp.gnu.org/gnu/gnu-keyring.gpg -o "$D/kr.gpg" 2>/dev/null || { echo "FATAL: could not fetch the GNU keyring."; exit 1; }
  curl -fsSL --max-time 600 --retry 5 --retry-all-errors "$BASE/$TAR"     -o "$D/t.xz"     2>/dev/null || { echo "FATAL: release unreachable."; exit 1; }
  curl -fsSL --max-time 120 --retry 5 --retry-all-errors "$BASE/$TAR.sig" -o "$D/t.xz.sig" 2>/dev/null || { echo "FATAL: signature unreachable."; exit 1; }
  ST="$(gpg --batch --no-default-keyring --keyring "$D/kr.gpg" --status-fd 1 --verify "$D/t.xz.sig" "$D/t.xz" 2>/dev/null)"
  VALID_FPR="$(printf '%s\n' "$ST" | awk '/^\[GNUPG:\] VALIDSIG/{print $12; exit}')"
  if printf '%s\n' "$ST" | grep -q '^\[GNUPG:\] GOODSIG' && [ "$VALID_FPR" = "$FPR" ] && ! printf '%s\n' "$ST" | grep -qE '^\[GNUPG:\] (REVKEYSIG|EXPKEYSIG|EXPSIG)'; then
    echo "   GOOD: $TAR is signed by $FPR"
  else
    echo "   FAIL: signature did not verify as $FPR"; printf '%s\n' "$ST" | sed 's/^/     /'
    echo; echo "AUTHENTICITY FAILED -- this fingerprint does not sign binutils-$VER. Do not anchor."; exit 1
  fi
  SHA="$(sha256sum "$D/t.xz" | cut -d' ' -f1)"

  echo "== [2/6] signer identity in the GNU keyring =="
  GNU_UIDS="$(gpg --batch --no-default-keyring --keyring "$D/kr.gpg" --with-colons --list-keys "$FPR" 2>/dev/null | awk -F: '/^uid:/{print $10}' | paste -sd '; ' -)"
  EMAIL="$(gpg --batch --no-default-keyring --keyring "$D/kr.gpg" --with-colons --list-keys "$FPR" 2>/dev/null | awk -F: '/^uid:/{print $10}' | grep -oE '[^ <]+@[^ >]+' | head -1)"
  echo "   UID(s): ${GNU_UIDS:-<none>}"

  echo "== [3/6] independent keyservers hold this fingerprint =="
  KS_SEEN="no"
  for KS in hkps://keys.openpgp.org hkps://keyserver.ubuntu.com; do
    H="$(mktemp -d)"; chmod 700 "$H"
    if GNUPGHOME="$H" gpg --batch --keyserver-options timeout=30 --keyserver "$KS" --recv-keys "$FPR" >/dev/null 2>&1; then
      U="$(GNUPGHOME="$H" gpg --batch --with-colons --list-keys "$FPR" 2>/dev/null | awk -F: '/^uid:/{print $10}' | paste -sd '; ' -)"
      echo "   $KS -> ${U:-present}"; KS_SEEN="yes"
    else
      echo "   $KS -> unreachable / no key"
    fi
  done

  echo "== [4/6] WKD at the signer's own domain =="
  WKD="skipped (no email on key)"
  if [ -n "$EMAIL" ]; then
    H="$(mktemp -d)"; chmod 700 "$H"
    if GNUPGHOME="$H" gpg --batch --auto-key-locate clear,wkd --locate-external-keys "$EMAIL" >/dev/null 2>&1 && GNUPGHOME="$H" gpg --batch --with-colons --list-keys "$FPR" 2>/dev/null | grep -q "fpr:::::::::$FPR:"; then
      WKD="MATCH ($EMAIL domain serves this fingerprint)"
    else
      WKD="no WKD / different key at $EMAIL domain"
    fi
  fi
  echo "   $WKD"

  echo "== [5/6] temporal: same signer on neighboring releases =="
  for v in ${VERIFY_EXTRA:-2.42 2.44}; do
    [ "$v" = "$VER" ] && continue
    if curl -fsSL --max-time 600 --retry 3 --retry-all-errors "$BASE/binutils-$v.tar.xz" -o "$D/e.xz" 2>/dev/null && curl -fsSL --max-time 120 --retry 3 --retry-all-errors "$BASE/binutils-$v.tar.xz.sig" -o "$D/e.xz.sig" 2>/dev/null; then
      est="$(gpg --batch --no-default-keyring --keyring "$D/kr.gpg" --status-fd 1 --verify "$D/e.xz.sig" "$D/e.xz" 2>/dev/null)"
      efp="$(printf '%s\n' "$est" | awk '/^\[GNUPG:\] VALIDSIG/{print $12; exit}')"
      if printf '%s\n' "$est" | grep -q '^\[GNUPG:\] GOODSIG' && [ "$efp" = "$FPR" ]; then echo "   binutils-$v -> same signer"
      elif printf '%s\n' "$est" | grep -q '^\[GNUPG:\] GOODSIG'; then echo "   binutils-$v -> DIFFERENT signer: $efp"
      else echo "   binutils-$v -> not verified"; fi
    else
      echo "   binutils-$v -> unreachable"
    fi
  done

  echo
  echo "== [6/6] summary =="
  echo "   fingerprint : $FPR"
  echo "   UID         : ${GNU_UIDS:-<none>}"
  echo "   authenticity: GOOD (signs binutils-$VER)"
  echo "   keyservers  : $KS_SEEN"
  echo "   WKD         : $WKD"
  echo "   BINUTILS_SHA256=$SHA"
  echo
  echo "-------- MANUAL identity check (this command cannot do it for you) --------"
  echo "The legs above corroborate the fingerprint mechanically; confirm the PERSON by eye:"
  echo "  1. binutils MAINTAINERS (bot-gated -- open in a browser, do not script it):"
  echo "       https://sourceware.org/git/?p=binutils-gdb.git;a=blob;f=binutils/MAINTAINERS"
  echo "       -> confirm the UID above (${EMAIL:-the signer}) is listed as a maintainer."
  echo "  2. the release announcement on the binutils mailing list:"
  echo "       https://sourceware.org/pipermail/binutils/"
  echo "       -> open the archive window around the $VER release, find 'binutils $VER"
  echo "          Released', and confirm the same person posted/signed it."
  echo "When the UID, the announcement, and MAINTAINERS all name the same person, the"
  echo "identity leg is closed and you can commit BINUTILS_SIGNING_FPR=$FPR ."
  exit 0
fi

VER="${1:?usage: tools/pin-binutils.sh <version> [--write]}"
WRITE=0
[ "${2:-}" = "--write" ] && WRITE=1

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

KEY="tools/keys/binutils-signing.asc"
ARM_PINS="tools/arm64-toolchain/pins.env"
RV_PINS="tools/riscv-toolchain/pins.env"

[ -f "$KEY" ] || { echo "FATAL: $KEY missing -- commit the vetted signing key first (tools/keys/README.md)."; exit 1; }
[ -f "$ARM_PINS" ] || { echo "FATAL: $ARM_PINS missing -- run from the repo root."; exit 1; }

# expected fingerprint: read from pins.env, normalize to 40 uppercase hex
FPR="$( ( . "$ARM_PINS" >/dev/null 2>&1; printf '%s' "${BINUTILS_SIGNING_FPR:-}" ) | tr -d ' ' | tr '[:lower:]' '[:upper:]' )"
if ! printf '%s' "$FPR" | grep -qE '^[0-9A-F]{40}$'; then
  echo "FATAL: BINUTILS_SIGNING_FPR in $ARM_PINS is unset or not a 40-hex fingerprint."
  echo "Establish the anchor out-of-band first (see tools/keys/README.md), then set it there."
  exit 1
fi

# isolated keyring; import ONLY the committed key
GNUPGHOME_TMP="$(mktemp -d "${TMPDIR:-/tmp}/binutils-verify.XXXXXX")"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/binutils-dl.XXXXXX")"
trap 'rm -rf "$GNUPGHOME_TMP" "$WORK"' EXIT
chmod 700 "$GNUPGHOME_TMP"
export GNUPGHOME="$GNUPGHOME_TMP"
gpg --quiet --import "$KEY"

GOT_FPR="$(gpg --with-colons --fingerprint 2>/dev/null | awk -F: '/^fpr:/{print $10; exit}')"
if [ "$GOT_FPR" != "$FPR" ]; then
  echo "FATAL: committed key fingerprint $GOT_FPR does not match pinned $FPR."
  exit 1
fi
echo "committed key fingerprint matches pin: $FPR"

# fetch tarball + detached signature from GNU
BASE="https://ftp.gnu.org/gnu/binutils"
TAR="binutils-$VER.tar.xz"
for f in "$TAR" "$TAR.sig"; do
  curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors "$BASE/$f" -o "$WORK/$f"
done

# verify: require GOODSIG, VALIDSIG whose PRIMARY fp equals the pin, and refuse
# any revoked/expired-key signature
STATUS="$(gpg --status-fd 1 --verify "$WORK/$TAR.sig" "$WORK/$TAR" 2>/dev/null || true)"
printf '%s\n' "$STATUS" | grep -q '^\[GNUPG:\] GOODSIG' || { echo "FATAL: not a GOOD signature."; printf '%s\n' "$STATUS"; exit 1; }
VALID_FPR="$(printf '%s\n' "$STATUS" | awk '/^\[GNUPG:\] VALIDSIG/{print $12; exit}')"
if [ "$VALID_FPR" != "$FPR" ]; then
  echo "FATAL: VALIDSIG primary fingerprint $VALID_FPR does not equal pinned $FPR."
  printf '%s\n' "$STATUS"; exit 1
fi
if printf '%s\n' "$STATUS" | grep -qE '^\[GNUPG:\] (REVKEYSIG|EXPKEYSIG|EXPSIG)'; then
  echo "FATAL: signature made by a revoked or expired key."
  printf '%s\n' "$STATUS"; exit 1
fi
echo "GOOD signature from pinned key over $TAR"

SHA="$(sha256sum "$WORK/$TAR" | cut -d' ' -f1)"
echo
echo "verified GNU binutils $VER"
echo "BINUTILS_SHA256=$SHA"
echo

if [ "$WRITE" = "1" ]; then
  for p in "$ARM_PINS" "$RV_PINS"; do
    [ -f "$p" ] || continue
    if grep -qE '^BINUTILS_SHA256=' "$p"; then
      tmp="$(mktemp)"
      sed "s/^BINUTILS_SHA256=.*/BINUTILS_SHA256=$SHA/" "$p" > "$tmp" && mv "$tmp" "$p"
      echo "updated $p"
    fi
  done
else
  echo "(re-run with --write to update both pins.env, or paste the line above.)"
fi
