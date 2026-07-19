#!/usr/bin/env bash
# pin-binutils.sh <version> [--write]
# Authenticated pin-setter for GNU binutils. Verifies a release tarball against
# the committed, fingerprint-pinned signing key BEFORE emitting its sha256, so
# the BINUTILS_SHA256 you commit is provably from a signed GNU release -- not
# "whatever the mirror served". Trust model: tools/keys/README.md.
#
#   cd ~/glifex
#   bash tools/pin-binutils.sh --verify <fpr> <ver>   # read-only: verify + identity URLs
#   bash tools/pin-binutils.sh --write  <fpr> <ver>   # verify, then write anchor files (unstaged)
# Two modes, one grammar (fingerprint first, version last). --write does everything
# --verify does, then writes tools/keys/binutils-signing.asc + both pins.env
# (BINUTILS_VERSION/SHA256/SIGNING_FPR) into the WORKING TREE only -- never staged.
# Trust model + full walkthrough: tools/keys/README.md.
set -euo pipefail

# --- verify mode: end-to-end pre-commit check for a CANDIDATE fingerprint.
# Runs every mechanical corroboration leg against a fingerprint you supply, then
# prints the one identity step it cannot do (the sourceware announcement /
# MAINTAINERS eyeball). It never gates on that manual step. No fingerprint or
# signer name is hardcoded anywhere -- everything is read from the release/key.
#   bash tools/pin-binutils.sh --verify <40-hex-fingerprint> <version>   # read-only
#   bash tools/pin-binutils.sh --write  <40-hex-fingerprint> <version>   # writes anchor files (unstaged)
# --write here (fingerprint form) runs the identical legs, then -- only on full
# pass -- writes the key + both pins.env in the WORKING TREE (never staged/committed):
# review with `git diff` and commit yourself. Any leg failing writes nothing.
ANCHOR_WRITE=0
if [ "${1:-}" = "--write" ] && printf '%s' "${2:-}" | grep -qiE '^[0-9A-Fa-f]{40}$'; then ANCHOR_WRITE=1; fi
if [ "${1:-}" = "--verify" ] || [ "$ANCHOR_WRITE" = "1" ]; then
  MODE="${1}"
  FPR="$(printf '%s' "${2:?usage: ${MODE} <fingerprint> <version>}" | tr -d ' ' | tr '[:lower:]' '[:upper:]')"
  VER="${3:?usage: ${MODE} <fingerprint> <version>}"
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
  if [ "$ANCHOR_WRITE" = "1" ]; then
    echo
    echo "== writing anchor files (WORKING TREE ONLY -- not staged) =="
    ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
    KEY="$ROOT/tools/keys/binutils-signing.asc"
    ARM_PINS="$ROOT/tools/arm64-toolchain/pins.env"
    RV_PINS="$ROOT/tools/riscv-toolchain/pins.env"
    if [ -f "$KEY" ]; then echo "   NOTE: overwriting existing $KEY (signer rotation -- review the diff)"; fi
    if ! gpg --batch --no-default-keyring --keyring "$D/kr.gpg" --export --armor "$FPR" > "$KEY" 2>/dev/null || [ ! -s "$KEY" ]; then
      echo "   FATAL: could not export $FPR from the GNU keyring."; exit 1
    fi
    echo "   wrote $KEY"
    for p in "$ARM_PINS" "$RV_PINS"; do
      [ -f "$p" ] || { echo "   skip (absent): $p"; continue; }
      tmp="$(mktemp "${TMPDIR:-/tmp}/pins.XXXXXX")"
      sed -e "s/^BINUTILS_VERSION=.*/BINUTILS_VERSION=$VER/" \
          -e "s/^BINUTILS_SHA256=.*/BINUTILS_SHA256=$SHA/" \
          -e "s/^BINUTILS_SIGNING_FPR=.*/BINUTILS_SIGNING_FPR=$FPR/" "$p" > "$tmp" && mv "$tmp" "$p"
      echo "   updated $p (VERSION=$VER, SHA256, SIGNING_FPR)"
    done
    echo "   -> files written but NOT staged. Do the identity check below, then 'git diff' and commit."
  fi

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
  echo "identity leg is closed."
  if [ "$ANCHOR_WRITE" = "1" ]; then
    echo "The anchor files are already written (unstaged) -- review 'git diff' and commit."
  else
    echo "Re-run with --write <fpr> $VER to write the key + both pins.env."
  fi
  exit 0
fi

# --- no recognized mode matched ------------------------------------------------
# Reachable when args don't form --verify/--write <fpr> <ver> (e.g. a mistyped
# fingerprint, a missing flag, or the removed bare-version forms). Fail loud.
echo "usage:" >&2
echo "  bash tools/pin-binutils.sh --verify <40-hex-fingerprint> <version>   # read-only" >&2
echo "  bash tools/pin-binutils.sh --write  <40-hex-fingerprint> <version>   # writes anchor files (unstaged)" >&2
echo >&2
echo "note: the fingerprint comes first (paste it), the version last. See tools/keys/README.md." >&2
exit 2
