#!/usr/bin/env bash
# katas.sh <built-dir> <kata-dir> <out-dir>
#
# Produce the GROUND TRUTH the local Blink rig diffs against, and settle the one
# open design question: which katas need ld.
#
# Why it matters: VIXL executes from a malloc'd address -- guest addresses ARE
# wasm linear-memory offsets. A LINKED ELF wants its segments at fixed vaddrs
# (0x400000...), which we cannot honour. So any kata needing a link forces a
# choice: constrain the corpus to position-independent asm, or make the worker
# relocate linked segments into a malloc'd base. That decision must land BEFORE
# the corpus grows from 1 problem x 3 variants to 3 x 4.
set -uo pipefail
BUILT="${1:?}"; KATAS="${2:?}"; OUT="${3:?}"
mkdir -p "$OUT"

RELOC_FREE=""; RELOC_NEEDED=""; MISMATCH=0

for f in "$KATAS"/*.s; do
  b=$(basename "$f" .s)
  echo
  echo "## ---------------- $b ----------------"

  aarch64-linux-gnu-as "$f" -o "$OUT/$b.stock.o" 2>/dev/null || { echo "   stock assemble FAILED"; continue; }
  "$BUILT/aarch64-as.elf" "$f" -o "$OUT/$b.o" 2> "$OUT/$b.err" || { echo "   OUR assemble FAILED"; cat "$OUT/$b.err"; MISMATCH=1; continue; }

  aarch64-linux-gnu-objcopy -O binary --only-section=.text "$OUT/$b.stock.o" "$OUT/$b.text.bin"
  aarch64-linux-gnu-objcopy -O binary --only-section=.text "$OUT/$b.o"       "$OUT/$b.ours.text.bin"
  A=$(sha256sum "$OUT/$b.text.bin"      | cut -c1-16)
  B=$(sha256sum "$OUT/$b.ours.text.bin" | cut -c1-16)
  echo "   .text  $(stat -c%s "$OUT/$b.text.bin") bytes   stock=$A  ours=$B"
  [ "$A" = "$B" ] && echo "   BYTE-IDENTICAL yes" || { echo "   BYTE-IDENTICAL NO"; MISMATCH=1; }

  R=$(aarch64-linux-gnu-objdump -r "$OUT/$b.stock.o" 2>/dev/null | grep -c "R_AARCH64" || true)
  if [ "$R" = "0" ]; then
    echo "   relocations 0 -> VIXL can run this .text straight from the .o"
    RELOC_FREE="$RELOC_FREE $b"
  else
    echo "   relocations $R -> NEEDS A LINK. This is the boundary."
    aarch64-linux-gnu-objdump -r "$OUT/$b.stock.o" 2>/dev/null | grep "R_AARCH64" | head -3 | sed 's/^/     /'
    RELOC_NEEDED="$RELOC_NEEDED $b"

    # Link it with OUR ld -- first real exercise of the linker -- and show
    # exactly where the linker wants it in memory.
    if "$BUILT/aarch64-ld.elf" "$OUT/$b.o" -o "$OUT/$b.linked" 2> "$OUT/$b.link.err"; then
      echo "   OUR ld linked it: $(stat -c%s "$OUT/$b.linked") bytes"
      echo "   entry  $(aarch64-linux-gnu-readelf -h "$OUT/$b.linked" 2>/dev/null | grep -i 'Entry point' | sed 's/^ *//')"
      echo "   LOAD vaddrs (what VIXL cannot honour):"
      aarch64-linux-gnu-readelf -l "$OUT/$b.linked" 2>/dev/null | grep -E "^  LOAD" | sed 's/^/     /'
    else
      echo "   OUR ld FAILED:"; head -3 "$OUT/$b.link.err" | sed 's/^/     /'
    fi
  fi
done

echo
echo "## ================= THE DESIGN BOUNDARY ================="
echo "## reloc-free (runnable as raw .text):${RELOC_FREE:- none}"
echo "## needs a link:${RELOC_NEEDED:- none}"
[ "$MISMATCH" = "0" ] && echo "## our musl as matches stock on every kata" || echo "## MISMATCH -- our as diverges from stock"
