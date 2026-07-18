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

# --- verify mode: prove a CANDIDATE fingerprint signs the real GNU release,
# BEFORE anything is committed. Fetches the key BY fingerprint from a keyserver
# (no committed key needed) and verifies the signature. All-or-nothing. The
# IDENTITY of the fingerprint comes from the scout convergence, not this check.
#   bash tools/pin-binutils.sh --verify <40-hex-fingerprint> <version>
if [ "${1:-}" = "--verify" ]; then
  FPR="$(printf '%s' "${2:?usage: --verify <fingerprint> <version>}" | tr -d ' ' | tr '[:lower:]' '[:upper:]')"
  VER="${3:?usage: --verify <fingerprint> <version>}"
  printf '%s' "$FPR" | grep -qE '^[0-9A-F]{40}$' || { echo "FATAL: fingerprint must be 40 hex characters."; exit 2; }
  export GNUPGHOME="$(mktemp -d "${TMPDIR:-/tmp}/bu-verify.XXXXXX")"
  WORK="$(mktemp -d "${TMPDIR:-/tmp}/bu-dl.XXXXXX")"
  trap 'rm -rf "$GNUPGHOME" "$WORK"' EXIT
  chmod 700 "$GNUPGHOME"
  echo "fetching key $FPR by fingerprint ..."
  gpg --batch --keyserver hkps://keys.openpgp.org --recv-keys "$FPR" >/dev/null 2>&1 \
    || gpg --batch --keyserver hkps://keyserver.ubuntu.com --recv-keys "$FPR" >/dev/null 2>&1 \
    || { echo "FATAL: no key with fingerprint $FPR found on keyservers."; exit 1; }
  GOT="$(gpg --batch --with-colons --fingerprint "$FPR" 2>/dev/null | awk -F: '/^fpr:/{print $10; exit}')"
  [ "$GOT" = "$FPR" ] || { echo "FATAL: fetched key fingerprint $GOT does not equal $FPR."; exit 1; }
  BASE="https://ftp.gnu.org/gnu/binutils"; TAR="binutils-$VER.tar.xz"
  for f in "$TAR" "$TAR.sig"; do
    curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors "$BASE/$f" -o "$WORK/$f"
  done
  ST="$(gpg --batch --status-fd 1 --verify "$WORK/$TAR.sig" "$WORK/$TAR" 2>/dev/null || true)"
  printf '%s\n' "$ST" | grep -q '^\[GNUPG:\] GOODSIG' || { echo "FATAL: not a GOOD signature."; printf '%s\n' "$ST"; exit 1; }
  VFPR="$(printf '%s\n' "$ST" | awk '/^\[GNUPG:\] VALIDSIG/{print $12; exit}')"
  [ "$VFPR" = "$FPR" ] || { echo "FATAL: VALIDSIG primary fingerprint $VFPR does not equal $FPR."; printf '%s\n' "$ST"; exit 1; }
  printf '%s\n' "$ST" | grep -qE '^\[GNUPG:\] (REVKEYSIG|EXPKEYSIG|EXPSIG)' && { echo "FATAL: signature from a revoked/expired key."; printf '%s\n' "$ST"; exit 1; }
  SHA="$(sha256sum "$WORK/$TAR" | cut -d' ' -f1)"
  echo "GOOD: binutils-$VER is signed by $FPR"
  echo "BINUTILS_SHA256=$SHA"
  echo "(fingerprint IDENTITY comes from the scout cross-source convergence, not this check.)"
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
