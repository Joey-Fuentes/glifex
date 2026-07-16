// gx_rv.cpp -- a blinkenlib-shaped C API over libriscv, mirroring
// tools/arm64-toolchain/gx_vixl.cc. PROVEN: this exact file drives RV64GC in
// wasm32 -- add=12, loop=55, auipc=0x1122334455667788.
//
// API read out of libriscv's real headers (an earlier probe searched for
// set_XPR/get_XPR -- names I invented -- and proved nothing):
//   cpu.reg(idx)   -> auto&    read AND write
//   cpu.jump(pc) / cpu.pc()
//   cpu.step_one(bool use_instruction_counter = true)   VIXL's ExecuteInstruction
//   machine.address_of(name)                            symbol lookup, no symtab parsing
//   machine.instruction_counter()                       the det-tier metric, FREE
//
// DIFFERENCE FROM VIXL, and it suits RISC-V better: VIXL dereferenced a guest
// address as a raw host pointer, so we relocated PT_LOADs into a malloc'd base
// ourselves. libriscv owns its memory and takes an ELF. RISC-V needs the linker
// regardless -- even local branches carry R_RISCV_RVC_BRANCH/RVC_JUMP because of
// linker relaxation, which has no aarch64 analogue -- and we already ship ld.
#include <cstdint>
#include <cstdio>
#include <string>
#include <vector>
#include <libriscv/machine.hpp>

using MachineT = riscv::Machine<riscv::RISCV64>;
static MachineT* g_m = nullptr;
static std::vector<uint8_t> g_elf;

extern "C" {

int gx_ptr_bytes() { return (int)sizeof(uintptr_t); }

int gx_load_elf(const uint8_t* data, int len) {
  g_elf.assign(data, data + len);
  try {
    delete g_m;
    g_m = nullptr;
    riscv::MachineOptions<riscv::RISCV64> opt;
    opt.memory_max = 64ull << 20;
    g_m = new MachineT(g_elf, opt);
  } catch (const std::exception& e) {
    // Reachable only with -fexceptions on the COMPILE step. Without it the throw
    // dies as "table index is out of bounds" inside an invoke_* trampoline,
    // naming a table instead of the actual cause. That cost a round trip.
    std::printf("[gx] load threw: %s\n", e.what());
    std::fflush(stdout);
    g_m = nullptr;
    return -1;
  } catch (...) {
    std::printf("[gx] load threw non-std\n");
    std::fflush(stdout);
    g_m = nullptr;
    return -2;
  }
  return 0;
}

int gx_init() { return g_m ? 0 : -1; }
uint64_t gx_sym(const char* name) {
  try { return (uint64_t)g_m->address_of(name); } catch (...) { return 0; }
}
// Per-case reset. Deliberately does NOT rebuild the Machine: each one allocates
// a 2^RISCV_ENCOMPASSING_ARENA_BITS arena, and rebuilding per case OOMs -- with
// two live arenas emscripten tries to grow the heap to 512 MB and aborts.
//
// machine.reset() carries an upstream warning: "not a reliable way to reset
// complex machines with all kinds of features attached to it ... recommended to
// create a new machine instead". Ours is NOT complex -- no syscalls, no fds, no
// signals, no threads, just a bare function driven register-by-register. Same
// shape as VIXL's ResetState(), which asm-arm64-core.mjs relies on for exactly
// this. Verified: 003's four variants run every ladder rung with no OOM and
// correct answers.
void gx_reset() {
  try { g_m->reset(); }
  catch (const std::exception& e) {
    std::printf("[gx] reset: %s\n", e.what());
    std::fflush(stdout);
  }
}
uint64_t gx_read_x(int n) { return (uint64_t)g_m->cpu.reg((uint32_t)n); }
void gx_write_x(int n, uint64_t v) { g_m->cpu.reg((uint32_t)n) = v; }
void gx_set_pc(uint64_t pc) { g_m->cpu.jump((MachineT::address_t)pc); }
uint64_t gx_get_pc() { return (uint64_t)g_m->cpu.pc(); }
uint64_t gx_icount() { return (uint64_t)g_m->instruction_counter(); }

int gx_step() {
  try { g_m->cpu.step_one(true); }
  catch (const std::exception& e) {
    std::printf("[gx] step: %s\n", e.what());
    std::fflush(stdout);
    return -1;
  } catch (...) { return -2; }
  return 0;
}

// Guest memory. THE difference from VIXL, and the reason these exist at all:
// VIXL dereferenced a guest address as a raw host pointer, so guest addresses
// WERE wasm offsets and JS could poke HEAPU8 directly. libriscv owns its address
// space -- every input the corpus marshals goes through these.
//
// API read out of machine.hpp, not guessed:
//   void copy_to_guest(address_t dst, const void* buf, size_t len);
//   void copy_from_guest(void* dst, address_t buf, size_t len) const;
//
// Proven: __glifex_io lands at a linker-chosen address, gx_sym finds it,
// copy_to_guest writes there, and a kata reading ptr[0]+ptr[1] returns 350.
void gx_write_mem(uint64_t dst, const uint8_t* src, int len) {
  try { g_m->copy_to_guest((MachineT::address_t)dst, src, (size_t)len); }
  catch (const std::exception& e) {
    std::printf("[gx] write_mem: %s\n", e.what());
    std::fflush(stdout);
  }
}
void gx_read_mem(uint8_t* dst, uint64_t src, int len) {
  try { g_m->copy_from_guest(dst, (MachineT::address_t)src, (size_t)len); }
  catch (const std::exception& e) {
    std::printf("[gx] read_mem: %s\n", e.what());
    std::fflush(stdout);
  }
}

}  // extern "C"
