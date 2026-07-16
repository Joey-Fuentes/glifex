#!/usr/bin/env bash
# build-variants.sh <out-dir>
#
# v9. The gate caught v8: -fcf-protection=none via configure CFLAGS did NOT
# remove GNU_PROPERTY. Local byte evidence says why:
#
#   readelf -n ours -> "Properties: x86 feature: IBT, SHSTK"
#
# GNU ld ANDs the CET feature bits across inputs -- an object with no property
# note CLEARS the bit. Our output still advertises IBT+SHSTK, so OUR OWN objects
# still carry it, so the flag never reached the compiler. Same failure mode as
# LDFLAGS="-static": binutils does not propagate configure-time flags into its
# sub-builds. Fix: bake it into CC, where nothing can drop it.
#
# objcopy --remove-section is NOT an option: tested locally, it took the phdr
# count 10->9 by deleting GNU_RELRO and left GNU_PROPERTY intact. It mangles
# program headers rather than fixing them.
set -uo pipefail

OUT="${1:?}"; mkdir -p "$OUT"
VER=2.43

echo "## ================= IS IT US, OR IS IT GLIBC? ================="
echo "## Decides whether ubuntu-latest is viable at all. If the distro's own"
echo "## static glibc carries CET, no compiler flag of ours can help and 22.04"
echo "## becomes evidence-based rather than a hunch."
echo "## host gcc: $(gcc --version | head -1)"
echo "## host libc: $(ldd --version | head -1)"
for o in /usr/lib/x86_64-linux-gnu/crt1.o /usr/lib/x86_64-linux-gnu/crti.o; do
  test -f "$o" || continue
  if readelf -n "$o" 2>/dev/null | grep -qi "IBT\|SHSTK"; then
    echo "##   $(basename "$o")  CARRIES CET  -> $(readelf -n "$o" 2>/dev/null | grep -i 'x86 feature' | head -1 | sed 's/^ *//')"
  else
    echo "##   $(basename "$o")  no CET note"
  fi
done
LIBC_A=$(find /usr/lib -name "libc.a" 2>/dev/null | head -1)
if [ -n "$LIBC_A" ]; then
  cd "${TMPDIR:-/tmp}" && rm -rf libcx && mkdir libcx && cd libcx
  ar x "$LIBC_A" 2>/dev/null || true
  M=$(ls *.o 2>/dev/null | head -1)
  if [ -n "$M" ]; then
    if readelf -n "$M" 2>/dev/null | grep -qi "IBT\|SHSTK"; then
      echo "##   libc.a($M)  CARRIES CET -- ubuntu-latest cannot produce a CET-free static link"
    else
      echo "##   libc.a($M)  no CET note -- our compiler flags are sufficient"
    fi
  fi
fi

cd "$HOME"
curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors \
  "https://ftp.gnu.org/gnu/binutils/binutils-$VER.tar.xz" -o "binutils-$VER.tar.xz"
tar xf "binutils-$VER.tar.xz"

mkdir -p "$HOME/bu"; cd "$HOME/bu"
# CC carries the flag. configure-time CFLAGS demonstrably does not survive.
"$HOME/binutils-$VER/configure" \
  --target=aarch64-linux-gnu \
  --disable-nls --disable-werror --disable-plugins \
  --disable-gdb --disable-gdbserver --disable-sim --disable-readline \
  --disable-shared --enable-static \
  CC="gcc -fcf-protection=none" \
  CXX="g++ -fcf-protection=none" \
  > "$OUT/cfg.log" 2>&1 || { echo "## CONFIGURE FAILED"; tail -20 "$OUT/cfg.log"; exit 1; }

make -j"$(nproc)" all-gas all-ld > "$OUT/make.log" 2>&1 \
  || { echo "## MAKE FAILED"; tail -30 "$OUT/make.log"; exit 1; }

has_interp() { readelf -l "$1" 2>/dev/null | grep -qw INTERP; }
has_prop()   { readelf -l "$1" 2>/dev/null | grep -qw GNU_PROPERTY; }

WINNER=""
for V in "-all-static" "-static -no-pie" "-static" "-static-pie"; do
  rm -f gas/as-new ld/ld-new
  make -j"$(nproc)" all-gas all-ld LDFLAGS="$V" > "$OUT/relink.log" 2>&1 || continue
  test -f gas/as-new || continue
  if has_interp gas/as-new; then echo "## LDFLAGS=\"$V\"  DYNAMIC -- reject"
  else echo "## LDFLAGS=\"$V\"  STATIC -- accept"; WINNER="$V"; break; fi
done
test -n "$WINNER" || { echo "## FATAL nothing linked static"; exit 1; }

cp gas/as-new "$OUT/aarch64-as.elf"; cp ld/ld-new "$OUT/aarch64-ld.elf" 2>/dev/null || true
chmod +x "$OUT/aarch64-as.elf" "$OUT/aarch64-ld.elf" 2>/dev/null || true
strip --strip-all "$OUT/aarch64-as.elf" 2>/dev/null || true
strip --strip-all "$OUT/aarch64-ld.elf" 2>/dev/null || true

echo
echo "## ================= THE GATE (from the reference, not from me) ========="
FAIL=0
for f in "$OUT/aarch64-as.elf" "$OUT/aarch64-ld.elf"; do
  test -f "$f" || continue
  n=$(basename "$f")
  if has_prop "$f"; then
    echo "  $n  GNU_PROPERTY PRESENT -- FAIL"
    echo "  $n  $(readelf -n "$f" 2>/dev/null | grep -i 'x86 feature' | head -1 | sed 's/^ *//')"
    echo "  $n  -> if CC carries the flag and this persists, the note is glibc's,"
    echo "  $n     not ours, and ubuntu-latest cannot do this. See the diagnostic above."
    FAIL=1
  else
    echo "  $n  no GNU_PROPERTY -- OK, matches the reference"
  fi
  has_interp "$f" && { echo "  $n  PT_INTERP -- FAIL"; FAIL=1; } || echo "  $n  static -- OK"
  echo "  $n  $(stat -c%s "$f") bytes"
done
"$OUT/aarch64-as.elf" --version | head -1
test "$FAIL" = "0" || { echo "## FATAL gate failed"; exit 1; }
echo "## VERDICT static, CET-free, phdr profile matches the working reference"
