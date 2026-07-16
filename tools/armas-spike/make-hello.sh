#!/usr/bin/env bash
# make-hello.sh <built-dir> <src.s> <out-dir> <script-dir>
#
# Hello Joe, rebuilt with the NEW musl toolchain -- and this is a real
# regression check, not a repeat: the as/ld that produce it are now musl-linked
# and built from binutils-gdb git HEAD, not the glibc 2.43 pair that made the
# version you ran. Different toolchain, same recipe.
#
# The recipe is settled, by your Pixel, not by qemu:
#   exec            -> e_type: 2 (Android needs ET_DYN)
#   staticpie       -> Could not find a PHDR
#   staticpie-phdr  -> .dynamic offset mismatch
#   dynpie          -> WORKS, exit 55
# So: -pie --dynamic-linker /system/bin/linker64, plus -z max-page-size=4096 for
# the 67160-byte padding (ld defaults to 64K page size on aarch64).
set -uo pipefail
BUILT="${1:?}"; SRC="${2:?}"; OUT="${3:?}"; SDIR="${4:?}"
mkdir -p "$OUT"
RE=aarch64-linux-gnu-readelf

"$BUILT/aarch64-as.elf" "$SRC" -o "$OUT/hello.o" || { echo "## ASSEMBLE FAILED"; exit 1; }
"$BUILT/aarch64-ld.elf" -pie --dynamic-linker /system/bin/linker64 \
  -z max-page-size=4096 "$OUT/hello.o" -o "$OUT/hello-joe" || { echo "## LINK FAILED"; exit 1; }
chmod +x "$OUT/hello-joe"

echo "## size    $(stat -c%s "$OUT/hello-joe") bytes  (was 67160 before max-page-size=4096)"
echo "## e_type  $($RE -h "$OUT/hello-joe" 2>/dev/null | grep -i '^ *Type:' | sed 's/^ *Type: *//')"
FAIL=0
$RE -h "$OUT/hello-joe" 2>/dev/null | grep -qi "DYN" && echo "## e_type    OK ET_DYN" || { echo "## e_type    FAIL"; FAIL=1; }
$RE -l "$OUT/hello-joe" 2>/dev/null | grep -qw PHDR   && echo "## PT_PHDR   present"   || echo "## PT_PHDR   ABSENT -- suspicious"
$RE -l "$OUT/hello-joe" 2>/dev/null | grep -qw INTERP && echo "## PT_INTERP present (wanted)" || { echo "## PT_INTERP ABSENT -- FAIL"; FAIL=1; }
N=$($RE -d "$OUT/hello-joe" 2>/dev/null | grep -c NEEDED || true)
echo "## NEEDED   $N (must be 0 -- nothing for bionic to resolve)"

if command -v qemu-aarch64-static >/dev/null 2>&1; then
  O=$(qemu-aarch64-static "$OUT/hello-joe" 2>&1); RC=$?
  echo "## qemu exit $RC -- necessary, NOT sufficient (qemu passed two binaries the Pixel refused)"
fi

cp "$SDIR/run-all.sh" "$OUT/run-all.sh" 2>/dev/null && chmod +x "$OUT/run-all.sh"
echo "## ON THE PIXEL:"
echo "##   cd ~ && unzip -o ~/storage/downloads/armas-spike.zip"
echo "##   cp armas-out/hello/hello-joe ~/ && chmod +x ~/hello-joe"
echo "##   ~/hello-joe ; echo \$?      # expect the message, then 55"
echo "##   (copy to \$HOME first -- downloads is noexec)"
test "$FAIL" = "0" || { echo "## gates failed"; exit 1; }
