// gx_stack.cc -- gx_vixl.cc with ONE change: the guest stack size is a build
// parameter (-DGX_SIM_STACK=<bytes>), so a matrix can measure what raising it
// actually does.
//
// WHY 8 KB IS THE DEFAULT (VIXL's README): "VIXL was developed for JavaScript
// engines" -- the simulator exists so JIT authors run generated code FRAGMENTS
// on an x86 dev box. A JIT'd function has a small known frame. Nobody expected
// whole programs with 32 KB tables. So this is a default tuned for a different
// workload, not a safety limit. The GUARD is the safety feature, and it is
// separate from usable_size_.
//
// Measured on the default build: 8 KB usable, and the 9th KB traps with
// "Attempt to write to stack guard region ... simulator-aarch64.h:420".

#include <cstdint>

#include "aarch64/decoder-aarch64.h"
#include "aarch64/simulator-aarch64.h"

using vixl::aarch64::Decoder;
using vixl::aarch64::Instruction;
using vixl::aarch64::Simulator;
using vixl::aarch64::SimStack;

static Decoder *g_dec = nullptr;
static Simulator *g_sim = nullptr;

static inline const Instruction *as_insn(uint64_t a) {
  return reinterpret_cast<const Instruction *>(static_cast<uintptr_t>(a));
}

extern "C" {

int gx_ptr_bytes(void) { return (int)sizeof(uintptr_t); }
int gx_stack_size(void) {
#ifdef GX_SIM_STACK
  return GX_SIM_STACK;
#else
  return 0;  // default -- whatever VIXL picks
#endif
}

int gx_init(void) {
  if (g_sim != nullptr) return 0;
  g_dec = new Decoder();
#ifdef GX_SIM_STACK
  // The whole experiment. If SimStack(N) drops the guard, this is a bad trade:
  // a loud abort becomes silent corruption. The probe checks for that.
  g_sim = new Simulator(g_dec, stdout, SimStack(GX_SIM_STACK).Allocate());
#else
  g_sim = new Simulator(g_dec);
#endif
  if (g_sim == nullptr) return -1;
  g_sim->ResetState();
  return 0;
}

void gx_reset(void) { g_sim->ResetState(); }
void gx_write_x(int n, uint64_t v) { g_sim->WriteXRegister(n, (int64_t)v); }
uint64_t gx_read_x(int n) { return (uint64_t)g_sim->ReadXRegister(n); }
uint64_t gx_read_sp(void) {
  return (uint64_t)g_sim->ReadXRegister(31, vixl::aarch64::Reg31IsStackPointer);
}
void gx_run_from(uint64_t pc) { g_sim->RunFrom(as_insn(pc)); }
void gx_set_pc(uint64_t pc) { g_sim->WritePc(as_insn(pc)); }
int gx_is_finished(void) { return g_sim->IsSimulationFinished() ? 1 : 0; }
int gx_step(void) {
  if (g_sim->IsSimulationFinished()) return 1;
  g_sim->ExecuteInstruction();
  return g_sim->IsSimulationFinished() ? 1 : 0;
}

}  // extern "C"
