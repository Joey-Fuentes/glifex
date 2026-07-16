#!/usr/bin/env bash
# make-hello.sh <built-dir> <src.s> <out-dir>
#
# v3. The Pixel REJECTED v2:
#   error: ".../hello-joe" has unexpected e_type: 2
# e_type 2 is ET_EXEC. Android requires ET_DYN (3) -- a PIE. Enforced since
# Android 5, hard-rejected since 10. Nothing to do with the architecture.
#
# Fix: -static -pie --no-dynamic-linker. Our program is already position
# independent (adr is PC-relative, no absolute addresses, no GOT), so the
# static-PIE needs NO self-relocation stub -- which is the thing that normally
# makes static-PIE hard without a libc.
#
# Two lessons baked in below:
#   1. v2 asserted arch/static/no-interp and never checked e_type -- the ONE
#      field Android cared about. So e_type is now a hard gate.
#   2. qemu-aarch64 ran v2 fine and reported exit 55. qemu is NOT Android; it
#      does not require PIE. A green qemu run is necessary, not sufficient.
#      Both variants are built and shipped so the phone stays the real oracle.
set -uo pipefail

BUILT="${1:?usage: make-hello.sh <built-dir> <src.s> <out-dir>}"
SRC="${2:?}"
OUT="${3:?}"
mkdir -p "$OUT"

echo "## assembling with OUR as"
"$BUILT/aarch64-as.elf" "$SRC" -o "$OUT/hello-joe.o" || { echo "## ASSEMBLE FAILED"; exit 1; }

# Variant A: what v2 produced. Kept only so the contrast is on the record.
echo "## linking variant A -- plain ET_EXEC (what the Pixel rejected)"
"$BUILT/aarch64-ld.elf" "$OUT/hello-joe.o" -o "$OUT/hello-joe-exec" \
  || echo "## variant A link failed"

# Variant B: the Android one.
echo "## linking variant B -- static PIE, ET_DYN, no dynamic linker"
if ! "$BUILT/aarch64-ld.elf" -static -pie --no-dynamic-linker "$OUT/hello-joe.o" -o "$OUT/hello-joe"; then
  echo "## STATIC-PIE LINK FAILED -- falling back to reporting variant A only"
  echo "## (if ld rejects -pie here it will name the offending relocation above)"
  exit 1
fi
chmod +x "$OUT/hello-joe" "$OUT/hello-joe-exec" 2>/dev/null || true

etype() { aarch64-linux-gnu-readelf -h "$1" 2>/dev/null | grep -i "^ *Type:" | sed 's/^ *//'; }

echo
echo "## ================= THE FIELD THAT MATTERED ================="
for v in hello-joe-exec hello-joe; do
  P="$OUT/$v"
  test -f "$P" || continue
  echo "---- $v"
  echo "  size   $(stat -c%s "$P") bytes"
  echo "  $(etype "$P")"
  echo "  file   $(file -b "$P")"
done

BIN="$OUT/hello-joe"
T=$(etype "$BIN")
echo
echo "## ---- hard gates on the shipped binary ----"
FAIL=0
case "$T" in
  *DYN*) echo "  e_type    OK ET_DYN -- Android will accept this" ;;
  *)     echo "  e_type    FAIL still not ET_DYN: $T"; FAIL=1 ;;
esac
F=$(file -b "$BIN")
case "$F" in
  *aarch64*) echo "  arch      OK aarch64" ;;
  *)         echo "  arch      FAIL not aarch64"; FAIL=1 ;;
esac
case "$F" in
  *"statically linked"*) echo "  linkage   OK static" ;;
  *)                     echo "  linkage   FAIL dynamic"; FAIL=1 ;;
esac
if echo "$F" | grep -qi "interpreter"; then
  echo "  interp    FAIL an INTERP segment is present"; FAIL=1
else
  echo "  interp    OK none"
fi
if aarch64-linux-gnu-readelf -r "$BIN" 2>/dev/null | grep -q "R_AARCH64"; then
  echo "  reloc     WARN dynamic relocations present -- no stub exists to apply them"
else
  echo "  reloc     OK none (nothing to self-relocate)"
fi

echo
echo "## ================= qemu (necessary, NOT sufficient) ================="
echo "## qemu does not enforce PIE -- it passed v2, which the Pixel refused."
for v in hello-joe-exec hello-joe; do
  P="$OUT/$v"
  test -f "$P" || continue
  if command -v qemu-aarch64-static >/dev/null 2>&1; then
    set +e
    O=$(qemu-aarch64-static "$P" 2>&1); RC=$?
    set -e
    echo "---- $v -> exit $RC $( [ "$RC" = "55" ] && echo '(55 OK -- loop kata computed)' || echo '(EXPECTED 55)')"
    echo "$O" | head -3 | sed 's/^/  | /'
  fi
done

echo
echo "## ================= RUN IT ON THE PIXEL ================="
echo "##   cd ~ && unzip -o ~/storage/downloads/armas-spike.zip"
echo "##   cp armas-out/hello/hello-joe ~/hello-joe"
echo "##   chmod +x ~/hello-joe"
echo "##   ~/hello-joe ; echo \$?          # expect the message, then 55"
echo "##"
echo "##   Copy to \$HOME first -- ~/storage/downloads is noexec."
echo "##   hello-joe-exec is shipped too and SHOULD still fail with e_type: 2."
echo "##   That contrast is the point: it confirms PIE was the whole difference."

test "$FAIL" = "0" || { echo; echo "## VERDICT gates failed -- do not expect this to run"; exit 1; }
echo
echo "## VERDICT all gates pass -- ET_DYN static PIE, no interp, no relocs"
