#!/usr/bin/env bash
# make-hello.sh <built-dir> <src.s> <out-dir>
#
# Assemble + link hello-joe.s using OUR CI-built toolchain (not Debian's), and
# prove the result executes BEFORE it ever reaches a phone.
#
# Why this is a real test and not a toy: byte-diffing our as against stock shows
# we AGREE with stock. It does not show either of us emits code that RUNS. This
# does, end to end, and it exercises ld -- which we may yet drop from the
# browser track.
set -uo pipefail

BUILT="${1:?usage: make-hello.sh <built-dir> <src.s> <out-dir>}"
SRC="${2:?}"
OUT="${3:?}"
mkdir -p "$OUT"

BIN="$OUT/hello-joe"

echo "## assembling with OUR as"
"$BUILT/aarch64-as.elf" "$SRC" -o "$OUT/hello-joe.o" || { echo "## ASSEMBLE FAILED"; exit 1; }

echo "## linking with OUR ld (static, no libc, entry _start)"
"$BUILT/aarch64-ld.elf" "$OUT/hello-joe.o" -o "$BIN" || { echo "## LINK FAILED"; exit 1; }
chmod +x "$BIN"

echo
echo "## ================= WHAT DID WE PRODUCE? ================="
echo "## size  $(stat -c%s "$BIN") bytes"
echo "## file  $(file -b "$BIN")"

# Each of these is a precondition for running in Termux. Assert, do not assume.
F=$(file -b "$BIN")
case "$F" in
  *aarch64*) echo "## arch      OK aarch64 (the Pixel can execute this)" ;;
  *)         echo "## arch      WRONG -- not aarch64" ;;
esac
case "$F" in
  *"statically linked"*) echo "## linkage   OK static (no loader, no libc needed)" ;;
  *)                     echo "## linkage   DYNAMIC -- will likely fail on Android" ;;
esac
if echo "$F" | grep -q "interpreter"; then
  echo "## interp    PRESENT -- bad, Android's loader path will not match"
else
  echo "## interp    OK none"
fi

echo
echo "## ELF header"
aarch64-linux-gnu-readelf -h "$BIN" 2>/dev/null | grep -i "class\|machine\|type\|entry" | sed 's/^/  /'

echo
echo "## disassembly of _start"
aarch64-linux-gnu-objdump -d "$BIN" 2>/dev/null | sed -n '/<_start>:/,/^$/p' | head -20 | sed 's/^/  /'

echo
echo "## ================= PROOF IT RUNS (qemu-aarch64) ================="
if command -v qemu-aarch64-static >/dev/null 2>&1; then
  set +e
  OUTPUT=$(qemu-aarch64-static "$BIN" 2>&1)
  RC=$?
  set -e
  echo "$OUTPUT" | sed 's/^/  | /'
  echo "## exit status: $RC"
  if [ "$RC" = "55" ]; then
    echo "## VERDICT RUNS CORRECTLY -- exit 55 means the loop kata computed sum-of-squares 1..5"
  else
    echo "## VERDICT exit status is $RC, expected 55 -- the ALU path is wrong"
  fi
else
  echo "## qemu-aarch64-static not installed -- cannot verify here"
fi

echo
echo "## ================= HOW TO RUN IT ON THE PIXEL ================="
echo "##   Download the artifact, then in Termux:"
echo "##     cd ~ && unzip -o ~/storage/downloads/armas-spike.zip"
echo "##     cp hello/hello-joe ~/hello-joe"
echo "##     chmod +x ~/hello-joe"
echo "##     ~/hello-joe ; echo \$?"
echo "##   Copy to \$HOME first -- ~/storage/downloads is on external storage and"
echo "##   is mounted noexec, so running it in place fails with Permission denied."
