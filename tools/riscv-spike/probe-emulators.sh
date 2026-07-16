#!/usr/bin/env bash
# probe-emulators.sh -- read the RISC-V emulator candidates. Do not reason about
# them.
#
# THE DECISIVE CRITERION, the same one that picked VIXL over arm-sandbox for
# Bx-10: can we SET REGISTERS, JUMP TO A SYMBOL, SINGLE-STEP TO ret, and READ
# THE RESULT? That is the blinkenlib pattern web/asm-x86-blink.mjs already
# drives and web/asm-arm64-core.mjs reuses. A candidate that can only "load an
# ELF and run it to completion with syscalls" is the HEAVY path -- it needs an
# ELF loader plus a syscall harness, and it changes the cost of the track
# entirely. arm-sandbox lost on exactly this.
#
# NOT the criterion: "can it boot Linux". That is the opposite of what we want.
#
# Prior art worth honouring: for Bx-10 the desk research recommended a candidate
# whose header it had never read, and was wrong three times over about LP64.
# Everything below is grepped out of actual source at a recorded commit.
set -uo pipefail

OUT="${1:?usage: probe-emulators.sh <out-dir>}"
mkdir -p "$OUT"

probe() {
  NAME="$1"; URL="$2"; shift 2
  echo
  echo "############################################################"
  echo "## $NAME"
  echo "############################################################"
  D="$HOME/rv-$NAME"
  if [ ! -d "$D" ]; then
    git clone --depth 1 "$URL" "$D" > "$OUT/clone-$NAME.log" 2>&1 || {
      echo "## CLONE FAILED -- $URL"; tail -3 "$OUT/clone-$NAME.log"; return; }
  fi
  echo "## commit  $(git -C "$D" rev-parse HEAD)"
  echo "## date    $(git -C "$D" log -1 --format=%cd --date=short)"
  echo "## size    $(du -sh "$D" 2>/dev/null | cut -f1)   files: $(find "$D" -name '*.c' -o -name '*.cc' -o -name '*.cpp' -o -name '*.h' -o -name '*.hpp' 2>/dev/null | wc -l)"
  echo
  echo "## ---- LICENSE (the first thing that can disqualify it) ----"
  for f in LICENSE LICENSE.txt LICENCE COPYING LICENSE.md; do
    [ -f "$D/$f" ] && { head -4 "$D/$f" | sed 's/^/   /'; break; }
  done
  echo
  echo "## ---- THE DECISIVE API: register set/get, step, PC ----"
  for sym in "$@"; do
    printf "   %-22s " "$sym"
    N=$(grep -rl --include=*.h --include=*.hpp --include=*.cc --include=*.cpp --include=*.c -w "$sym" "$D" 2>/dev/null | head -1)
    if [ -n "$N" ]; then echo "found in ${N#$D/}"; else echo "ABSENT"; fi
  done
  echo
  echo "## ---- does it want a KERNEL? (syscalls == the heavy path) ----"
  echo "   syscall mentions: $(grep -rl --include=*.c --include=*.cc --include=*.h "syscall" "$D" 2>/dev/null | wc -l) files"
  echo "   mmap mentions:    $(grep -rl --include=*.c --include=*.cc --include=*.h "mmap" "$D" 2>/dev/null | wc -l) files"
  echo
  echo "## ---- has anyone built it to wasm? (proven >> theoretical) ----"
  grep -rli "emscripten\|wasm\|__EMSCRIPTEN__" "$D" --include=*.md --include=*.h --include=*.c --include=*.cc --include=CMakeLists.txt --include=Makefile 2>/dev/null | head -4 | sed 's/^/   /'
  echo
  echo "## ---- #error macro gates (Bx-10 lost a round trip to one) ----"
  grep -rn --include=*.h --include=*.hpp "#error" "$D" 2>/dev/null | head -5 | sed 's/^/   /'
  echo
  echo "## ---- host assumptions: pointer width / LP64 ----"
  grep -rn --include=*.h --include=*.hpp "sizeof(uintptr_t)\|__LP64__\|64-bit host" "$D" 2>/dev/null | head -4 | sed 's/^/   /'
}

# Spike -- the golden reference model. Positional analogue of VIXL: the ISA
# owner's own simulator, which is exactly what made VIXL the right call.
probe spike https://github.com/riscv-software-src/riscv-isa-sim.git \
  set_XPR get_XPR step run set_pc get_pc processor_t

# libriscv -- purpose-built for EMBEDDING, which is precisely our shape.
probe libriscv https://github.com/libriscv/libriscv.git \
  set_pc reg cpu simulate step machine_t

# TinyEMU -- Bellard, MIT, RISC-V is its native target. Suspected too
# machine-oriented (kernel + devices) but cheap to check.
probe tinyemu https://github.com/fernandotcl/TinyEMU.git \
  riscv_cpu_interp set_reg get_reg riscv_cpu_init

echo
echo "############################################################"
echo "## READ THIS AS: whichever exposes register set/get + single-step is the"
echo "## VIXL of this track. One that only runs whole ELFs with syscalls is the"
echo "## arm-sandbox of it -- workable, but a different and much larger project."
echo "############################################################"
