#!/usr/bin/env bash
# make-hello.sh <built-dir> <src.s> <out-dir> <script-dir>
#
# v4. DIAGNOSTIC-FIRST, not fix-first.
#
# History on this one binary: v2 shipped ET_EXEC (Pixel: "unexpected e_type: 2").
# v3 fixed e_type, Pixel then said "Could not find a PHDR: broken executable?".
# Each time I reasoned instead of looking. So this build stops guessing: it
# produces FIVE variants, dumps the real program headers for each, and lets the
# phone -- the only oracle that counts -- decide. qemu passes all of them and is
# therefore useless for this question.
set -uo pipefail

BUILT="${1:?}"; SRC="${2:?}"; OUT="${3:?}"; SDIR="${4:?}"
mkdir -p "$OUT"

AS="$BUILT/aarch64-as.elf"; LD="$BUILT/aarch64-ld.elf"
RE=aarch64-linux-gnu-readelf

"$AS" "$SRC" -o "$OUT/hello.o" || { echo "## ASSEMBLE FAILED"; exit 1; }

link() { # name, then ld args
  n="$1"; shift
  if "$LD" "$@" "$OUT/hello.o" -o "$OUT/hello-joe-$n" 2> "$OUT/link-$n.err"; then
    chmod +x "$OUT/hello-joe-$n"; echo "## linked $n  ($(stat -c%s "$OUT/hello-joe-$n") bytes)"
  else
    echo "## LINK FAILED $n"; sed 's/^/    /' "$OUT/link-$n.err" | head -5
  fi
}

echo "## ---- building five variants ----"
# A: control. Known to fail (e_type 2). Proves the phone still rejects it.
link exec
# B: v3. Known to fail (no PHDR?).
link staticpie -static -pie --no-dynamic-linker
# C: THE HYPOTHESIS -- force PT_PHDR via an explicit PHDRS block.
link staticpie-phdr -static -pie --no-dynamic-linker -T "$SDIR/phdr.ld"
# D: the other angle -- give it an INTERP so bionic's linker loads it. ld emits
#    PT_PHDR when INTERP exists. No NEEDED libs, so the linker has nothing to
#    resolve; it should relocate nothing and jump to _start.
link dynpie -pie --dynamic-linker /system/bin/linker64
# E: C plus the size fix. 67160 bytes was ld's 64K default max-page-size padding.
link staticpie-phdr-4k -static -pie --no-dynamic-linker -z max-page-size=4096 -T "$SDIR/phdr.ld"

echo
echo "## ================= WHAT EACH VARIANT ACTUALLY IS ================="
echo "## (semantic checks -- NOT string-matching file(1)'s prose, which has now"
echo "##  lied in both directions: it passed a binary Android refused, then"
echo "##  failed a binary that was correct. INTERP/NEEDED/PHDR come from readelf.)"
for v in exec staticpie staticpie-phdr dynpie staticpie-phdr-4k; do
  P="$OUT/hello-joe-$v"
  test -f "$P" || continue
  echo
  echo "---- $v  ($(stat -c%s "$P") bytes)"
  echo "  e_type    $($RE -h "$P" 2>/dev/null | grep -i '^ *Type:' | sed 's/^ *Type: *//')"
  if $RE -l "$P" 2>/dev/null | grep -qw PHDR;   then echo "  PT_PHDR   present"; else echo "  PT_PHDR   ABSENT"; fi
  if $RE -l "$P" 2>/dev/null | grep -qw INTERP; then echo "  PT_INTERP present -> $($RE -l "$P" 2>/dev/null | grep -A1 INTERP | grep -o '/[^]]*' | head -1)"; else echo "  PT_INTERP none"; fi
  N=$($RE -d "$P" 2>/dev/null | grep -c NEEDED || true);  echo "  NEEDED    $N"
  R=$($RE -r "$P" 2>/dev/null | grep -c R_AARCH64 || true); echo "  relocs    $R"
  echo "  program headers:"
  $RE -l "$P" 2>/dev/null | sed -n '/Program Headers/,/Section to Segment/p' | head -12 | sed 's/^/    /'
done

echo
echo "## ================= qemu (expected to pass ALL -- that is the point) ====="
for v in exec staticpie staticpie-phdr dynpie staticpie-phdr-4k; do
  P="$OUT/hello-joe-$v"; test -f "$P" || continue
  if command -v qemu-aarch64-static >/dev/null 2>&1; then
    O=$(qemu-aarch64-static "$P" 2>&1); RC=$?
    echo "  $v -> exit $RC"
  fi
done
echo "## qemu enforces neither PIE nor PHDR. It agreed with v2 and v3 and was"
echo "## wrong about both. Treat green qemu as NECESSARY, NOT SUFFICIENT."

cp "$SDIR/run-all.sh" "$OUT/run-all.sh" 2>/dev/null && chmod +x "$OUT/run-all.sh"

echo
echo "## ================= ON THE PIXEL ================="
echo "##   cd ~ && unzip -o ~/storage/downloads/armas-spike.zip"
echo "##   cp armas-out/hello/hello-joe-* armas-out/hello/run-all.sh ~/"
echo "##   cd ~ && sh run-all.sh"
echo "##   (copy to \$HOME first -- downloads is noexec)"
echo "## Expect: exec fails, and AT LEAST ONE of the others prints and exits 55."
exit 0
