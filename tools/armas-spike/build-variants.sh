#!/usr/bin/env bash
# build-variants.sh <out-dir>
#
# v10. THE ANSWER, from the playground's own compile_musl_binutils.sh.
# Their guest assembler is MUSL-static. Ours was GLIBC-static. Verified in bytes:
#   reference:  "musl" x2,  "glibc" x0,  "__libc_start_main" x0
#   ours:       "musl" x0,  "glibc" x44, "__libc_start_main" x1
#
# I had the musl hypothesis in round 6 and killed it with a broken instrument:
# dissect.sh grepped for "glibc" and matched GLIBC_ABI_DT_RELR / GLIBC_2.36 --
# version-symbol names that ANY binutils contains, musl-built or not. It gave a
# false positive on the one binary that mattered.
#
# Also learned from their script: -static rides in CFLAGS, not LDFLAGS, because
# CCLD expands $(CFLAGS) $(LDFLAGS). That is why every LDFLAGS permutation I
# tried produced a dynamic PIE.
#
# This is their recipe verbatim, with one change: the target triple.
set -uo pipefail

OUT="${1:?}"; mkdir -p "$OUT"

command -v musl-gcc >/dev/null || { echo "## FATAL musl-gcc missing"; exit 1; }
echo "## musl-gcc: $(musl-gcc --version | head -1)"

cd "$HOME"
# They clone binutils-gdb git (hence their 2.43.50 snapshot), not a release tarball.
if [ ! -d binutils-gdb ]; then
  git clone --depth 1 https://sourceware.org/git/binutils-gdb.git binutils-gdb \
    || { echo "## FATAL clone failed"; exit 1; }
fi
echo "## binutils-gdb HEAD $(git -C binutils-gdb rev-parse --short HEAD)"

mkdir -p "$HOME/bu"; cd "$HOME/bu"

# Verbatim from compile_musl_binutils.sh, except the two target lines.
common_configure_flags=(
    "--enable-default-execstack=no"
    "--enable-deterministic-archives"
    "--enable-new-dtags"
    "--disable-doc"
    "--disable-gprof"
    "--disable-nls"
    "--disable-binutils"
    "--disable-gdb"
    "--disable-gdbserver"
    "--disable-libdecnumber"
    "--disable-readline"
    "--disable-sim"
    "--disable-werror"
    "--enable-static"
    "--enable-plugins=no"
    "--enable-targets=aarch64-linux-gnu"
    "--target=aarch64-linux-gnu"
    "--disable-shared"
)

CC=musl-gcc \
CFLAGS="-O3 -static --static -static-libgcc -static-libstdc++" \
CXXFLAGS="-O3 -static --static" \
  "$HOME/binutils-gdb/configure" "${common_configure_flags[@]}" \
  > "$OUT/cfg.log" 2>&1 || { echo "## CONFIGURE FAILED"; tail -25 "$OUT/cfg.log"; exit 1; }

# Their script says "make all" -- fine for target=x86_64-linux-musl. Our
# aarch64 target pulls in extra components (gold, gprofng) their flag set never
# disables, and one of them fails under musl. We need exactly two binaries.
# v10 proved the parts we want DO build: every aarch64 emulation generated and
# ld-new linked before the unrelated subdir died.
if ! make -j"$(nproc)" all-gas all-ld > "$OUT/make.log" 2>&1; then
  echo "## MAKE FAILED"
  # tail -40 is useless under make -j: it shows whichever subdir finished last,
  # not the one that failed. Grep for the actual error.
  echo "## ---- error lines ----"
  grep -n -i "error:\|Error [0-9]\|undefined reference\|No such file" "$OUT/make.log" | head -25
  echo "## ---- last directory entered before the failure ----"
  grep -n "Entering directory" "$OUT/make.log" | tail -3
  exit 1
fi

test -f gas/as-new || { echo "## FATAL no gas/as-new"; exit 1; }
cp gas/as-new "$OUT/aarch64-as.elf"
# Note: their script strips "gas/ld-new" (a typo) so their ld ships unstripped.
test -f ld/ld-new && cp ld/ld-new "$OUT/aarch64-ld.elf"
chmod +x "$OUT"/aarch64-*.elf 2>/dev/null || true
strip --strip-unneeded "$OUT/aarch64-as.elf" 2>/dev/null || true
strip --strip-unneeded "$OUT/aarch64-ld.elf" 2>/dev/null || true

echo
echo "## ================= GATES (from verified bytes, not a loose grep) ====="
FAIL=0
for f in "$OUT/aarch64-as.elf" "$OUT/aarch64-ld.elf"; do
  test -f "$f" || continue
  n=$(basename "$f")
  # musl-linked, positively identified -- and NOT glibc.
  if strings -a "$f" | grep -q "linux-musl"; then echo "  $n  musl -- OK"; else echo "  $n  NOT musl -- FAIL"; FAIL=1; fi
  if strings -a "$f" | grep -q "__libc_start_main"; then echo "  $n  glibc entry present -- FAIL"; FAIL=1; else echo "  $n  no glibc entry -- OK"; fi
  if readelf -l "$f" 2>/dev/null | grep -qw INTERP; then echo "  $n  PT_INTERP -- FAIL"; FAIL=1; else echo "  $n  static -- OK"; fi
  echo "  $n  $(stat -c%s "$f") bytes  (reference as = 2135928)"
  echo "  $n  phdrs: $(readelf -l "$f" 2>/dev/null | sed -n '/Program Headers/,/Section to Segment/p' | grep -oE "^  [A-Z_]+" | tr -d ' ' | tr '\n' ' ')"
done
"$OUT/aarch64-as.elf" --version | head -1
test "$FAIL" = "0" || { echo "## FATAL gates failed"; exit 1; }
echo "## VERDICT musl-static aarch64-targeting as -- same shape as the working reference"
