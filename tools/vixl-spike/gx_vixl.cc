// gx_vixl.cc -- a blinkenlib-shaped C API over vixl::aarch64::Simulator.
//
// v3. Runs 1-2 established: VIXL COMPILES to wasm32 AND wasm64 (1.77/1.88 MB).
// Both then trap identically with "memory access out of bounds" inside
// gx_init(), BEFORE any guest instruction. Identical failure at 4-byte and
// 8-byte pointers => this is NOT the LP64/pointer-width risk the research
// predicted. So: breadcrumb every construction step and find out what it IS.
// Each stage flushes, so the last line printed names the culprit.

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <utility>

#include "aarch64/decoder-aarch64.h"
#include "aarch64/simulator-aarch64.h"

using vixl::aarch64::Decoder;
using vixl::aarch64::Instruction;
using vixl::aarch64::Simulator;

static Decoder *g_dec = nullptr;
static Simulator *g_sim = nullptr;

#define GX_MARK(msg)                       \
  do {                                     \
    std::printf("[gx] %s\n", msg);         \
    std::fflush(stdout);                   \
  } while (0)

static inline const Instruction *as_insn(uint64_t addr) {
  return reinterpret_cast<const Instruction *>(static_cast<uintptr_t>(addr));
}

extern "C" {

int gx_ptr_bytes(void) { return (int)sizeof(uintptr_t); }

// Reported so we can see whether the guest stack VIXL hands itself is sane
// before we ever ask it to execute anything.
uint64_t gx_stack_base(void) {
  if (g_sim == nullptr) return 0;
  return (uint64_t)g_sim->ReadXRegister(31);
}

int gx_init(void) {
  if (g_sim != nullptr) return 0;

  GX_MARK("A: entering gx_init");

  GX_MARK("B: new Decoder()");
  g_dec = new Decoder();
  GX_MARK("C: Decoder constructed");

  // Isolate SimStack from the Simulator ctor. If the trap is here, the guest
  // stack allocator is the problem (emscripten has no mmap guard pages) and
  // the fix is a custom-sized SimStack, not a VIXL patch.
  GX_MARK("D: SimStack().Allocate() with the DEFAULT size");
  {
    vixl::aarch64::SimStack::Allocated probe =
        vixl::aarch64::SimStack().Allocate();
    (void)probe;
    GX_MARK("E: default SimStack allocated and destroyed OK");
  }

  GX_MARK("F: new Simulator(decoder) with the default stack");
  g_sim = new Simulator(g_dec);
  GX_MARK("G: Simulator constructed");

  GX_MARK("H: ResetState()");
  g_sim->ResetState();
  GX_MARK("I: gx_init complete");

  return g_sim != nullptr ? 0 : -1;
}

void gx_reset(void) { g_sim->ResetState(); }

void gx_write_x(int n, uint64_t v) {
  g_sim->WriteXRegister(n, static_cast<int64_t>(v));
}

uint64_t gx_read_x(int n) {
  return static_cast<uint64_t>(g_sim->ReadXRegister(n));
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
