#!/usr/bin/env bash
# compare.sh <built-dir> <kata-dir> <out-dir>
#
# Two questions, both answered WITHOUT Blink (cheap, and they gate everything):
#
# 1. Does our static as produce the SAME bytes as Debian's stock aarch64 as?
#    If yes, the build is trustworthy and CI's native `as` remains valid ground
#    truth for every later test.
# 2. Which katas carry RELOCATIONS? That is the real design boundary. VIXL's
#    guest addresses are malloc'd wasm offsets, so it can only execute
#    position-independent .text lifted straight out of a .o. Any kata needing a
#    link + fixed vaddr is a kata the browser track cannot run as-is.
set -uo pipefail

BUILT="${1:?}"; KATAS="${2:?}"; OUT="${3:?}"
mkdir -p "$OUT"

echo "## ================= STOCK vs BUILT =================" 
echo "## debian stock as"
aarch64-linux-gnu-as --version | head -1
echo "  file $(file -b "$(command -v aarch64-linux-gnu-as)")"
echo "## our built as"
"$BUILT/aarch64-as.elf" --version | head -1

MISMATCH=0
RELOC_FREE=""
RELOC_NEEDED=""

for f in "$KATAS"/*.s; do
  b=$(basename "$f" .s)
  echo
  echo "## ---------------- kata: $b ----------------"

  aarch64-linux-gnu-as "$f" -o "$OUT/$b.stock.o" 2> "$OUT/$b.stock.err" || { echo "  STOCK ASSEMBLE FAILED"; cat "$OUT/$b.stock.err"; continue; }
  "$BUILT/aarch64-as.elf" "$f" -o "$OUT/$b.built.o" 2> "$OUT/$b.built.err" || { echo "  BUILT ASSEMBLE FAILED"; cat "$OUT/$b.built.err"; MISMATCH=1; continue; }

  # .text only -- that is what VIXL would execute.
  aarch64-linux-gnu-objcopy -O binary --only-section=.text "$OUT/$b.stock.o" "$OUT/$b.stock.text.bin"
  aarch64-linux-gnu-objcopy -O binary --only-section=.text "$OUT/$b.built.o" "$OUT/$b.built.text.bin"

  SS=$(sha256sum "$OUT/$b.stock.text.bin" | cut -d' ' -f1)
  BS=$(sha256sum "$OUT/$b.built.text.bin" | cut -d' ' -f1)
  echo "  .text stock  $(stat -c%s "$OUT/$b.stock.text.bin") bytes  $SS"
  echo "  .text built  $(stat -c%s "$OUT/$b.built.text.bin") bytes  $BS"
  if [ "$SS" = "$BS" ]; then
    echo "  BYTE-IDENTICAL yes"
  else
    echo "  BYTE-IDENTICAL NO -- our as diverges from stock"
    MISMATCH=1
  fi

  # The boundary question.
  R=$(aarch64-linux-gnu-objdump -r "$OUT/$b.stock.o" 2>/dev/null | grep -c "R_AARCH64" || true)
  echo "  relocations in .o: $R"
  if [ "$R" = "0" ]; then
    echo "  VERDICT position-independent -- VIXL can execute this .text directly"
    RELOC_FREE="$RELOC_FREE $b"
  else
    echo "  VERDICT NEEDS A LINK -- and then wants a fixed vaddr VIXL cannot give"
    aarch64-linux-gnu-objdump -r "$OUT/$b.stock.o" 2>/dev/null | grep "R_AARCH64" | head -5 | sed 's/^/    /'
    RELOC_NEEDED="$RELOC_NEEDED $b"
  fi

  echo "  disassembly:"
  aarch64-linux-gnu-objdump -d "$OUT/$b.stock.o" 2>/dev/null | tail -n +6 | sed 's/^/    /' | head -12
done

echo
echo "## ================= SUMMARY ================="
echo "## reloc-free (browser-runnable as raw .text):${RELOC_FREE:- none}"
echo "## needs link (the design boundary):${RELOC_NEEDED:- none}"
if [ "$MISMATCH" = "0" ]; then
  echo "## BUILT AS MATCHES STOCK on every kata -- build is trustworthy"
else
  echo "## BUILT AS DIVERGES -- do not trust it yet"
fi
