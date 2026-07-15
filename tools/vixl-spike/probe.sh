#!/usr/bin/env bash
# probe.sh -- read the VIXL header truths the desk research could NOT fetch.
# Runs BEFORE the build so this round-trip yields facts even if emcc fails.
# Never fails the job: every finding is informational.
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
echo "## does simulator-aarch64.h exist?"
test -f "$H" && echo "yes: $H" || { echo "NO -- header path changed, everything below is void"; exit 0; }

echo
echo "## exact signatures the wrapper depends on (research could not confirm these)"
for sym in ReadXRegister WriteXRegister RunFrom WritePc WriteLr ExecuteInstruction IsSimulationFinished ResetState kEndOfSimAddress; do
  echo "---- $sym"
  grep -n -m4 -w "$sym" "$H" 2>/dev/null || echo "  (absent from header)"
done

echo
echo "## LP64 / pointer-width assumptions -- the wasm32 question"
grep -rn "sizeof(uintptr_t)" "$SRC/src" 2>/dev/null | head -20 || echo "  (none)"
echo "---- static asserts mentioning pointer width"
grep -rn "VIXL_STATIC_ASSERT" "$SRC/src" 2>/dev/null | grep -i "uintptr\|pointer\|sizeof(void" | head -20 || echo "  (none)"
echo "---- explicit 64-bit host gates"
grep -rn "__LP64__\|VIXL_ABI\|host is not 64\|64-bit host" "$SRC/src" 2>/dev/null | head -20 || echo "  (none)"

echo
echo "## build-time macros that gate the simulator"
grep -rn "VIXL_INCLUDE_SIMULATOR_AARCH64" "$SRC/src/aarch64/simulator-aarch64.h" 2>/dev/null | head -5 || echo "  (none)"
grep -rn "VIXL_CODE_BUFFER_MMAP\|VIXL_CODE_BUFFER_MALLOC" "$SRC/src" 2>/dev/null | head -10 || echo "  (none)"

echo
echo "## does the sim allocate its guest stack from the host heap?"
grep -rn "GetStack()\|SimStack\|stack_" "$H" 2>/dev/null | head -10 || echo "  (none)"

echo "############ END PROBE ############"
