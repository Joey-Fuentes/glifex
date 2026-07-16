#!/usr/bin/env bash
# make-hello.sh <built-dir> <src.s> <out-dir> <script-dir>
#
# v5. The five-variant hunt is OVER -- the Pixel answered it:
#   exec              -> e_type: 2 (Android needs ET_DYN)
#   staticpie         -> Could not find a PHDR
#   staticpie-phdr    -> .dynamic offset mismatch (my PHDRS block had no
#                        dynamic segment -- half-right hypothesis)
#   dynpie            -> WORKS, exit 55
# So build only the winner, plus -z max-page-size=4096 for the 67160-byte
# padding (ld defaults to 64K page size on aarch64).
#
# This is now a REGRESSION CHECK: the toolchain is being relinked static this
# run, and a static as/ld could plausibly emit different output. Cheap to prove
# it still produces a binary that runs on real hardware.
set -uo pipefail
BUILT="${1:?}"; SRC="${2:?}"; OUT="${3:?}"; SDIR="${4:?}"
mkdir -p "$OUT"

"$BUILT/aarch64-as.elf" "$SRC" -o "$OUT/hello.o" || { echo "## ASSEMBLE FAILED"; exit 1; }

echo "## linking the proven recipe -- dynamic PIE, zero NEEDED libs"
"$BUILT/aarch64-ld.elf" -pie --dynamic-linker /system/bin/linker64 \
  -z max-page-size=4096 "$OUT/hello.o" -o "$OUT/hello-joe" \
  || { echo "## LINK FAILED"; exit 1; }
chmod +x "$OUT/hello-joe"

RE=aarch64-linux-gnu-readelf
echo
echo "## size   $(stat -c%s "$OUT/hello-joe") bytes  (was 67160 before max-page-size=4096)"
echo "## e_type $($RE -h "$OUT/hello-joe" 2>/dev/null | grep -i '^ *Type:' | sed 's/^ *Type: *//')"
$RE -l "$OUT/hello-joe" 2>/dev/null | grep -qw PHDR && echo "## PT_PHDR   present" || echo "## PT_PHDR   ABSENT"
$RE -l "$OUT/hello-joe" 2>/dev/null | grep -qw INTERP && echo "## PT_INTERP present (wanted -- bionic loads it)" || echo "## PT_INTERP ABSENT -- unexpected"
N=$($RE -d "$OUT/hello-joe" 2>/dev/null | grep -c NEEDED || true)
echo "## NEEDED   $N (must be 0 -- nothing for the linker to resolve)"

if command -v qemu-aarch64-static >/dev/null 2>&1; then
  O=$(qemu-aarch64-static "$OUT/hello-joe" 2>&1); RC=$?
  echo "## qemu exit $RC (necessary, NOT sufficient -- qemu passed two binaries Android refused)"
fi

cp "$SDIR/run-all.sh" "$OUT/run-all.sh" 2>/dev/null && chmod +x "$OUT/run-all.sh"
echo "## on the Pixel: cp armas-out/hello/hello-joe ~/ && chmod +x ~/hello-joe && ~/hello-joe ; echo \$?"
exit 0
