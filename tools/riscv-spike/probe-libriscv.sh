#!/usr/bin/env bash
# probe-libriscv.sh -- READ libriscv's API. Do not guess symbol names.
#
# Round 1 shortlisted libriscv: BSD-3-Clause, 256 files (Spike has 1,961),
# embedding-shaped, and -- the part that matters -- examples/wasm/ already
# exists in-tree. Bx-10 began from "nobody has ever built VIXL to wasm"; this
# begins from "someone already did".
#
# Round 1 also FAILED on Spike, and it is worth being precise about how: it
# probed for set_XPR / get_XPR, got ABSENT, and that proved nothing -- I invented
# those names. Absence of a symbol I made up is not evidence. Same trap as
# grepping for "glibc" and matching binutils' own vocabulary. So this round dumps
# the actual public headers instead of testing a guess.
set -uo pipefail
OUT="${1:?}"; mkdir -p "$OUT"
D="$HOME/rv-libriscv"
[ -d "$D" ] || git clone --depth 1 https://github.com/libriscv/libriscv.git "$D" > "$OUT/clone.log" 2>&1
echo "## libriscv $(git -C "$D" rev-parse HEAD)  $(git -C "$D" log -1 --format=%cd --date=short)"

echo
echo "## ================= 1. THE WASM EXAMPLE (proven >> theoretical) ================="
for f in "$D"/examples/wasm/README.md "$D"/examples/wasm/CMakeLists.txt; do
  [ -f "$f" ] && { echo "---- ${f#$D/}"; head -40 "$f" | sed 's/^/   /'; echo; }
done
find "$D/examples/wasm" -type f 2>/dev/null | sed "s|$D/|   |" | head -12

echo
echo "## ================= 2. THE PUBLIC API -- machine.hpp ================="
echo "## The question is the same one that picked VIXL: can we SET REGISTERS,"
echo "## JUMP TO A SYMBOL, SINGLE-STEP TO ret, and READ THE RESULT?"
# Print the class surface rather than grepping for names I imagined.
sed -n '1,120p' "$D/lib/libriscv/machine.hpp" 2>/dev/null | sed 's/^/   /'

echo
echo "## ---- register access: whatever it is actually called ----"
grep -rn --include=*.hpp -E "\b(cpu|registers?|reg)\s*\(\)" "$D/lib/libriscv/machine.hpp" "$D/lib/libriscv/cpu.hpp" 2>/dev/null | head -12 | sed 's/^/   /'
echo
echo "## ---- the register file type ----"
grep -rn --include=*.hpp -A12 "struct Registers" "$D/lib/libriscv/registers.hpp" 2>/dev/null | head -20 | sed 's/^/   /'
echo
echo "## ---- single-step / simulate signatures ----"
grep -rn --include=*.hpp -E "simulate|step_one|execute_one|void step" "$D/lib/libriscv/machine.hpp" "$D/lib/libriscv/cpu.hpp" 2>/dev/null | head -12 | sed 's/^/   /'
echo
echo "## ---- setup_call / vmcall: does it marshal args like VIXL RunFrom<R,P...>? ----"
grep -rn --include=*.hpp -E "vmcall|setup_call|preempt|address_of" "$D/lib/libriscv/machine.hpp" 2>/dev/null | head -10 | sed 's/^/   /'

echo
echo "## ================= 3. CAN IT AVOID A KERNEL? ================="
echo "## VIXL simulates a CPU and no kernel -- which is what let Bx-10 drive a"
echo "## bare function. libriscv mentions syscalls in 13 files; is that OPTIONAL?"
grep -rn --include=*.hpp --include=*.md -iE "bare.?metal|no.?syscall|freestanding|RISCV_SYSCALLS|minimal" "$D/lib/libriscv" "$D/README.md" 2>/dev/null | head -10 | sed 's/^/   /'
echo
echo "## ---- build options (what can be turned off?) ----"
grep -rn "option(" "$D/lib/CMakeLists.txt" 2>/dev/null | head -20 | sed 's/^/   /'

echo
echo "## ================= 4. MEMORY MODEL ================="
echo "## VIXL dereferenced guest addresses as raw host pointers -- guest address"
echo "## == wasm offset. That is what made relocate-to-a-malloc'd-base work."
echo "## libriscv is likely a flat arena instead. Which changes how .text is loaded."
grep -rn --include=*.hpp -iE "memory_arena|flat|arena|MEMORY_TRAPS|page_t|RISCV_MEMORY" "$D/lib/libriscv/memory.hpp" 2>/dev/null | head -12 | sed 's/^/   /'
echo
echo "## ---- can it load a bare ELF, and does it need PT_INTERP-free static? ----"
grep -rn --include=*.hpp --include=*.cpp -E "binary|elf|load_binary" "$D/lib/libriscv/machine.hpp" 2>/dev/null | head -8 | sed 's/^/   /'

echo
echo "## ================= 5. RV64GC + the C extension ================="
echo "## Round 1 measured: -march=rv64gc compresses AUTOMATICALLY -- plain"
echo "## add a0,a0,a1 / ret came out as two 2-byte instructions. So the emulator"
echo "## MUST decode compressed forms, and insns != bytes/4."
grep -rn --include=*.hpp --include=*.cpp -iE "RISCV_EXT_C|compressed|rv64gc|C extension" "$D/lib/libriscv" 2>/dev/null | head -8 | sed 's/^/   /'
