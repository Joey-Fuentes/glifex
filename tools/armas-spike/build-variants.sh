#!/usr/bin/env bash
# build-variants.sh <out-dir> <label>
#
# Run 6 dissected the KNOWN-GOOD Blink guest and killed two of my theories:
#   REFERENCE gnu-as.elf: static, NEEDED 0, libc GLIBC, RELRO 1, GCC 11.2/11.4
# It is static glibc WITH RELRO -- exactly what I blamed for the mprotect flood.
# So glibc is fine, RELRO is fine, musl was a wild goose chase.
#
# The one real difference left:
#   reference  GCC 11.2/11.4 -> Ubuntu 22.04, glibc 2.35, 2,135,928 bytes
#   ours       GCC 13.3      -> Ubuntu 24.04, glibc 2.39, 4,186,864 bytes (~2x)
# So this builds on BOTH runners and lets Blink decide.
#
# Also: run 6 produced three DYNAMIC binaries because I hardcoded
# LDFLAGS="-static". Ubuntu gcc defaults to PIE and -static does not override
# it; v5 only worked because its loop fell through to "-static -no-pie". The
# flag that matters is -no-pie. Keep the LOOP -- it has been right every time I
# have hardcoded a guess and been wrong.
set -uo pipefail

OUT="${1:?}"; LABEL="${2:?}"; mkdir -p "$OUT"
VER=2.43

cd "$HOME"
curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors \
  "https://ftp.gnu.org/gnu/binutils/binutils-$VER.tar.xz" -o "binutils-$VER.tar.xz"
tar xf "binutils-$VER.tar.xz"

echo "## host toolchain for this run"
gcc --version | head -1
ldd --version | head -1

mkdir -p "$HOME/bu"; cd "$HOME/bu"
"$HOME/binutils-$VER/configure" \
  --target=aarch64-linux-gnu \
  --disable-nls --disable-werror --disable-plugins \
  --disable-gdb --disable-gdbserver --disable-sim --disable-readline \
  --disable-shared --enable-static \
  > "$OUT/cfg-$LABEL.log" 2>&1 || { echo "## CONFIGURE FAILED"; tail -20 "$OUT/cfg-$LABEL.log"; exit 1; }

make -j"$(nproc)" all-gas all-ld > "$OUT/make-$LABEL.log" 2>&1 \
  || { echo "## MAKE FAILED"; tail -30 "$OUT/make-$LABEL.log"; exit 1; }

has_interp() { readelf -l "$1" 2>/dev/null | grep -qw INTERP; }

WINNER=""
for V in "-static -no-pie" "-static" "-all-static" "-static-pie"; do
  rm -f gas/as-new ld/ld-new
  if ! make -j"$(nproc)" all-gas all-ld LDFLAGS="$V" > "$OUT/relink-$LABEL.log" 2>&1; then
    echo "## LDFLAGS=\"$V\"  relink failed"; continue
  fi
  test -f gas/as-new || { echo "## LDFLAGS=\"$V\"  no as-new"; continue; }
  if has_interp gas/as-new; then
    echo "## LDFLAGS=\"$V\"  DYNAMIC -- reject"
  else
    echo "## LDFLAGS=\"$V\"  STATIC -- accept"; WINNER="$V"; break
  fi
done

test -n "$WINNER" || { echo "## FATAL no static link on $LABEL"; exit 1; }
echo "## winner on $LABEL: LDFLAGS=\"$WINNER\""

cp gas/as-new "$OUT/as-$LABEL.elf"
cp ld/ld-new  "$OUT/ld-$LABEL.elf" 2>/dev/null || true
chmod +x "$OUT/as-$LABEL.elf" "$OUT/ld-$LABEL.elf" 2>/dev/null || true
strip --strip-all "$OUT/as-$LABEL.elf" 2>/dev/null || true
strip --strip-all "$OUT/ld-$LABEL.elf" 2>/dev/null || true
echo "## as-$LABEL.elf  $(stat -c%s "$OUT/as-$LABEL.elf") bytes  (reference is 2135928)"
