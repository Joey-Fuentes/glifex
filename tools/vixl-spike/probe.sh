#!/usr/bin/env bash
# probe.sh -- read the VIXL header truths the desk research could NOT fetch.
# Runs BEFORE the build so this round-trip yields facts even if emcc fails.
# Never fails the job: every finding is informational.
#
# v2 adds the macro-gate inventory. Run 1 taught us VIXL gates headers with
# #error and clang stops at the first, so enumerate ALL gates up front.
set -uo pipefail

SRC="${1:?usage: probe.sh <vixl-src-dir>}"
H="$SRC/src/aarch64/simulator-aarch64.h"

echo "############ VIXL PROBE ############"
echo "## pinned commit"
git -C "$SRC" rev-parse HEAD 2>/dev/null || echo "(no git)"
git -C "$SRC" log -1 --date=short --format='%cd %s' 2>/dev/null || true

echo
echo "## LICENSE first lines"
head -5 "$SRC/LICENCE" 2>/dev/null || head -5 "$SRC/LICENSE" 2>/dev/null || echo "(not found)"

echo
echo "## ================= MACRO GATES (the run-1 lesson) ================="
echo "## every #error in the tree -- these are the gates that cost round trips"
grep -rn "#error" "$SRC/src" 2>/dev/null | head -40 || echo "  (none)"
echo
echo "## every VIXL_INCLUDE_* / VIXL_GENERATE_* token defined or tested"
grep -rho "VIXL_INCLUDE_[A-Z0-9_]*\|VIXL_GENERATE_[A-Z0-9_]*" "$SRC/src" 2>/dev/null | sort -u || echo "  (none)"
echo
echo "## what the canonical scons build defines for target=a64"
grep -rn "VIXL_INCLUDE\|CPPDEFINES\|target" "$SRC/SConstruct" 2>/dev/null | head -30 || echo "  (no SConstruct)"

echo
echo "## ================= SIMULATOR API ================="
test -f "$H" && echo "header: $H" || { echo "NO simulator-aarch64.h -- path changed, rest is void"; exit 0; }
for sym in ReadXRegister WriteXRegister RunFrom WritePc WriteLr ExecuteInstruction IsSimulationFinished ResetState kEndOfSimAddress; do
  echo "---- $sym"
  grep -n -m4 -w "$sym" "$H" 2>/dev/null || echo "  (absent from header)"
done

echo
echo "## ================= LP64 / POINTER WIDTH ================="
echo "## the wasm32 question -- run 1 did NOT rule wasm32 out"
grep -rn "sizeof(uintptr_t)" "$SRC/src" 2>/dev/null | head -20 || echo "  (none)"
echo "---- static asserts about pointer width"
grep -rn "VIXL_STATIC_ASSERT" "$SRC/src" 2>/dev/null | grep -i "uintptr\|pointer\|sizeof(void" | head -20 || echo "  (none)"
echo "---- explicit 64-bit host gates"
grep -rn "__LP64__\|host is not 64\|64-bit host" "$SRC/src" 2>/dev/null | head -20 || echo "  (none)"

echo
echo "## ================= CODE BUFFER / MMAP ================="
grep -rn "VIXL_CODE_BUFFER_MMAP\|VIXL_CODE_BUFFER_MALLOC" "$SRC/src" 2>/dev/null | head -10 || echo "  (none)"

echo
echo "## ================= GUEST STACK ================="
grep -rn "GetStack()\|SimStack\|stack_" "$H" 2>/dev/null | head -10 || echo "  (none)"

echo "############ END PROBE ############"
