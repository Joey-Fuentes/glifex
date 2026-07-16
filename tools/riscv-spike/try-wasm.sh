#!/usr/bin/env bash
# try-wasm.sh -- actually BUILD libriscv to wasm and run an RV64GC kata on it.
#
# Round 1's whole shortlist rests on "examples/wasm/ exists in-tree". That is a
# claim about a directory listing, not about a working build. Bx-10's research
# said VIXL needed an LP64 host and was wrong three times over -- the only thing
# that settled it was compiling the thing. So compile the thing.
#
# Success here means the RISC-V track starts from a proven emulator instead of a
# promising one. Failure is equally useful and much cheaper than finding out in
# three PRs' time.
set -uo pipefail
OUT="${1:?}"; mkdir -p "$OUT"
D="$HOME/rv-libriscv"
. "$EMSDK/emsdk_env.sh" >/dev/null 2>&1 || true
echo "## emcc: $(emcc --version | head -1)"

echo
echo "## ---- 1. their own wasm example, on their own terms ----"
if [ -d "$D/examples/wasm" ]; then
  cd "$D/examples/wasm"
  ( emcmake cmake -B "$OUT/wasmbuild" -DCMAKE_BUILD_TYPE=Release . > "$OUT/wasm-cmake.log" 2>&1 \
    && cmake --build "$OUT/wasmbuild" -j"$(nproc)" > "$OUT/wasm-build.log" 2>&1 ) \
    && { echo "## THEIR EXAMPLE BUILT"; find "$OUT/wasmbuild" -name "*.wasm" -o -name "*.js" | head -5 | sed 's/^/   /'; } \
    || { echo "## their example FAILED to build"; grep -iE "error|CMake Error" "$OUT/wasm-cmake.log" "$OUT/wasm-build.log" 2>/dev/null | head -8 | sed 's/^/   /'; }
else
  echo "## no examples/wasm directory"
fi

echo
echo "## ---- 2. OUR shape: a blinkenlib-style C API over the library ----"
echo "## Mirrors tools/arm64-toolchain/gx_vixl.cc -- if this compiles and runs,"
echo "## the Bx-7/Bx-10 driving pattern ports a third time."
cat > "$OUT/gx_rv.cpp" <<'CPP'
#include <cstdint>
#include <cstdio>
#include <libriscv/machine.hpp>

using MachineT = riscv::Machine<riscv::RISCV64>;
static MachineT* g_m = nullptr;
static std::vector<uint8_t> g_bin;

extern "C" {
int gx_ptr_bytes() { return (int)sizeof(uintptr_t); }

// Load a raw .text blob at a chosen guest address, no ELF, no kernel.
int gx_init(uint64_t base, const uint8_t* code, int len) {
  g_bin.assign(code, code + len);
  try {
    riscv::MachineOptions<riscv::RISCV64> opt;
    opt.memory_max = 64ull << 20;
    g_m = new MachineT(g_bin, opt);
  } catch (const std::exception& e) {
    std::printf("[gx] ctor threw: %s\n", e.what());
    return -1;
  }
  return g_m ? 0 : -1;
}
uint64_t gx_read_x(int n) { return g_m->cpu.reg(n); }
void gx_write_x(int n, uint64_t v) { g_m->cpu.reg(n) = v; }
void gx_set_pc(uint64_t pc) { g_m->cpu.jump(pc); }
uint64_t gx_get_pc() { return g_m->cpu.pc(); }
int gx_step() {
  try { g_m->cpu.step_one(); } catch (...) { return -1; }
  return 0;
}
}
CPP
emcc "$OUT/gx_rv.cpp" -I "$D/lib" -std=c++20 -O2 -fexceptions \
  -sSTACK_SIZE=8388608 -sINITIAL_MEMORY=67108864 -sALLOW_MEMORY_GROWTH=1 \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node \
  -sEXPORTED_FUNCTIONS=_gx_init,_gx_read_x,_gx_write_x,_gx_set_pc,_gx_get_pc,_gx_step,_gx_ptr_bytes,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,HEAPU8 \
  -o "$OUT/gx_rv.mjs" > "$OUT/gx-build.log" 2>&1 \
  && { echo "## OUR WRAPPER BUILT: $(stat -c%s "$OUT/gx_rv.wasm") bytes"; } \
  || { echo "## our wrapper FAILED -- this is the real signal, read it:"; grep -iE "error" "$OUT/gx-build.log" | head -12 | sed 's/^/   /'; }
