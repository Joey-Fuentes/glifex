#!/usr/bin/env bash
# build-variants.sh <out-dir>
#
# THE FINDING. Program headers of the known-good guest vs ours:
#   REFERENCE   7 phdrs: LOAD x4           TLS              GNU_STACK GNU_RELRO   -> WORKS
#   OURS       10 phdrs: LOAD x4 NOTE NOTE TLS GNU_PROPERTY GNU_STACK GNU_RELRO   -> SIGSEGV
#
# GNU_PROPERTY is Intel CET (IBT + shadow stack). Ubuntu gcc defaults to
# -fcf-protection=full, stamping endbr64 everywhere and advertising CET in a
# note; static glibc reads that at startup and tries to ENABLE CET. Blink is a
# patched emulator that was never built for it. The reference has CET OFF --
# which is what a binary built FOR Blink looks like.
#
# Things this is NOT, all disproven the expensive way:
#   - mprotect. The reference emits the SAME six "unsupported syscall" warnings
#     and works fine. Benign noise; two round trips wasted on it.
#   - musl. The reference is glibc.
#   - RELRO. The reference has it.
#   - glibc version. 22.04 (GCC 11) failed identically, and was BIGGER.
#   - my rig. It runs the reference in 633 ms, exit 0, real .o.
#
# ubuntu-latest to match ci.yml/pages.yml; a vendor step pinned to an old runner
# would be a wart.
set -uo pipefail

OUT="${1:?}"; mkdir -p "$OUT"
VER=2.43

cd "$HOME"
curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors \
  "https://ftp.gnu.org/gnu/binutils/binutils-$VER.tar.xz" -o "binutils-$VER.tar.xz"
tar xf "binutils-$VER.tar.xz"
echo "## host gcc: $(gcc --version | head -1)"

mkdir -p "$HOME/bu"; cd "$HOME/bu"
# -fcf-protection=none is the whole hypothesis.
"$HOME/binutils-$VER/configure" \
  --target=aarch64-linux-gnu \
  --disable-nls --disable-werror --disable-plugins \
  --disable-gdb --disable-gdbserver --disable-sim --disable-readline \
  --disable-shared --enable-static \
  CFLAGS="-O2 -fcf-protection=none" \
  CXXFLAGS="-O2 -fcf-protection=none" \
  > "$OUT/cfg.log" 2>&1 || { echo "## CONFIGURE FAILED"; tail -20 "$OUT/cfg.log"; exit 1; }

make -j"$(nproc)" all-gas all-ld > "$OUT/make.log" 2>&1 \
  || { echo "## MAKE FAILED"; tail -30 "$OUT/make.log"; exit 1; }

has_interp() { readelf -l "$1" 2>/dev/null | grep -qw INTERP; }

# Keep the LOOP. Every time I have replaced it with a hardcoded guess I have
# been wrong: -static alone yields a dynamic PIE; the actual winner is
# -all-static, not the "-static -no-pie" I predicted.
WINNER=""
for V in "-all-static" "-static -no-pie" "-static" "-static-pie"; do
  rm -f gas/as-new ld/ld-new
  make -j"$(nproc)" all-gas all-ld LDFLAGS="$V" > "$OUT/relink.log" 2>&1 || { echo "## LDFLAGS=\"$V\" relink failed"; continue; }
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
echo "## ================= THE GATE ================="
echo "## Derived from the reference's phdr profile, not from my reasoning:"
echo "## a Blink-compatible guest must carry NO GNU_PROPERTY segment."
FAIL=0
for f in "$OUT/aarch64-as.elf" "$OUT/aarch64-ld.elf"; do
  test -f "$f" || continue
  n=$(basename "$f")
  PH=$(readelf -l "$f" 2>/dev/null | grep -c "^  [A-Z]" || echo "?")
  if readelf -l "$f" 2>/dev/null | grep -qw GNU_PROPERTY; then
    echo "  $n  GNU_PROPERTY STILL PRESENT -- FAIL, CET not disabled"; FAIL=1
  else
    echo "  $n  no GNU_PROPERTY -- OK, matches the reference"
  fi
  if has_interp "$f"; then echo "  $n  PT_INTERP present -- FAIL"; FAIL=1; else echo "  $n  static -- OK"; fi
  echo "  $n  $(stat -c%s "$f") bytes (reference as is 2135928)"
  echo "  $n  phdrs: $(readelf -l "$f" 2>/dev/null | sed -n '/Program Headers/,/Section to Segment/p' | grep -oE "^  [A-Z_]+" | tr -d ' ' | tr '\n' ' ')"
done
"$OUT/aarch64-as.elf" --version | head -1
test "$FAIL" = "0" || { echo "## FATAL gate failed"; exit 1; }
echo "## VERDICT static, CET-free -- phdr profile now matches the working reference"
