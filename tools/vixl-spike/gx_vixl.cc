// gx_vixl.cc -- a blinkenlib-shaped C API over vixl::aarch64::Simulator.
//
// Deliberately mirrors the surface web/asm-x86-blink.mjs already drives:
//   blinkenlib_get_clstruct  -> gx_read_x / gx_write_x   (register file)
//   blinkenlib_spy_address   -> JS reads HEAPU8 directly (no MMU in VIXL)
//   blinkenlib_starti/stepi  -> gx_set_pc / gx_step
//   blinkenlib_run           -> gx_run_from
//
// If this compiles and the katas pass, the "drive a guest function directly"
// trick from the x86-64 track ports to arm64 and Bx-10 is a small track.
// If it does not, we are back to an ELF loader + syscall harness.

#include <cstdint>
#include <cstdio>
#include <cstring>

#include "aarch64/decoder-aarch64.h"
#include "aarch64/simulator-aarch64.h"

using vixl::aarch64::Decoder;
using vixl::aarch64::Instruction;
using vixl::aarch64::Simulator;

static Decoder *g_dec = nullptr;
static Simulator *g_sim = nullptr;

// SPIKE NOTE: this cast is the whole wasm32 question. VIXL treats a guest
// address as a raw host pointer. Under wasm32 uintptr_t is 32-bit, so a
// 64-bit x-register truncates -- but every address we hand it is a wasm
// linear-memory offset (< 4 GiB), so the truncation should be lossless.
// Under -sMEMORY64 uintptr_t is 64-bit and the question disappears.
// Do not reason about this further; the katas decide it.
static inline const Instruction *as_insn(uint64_t addr) {
  return reinterpret_cast<const Instruction *>(static_cast<uintptr_t>(addr));
}

extern "C" {

int gx_ptr_bytes(void) { return (int)sizeof(uintptr_t); }

int gx_init(void) {
  if (g_sim != nullptr) return 0;
  g_dec = new Decoder();
  g_sim = new Simulator(g_dec);
  return g_sim != nullptr ? 0 : -1;
}

// ResetState() seeds lr with kEndOfSimAddress (NULL) -- that sentinel is how
// a guest ret terminates the run. Call before every kata.
void gx_reset(void) { g_sim->ResetState(); }

void gx_write_x(int n, uint64_t v) {
  g_sim->WriteXRegister(n, static_cast<int64_t>(v));
}

uint64_t gx_read_x(int n) {
  return static_cast<uint64_t>(g_sim->ReadXRegister(n));
}

uint64_t gx_read_sp(void) {
  return static_cast<uint64_t>(g_sim->ReadXRegister(31));
}

void gx_run_from(uint64_t pc) { g_sim->RunFrom(as_insn(pc)); }

void gx_set_pc(uint64_t pc) { g_sim->WritePc(as_insn(pc)); }

int gx_is_finished(void) { return g_sim->IsSimulationFinished() ? 1 : 0; }

// One instruction. Returns 1 once the sentinel ret has landed.
int gx_step(void) {
  if (g_sim->IsSimulationFinished()) return 1;
  g_sim->ExecuteInstruction();
  return g_sim->IsSimulationFinished() ? 1 : 0;
}

}  // extern "C"
