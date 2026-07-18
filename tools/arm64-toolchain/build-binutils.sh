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

# The target triple, in ONE place. It names both the configure target and the
# build directory, because autotools caches target_alias and a tree configured
# for one --target cannot be reconfigured for another. arm64 is the only user of
# $HOME/bu today -- but riscv64 collided with it exactly this way when it was
# created by retargeting THIS script, and the next architecture to copy it would
# do the same. Deriving the build dir from the triple removes the trap.
TARGET_TRIPLE="aarch64-linux-gnu"

command -v musl-gcc >/dev/null || { echo "FATAL musl-gcc missing (apt install musl-tools)"; exit 1; }

cd "$HOME"
curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors \
  "https://ftp.gnu.org/gnu/binutils/binutils-$VER.tar.xz" -o "binutils-$VER.tar.xz"
SHA=$(sha256sum "binutils-$VER.tar.xz" | cut -d' ' -f1)
if [ -z "${BINUTILS_SHA256:-}" ]; then
  echo "## FATAL: BINUTILS_SHA256 unset in pins.env -- refusing to build unverified source."
  echo "## Observed sha256: $SHA"
  echo "## Establish the pin first: bash tools/pin-binutils.sh $VER (verifies the GNU signature)."
  exit 1
fi
echo "$BINUTILS_SHA256  binutils-$VER.tar.xz" | sha256sum -c -
tar xf "binutils-$VER.tar.xz"

BUILD="bu-$TARGET_TRIPLE"
mkdir -p "$BUILD" && cd "$BUILD"
# -static rides in CFLAGS, NOT LDFLAGS: CCLD expands $(CFLAGS) $(LDFLAGS), and
# binutils does not reliably propagate configure-time LDFLAGS into sub-builds.
CC=musl-gcc \
CFLAGS="-O3 -static --static -static-libgcc -static-libstdc++" \
CXXFLAGS="-O3 -static --static" \
  "$HOME/binutils-$VER/configure" \
    --target="$TARGET_TRIPLE" --enable-targets="$TARGET_TRIPLE" \
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
# Name the files rather than globbing them: a glob is what survived the sed that
# created the riscv64 script from this one, and it failed with
#   chmod: cannot access '.../asm-riscv64/aarch64-*.elf'
chmod +x "$OUT/${TARGET_TRIPLE%%-*}-as.elf" "$OUT/${TARGET_TRIPLE%%-*}-ld.elf"
strip --strip-unneeded "$OUT/aarch64-as.elf" "$OUT/aarch64-ld.elf"

echo "## ---- gates ----"
FAIL=0
for f in "$OUT/aarch64-as.elf" "$OUT/aarch64-ld.elf"; do
  n=$(basename "$f")
  # MUSL_LOCPATH is the real libc marker. "linux-musl" is NOT -- that is a
  # target triple, absent from an aarch64-targeting build by construction.
  # And grep glibc false-positives on binutils' own GLIBC_ABI_DT_RELR strings.
  strings -a "$f" | grep -q "MUSL_LOCPATH"     && echo "  $n musl -- OK"   || { echo "  $n NOT musl -- FAIL"; FAIL=1; }
  # This used to assert __libc_start_main was ABSENT and call that "not glibc".
  # It is not: musl implements that symbol too, and it only disappears because we
  # strip below. The check was passing by luck and would false-FAIL an unstripped
  # musl build. MUSL_LOCPATH above is the real marker; this tests for glibc's own
  # banner instead.
  strings -a "$f" | grep -q "GNU C Library" && { echo "  $n glibc -- FAIL"; FAIL=1; } || echo "  $n not glibc -- OK"
  readelf -l "$f" | grep -qw INTERP             && { echo "  $n dynamic -- FAIL"; FAIL=1; } || echo "  $n static -- OK"
  echo "  $n $(stat -c%s "$f") bytes"
done
"$OUT/aarch64-as.elf" --version | head -1
echo "{\"binutils\":\"$VER\",\"tarball_sha256\":\"$SHA\",\"libc\":\"musl\",\"host\":\"x86_64\",\"target\":\"aarch64-linux-gnu\"}" > "$OUT/binutils-manifest.json"
test "$FAIL" = "0"
