#!/usr/bin/env bash
# build-binutils.sh <out-dir>
# The guest assembler+linker: an x86-64 MUSL-static binutils that TARGETS
# aarch64. x86-64 because Blink emulates x86-64; musl because a glibc-static as
# SIGSEGVs under Blink (docs/vixl-arm64.md section 4). Recipe is the
# x86-64-playground's compile_musl_binutils.sh with the target triple changed.
set -euo pipefail
OUT="${1:?}"; mkdir -p "$OUT"
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/pins.env"
VER="$BINUTILS_VERSION"

command -v musl-gcc >/dev/null || { echo "FATAL musl-gcc missing (apt install musl-tools)"; exit 1; }

cd "$HOME"
curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors \
  "https://ftp.gnu.org/gnu/binutils/binutils-$VER.tar.xz" -o "binutils-$VER.tar.xz"
SHA=$(sha256sum "binutils-$VER.tar.xz" | cut -d' ' -f1)
if [ -n "${BINUTILS_SHA256:-}" ]; then
  echo "$BINUTILS_SHA256  binutils-$VER.tar.xz" | sha256sum -c -
else
  echo "## binutils-$VER.tar.xz sha256 $SHA"
  echo "## (BINUTILS_SHA256 is unset in pins.env -- paste the above in to pin it)"
fi
tar xf "binutils-$VER.tar.xz"

mkdir -p bu && cd bu
# -static rides in CFLAGS, NOT LDFLAGS: CCLD expands $(CFLAGS) $(LDFLAGS), and
# binutils does not reliably propagate configure-time LDFLAGS into sub-builds.
CC=musl-gcc \
CFLAGS="-O3 -static --static -static-libgcc -static-libstdc++" \
CXXFLAGS="-O3 -static --static" \
  "$HOME/binutils-$VER/configure" \
    --target=aarch64-linux-gnu --enable-targets=aarch64-linux-gnu \
    --enable-default-execstack=no --enable-deterministic-archives \
    --enable-new-dtags --disable-doc --disable-gprof --disable-nls \
    --disable-binutils --disable-gdb --disable-gdbserver \
    --disable-libdecnumber --disable-readline --disable-sim \
    --disable-werror --enable-static --enable-plugins=no --disable-shared \
    > "$OUT/binutils-configure.log" 2>&1

# all-gas all-ld, NOT "make all": an aarch64 target pulls in gold/gprofng that
# the upstream flag set never disables and that fail under musl.
if ! make -j"$(nproc)" all-gas all-ld > "$OUT/binutils-make.log" 2>&1; then
  echo "## MAKE FAILED -- error lines (tail is useless under make -j):"
  grep -n -i "error:\|Error [0-9]\|undefined reference" "$OUT/binutils-make.log" | head -20
  exit 1
fi

cp gas/as-new "$OUT/aarch64-as.elf"
cp ld/ld-new  "$OUT/aarch64-ld.elf"
chmod +x "$OUT"/aarch64-*.elf
strip --strip-unneeded "$OUT/aarch64-as.elf" "$OUT/aarch64-ld.elf"

echo "## ---- gates ----"
FAIL=0
for f in "$OUT/aarch64-as.elf" "$OUT/aarch64-ld.elf"; do
  n=$(basename "$f")
  # MUSL_LOCPATH is the real libc marker. "linux-musl" is NOT -- that is a
  # target triple, absent from an aarch64-targeting build by construction.
  # And grep glibc false-positives on binutils' own GLIBC_ABI_DT_RELR strings.
  strings -a "$f" | grep -q "MUSL_LOCPATH"     && echo "  $n musl -- OK"   || { echo "  $n NOT musl -- FAIL"; FAIL=1; }
  strings -a "$f" | grep -q "__libc_start_main" && { echo "  $n glibc -- FAIL"; FAIL=1; } || echo "  $n no glibc -- OK"
  readelf -l "$f" | grep -qw INTERP             && { echo "  $n dynamic -- FAIL"; FAIL=1; } || echo "  $n static -- OK"
  echo "  $n $(stat -c%s "$f") bytes"
done
"$OUT/aarch64-as.elf" --version | head -1
echo "{\"binutils\":\"$VER\",\"tarball_sha256\":\"$SHA\",\"libc\":\"musl\",\"host\":\"x86_64\",\"target\":\"aarch64-linux-gnu\"}" > "$OUT/binutils-manifest.json"
test "$FAIL" = "0"
