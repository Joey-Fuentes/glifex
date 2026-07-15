#!/usr/bin/env bash
# probe.sh <vixl-src-dir>
# Read the VIXL truths that reasoning cannot supply. Never fails the job.
#
# v3 focus: SimStack. gx_init() traps at "memory access out of bounds" in BOTH
# memory models, so pointer width is exonerated and the guest-stack allocator
# is the prime suspect (emscripten cannot do mmap PROT_NONE guard pages).
set -uo pipefail

SRC="${1:?usage: probe.sh <vixl-src-dir>}"
H="$SRC/src/aarch64/simulator-aarch64.h"
C="$SRC/src/aarch64/simulator-aarch64.cc"

echo "############ VIXL PROBE ############"
echo "## commit"
git -C "$SRC" rev-parse HEAD 2>/dev/null || echo "(no git)"
git -C "$SRC" log -1 --date=short --format='%cd %s' 2>/dev/null || true
echo "## origin"
git -C "$SRC" remote get-url origin 2>/dev/null || echo "(none)"

echo
echo "## LICENCE (first 20 lines -- v2 truncated this to the banner)"
head -20 "$SRC/LICENCE" 2>/dev/null || head -20 "$SRC/LICENSE" 2>/dev/null || echo "(not found)"

echo
echo "## ================= SIMSTACK -- THE PRIME SUSPECT ================="
echo "## does VIXL use mmap anywhere in the simulator?"
grep -rn "mmap\|munmap\|PROT_NONE\|MAP_FAILED\|mprotect" "$SRC/src" 2>/dev/null | head -20 || echo "  (no mmap anywhere -- suspect moves elsewhere)"
echo
echo "## SimStack class declaration"
sed -n '85,175p' "$H" 2>/dev/null || echo "  (header not found)"
echo
echo "## SimStack::Allocate implementation"
grep -n -A40 "SimStack::Allocated SimStack::Allocate\|SimStack::Allocate()" "$C" 2>/dev/null | head -60 || echo "  (not found in .cc -- likely inline in the header)"

echo
echo "## ================= MACRO GATES ================="
grep -rn "#error" "$SRC/src" 2>/dev/null | head -40 || echo "  (none)"
echo "## VIXL_INCLUDE_* / VIXL_GENERATE_* tokens"
grep -rho "VIXL_INCLUDE_[A-Z0-9_]*\|VIXL_GENERATE_[A-Z0-9_]*" "$SRC/src" 2>/dev/null | sort -u || echo "  (none)"

echo
echo "## ================= SIMULATOR API ================="
for sym in ReadXRegister WriteXRegister RunFrom WritePc ExecuteInstruction IsSimulationFinished ResetState kEndOfSimAddress; do
  echo "---- $sym"
  grep -n -m3 -w "$sym" "$H" 2>/dev/null || echo "  (absent)"
done
echo "---- Simulator constructors"
grep -n -m6 "Simulator(" "$H" 2>/dev/null || echo "  (absent)"

echo
echo "## ================= POINTER WIDTH (exonerated, kept for the record) ====="
grep -rn "Unsupported host pointer size" -B8 "$SRC/src/globals-vixl.h" 2>/dev/null | head -20 || echo "  (not found)"

echo "############ END PROBE ############"
