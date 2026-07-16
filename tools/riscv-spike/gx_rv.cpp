// gx_rv.cpp -- a blinkenlib-shaped C API over libriscv, mirroring
// tools/arm64-toolchain/gx_vixl.cc. If this drives, the Bx-7 -> Bx-10 pattern
// ports a third time: set registers, jump to a symbol, single-step to ret, read
// the result.
//
// ONE REAL DIFFERENCE FROM VIXL. VIXL dereferenced a guest address as a raw
// host pointer, so a guest address WAS a wasm offset and we relocated PT_LOADs
// into a malloc'd base ourselves. libriscv owns its guest memory and takes an
// ELF. That is not a downside here: RISC-V needs the linker anyway (round 1
// measured R_RISCV_RVC_BRANCH/RVC_JUMP on purely LOCAL branches, because of
// linker relaxation -- no aarch64 analogue), and we already build and ship ld.
// So we feed it a linked ELF, which is the natural shape.
//
// API read out of the real headers, not guessed (round 1's Spike probe searched
// for set_XPR/get_XPR, names I invented, and proved nothing):
//   cpu.reg(idx)   -> auto&      (read AND write)
//   cpu.pc()
//   cpu.step_one(bool use_instruction_counter = true)
//   machine.simulate_with(max_instructions, counter, pc)

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include <libriscv/machine.hpp>

using MachineT = riscv::Machine<riscv::RISCV64>;
static MachineT* g_m = nullptr;
static std::vector<uint8_t> g_elf;

extern "C" {

int gx_ptr_bytes() { return (int)sizeof(uintptr_t); }

// Load a LINKED RISC-V ELF. Returns 0 on success.
int gx_load_elf(const uint8_t* data, int len) {
  g_elf.assign(data, data + len);
  try {
    delete g_m;
    riscv::MachineOptions<riscv::RISCV64> opt;
    opt.memory_max = 64ull << 20;
    // No kernel: we drive a bare function, we do not boot anything.
    g_m = new MachineT(g_elf, opt);
  } catch (const std::exception& e) {
    // Reachable only if -fexceptions is on the COMPILE step. Without it the
    // throw never arrives here -- it dies as "table index is out of bounds"
    // inside the invoke_* trampoline, naming a table instead of the real cause.
    std::printf("[gx] load threw: %s\n", e.what());
    std::fflush(stdout);
    g_m = nullptr;
    return -1;
  } catch (...) {
    std::printf("[gx] load threw a non-std exception\n");
    std::fflush(stdout);
    g_m = nullptr;
    return -1;
  }
  return g_m ? 0 : -1;
}

int gx_init() { return g_m ? 0 : -1; }

// Resolve a .globl by name, the way asm-arm64-core.mjs parses the symtab -- but
// libriscv already owns the ELF, so ask it.
uint64_t gx_sym(const char* name) {
  try { return (uint64_t)g_m->address_of(name); } catch (...) { return 0; }
}

void gx_reset() {
  if (!g_elf.empty()) gx_load_elf(g_elf.data(), (int)g_elf.size());
}

uint64_t gx_read_x(int n) { return (uint64_t)g_m->cpu.reg((uint32_t)n); }
void gx_write_x(int n, uint64_t v) { g_m->cpu.reg((uint32_t)n) = v; }
void gx_set_pc(uint64_t pc) { g_m->cpu.jump((MachineT::address_t)pc); }
uint64_t gx_get_pc() { return (uint64_t)g_m->cpu.pc(); }
uint64_t gx_icount() { return g_m->instruction_counter(); }

// One instruction. Non-zero means the guest faulted or finished.
int gx_step() {
  try { g_m->cpu.step_one(true); } catch (const std::exception& e) {
    std::printf("[gx] step: %s\n", e.what());
    std::fflush(stdout);
    return -1;
  }
  return 0;
}

}  // extern "C"
