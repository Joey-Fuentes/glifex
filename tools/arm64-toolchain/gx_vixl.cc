// gx_vixl.cc -- a blinkenlib-shaped C API over vixl::aarch64::Simulator.
//
// Deliberately mirrors the surface web/asm-x86-blink.mjs already drives for
// Blink, so Bx-7's pattern -- set registers, jump to a symbol, single-step to
// ret, read the result -- ports over unchanged:
//
//   blinkenlib_get_clstruct  -> gx_read_x / gx_write_x
//   blinkenlib_spy_address   -> JS reads HEAPU8 directly (VIXL has no MMU)
//   blinkenlib_starti/stepi  -> gx_set_pc / gx_step
//   blinkenlib_run           -> gx_run_from
//
// VIXL dereferences a guest address as a raw host pointer, so guest addresses
// ARE wasm linear-memory offsets. Proven under wasm32 (uintptr_t == 4): every
// address we hand it is < 4 GiB by construction, so nothing truncates, and
// wasm32 is ~2.9x faster than wasm64. See docs/vixl-arm64.md.
//
// Build flags that are NOT optional (docs/vixl-arm64.md section 3):
//   -DVIXL_INCLUDE_TARGET_AARCH64   VIXL gates its headers with #error
//   -sSTACK_SIZE=...                emscripten's 64 KB default is fatal: a
//                                   static initializer in decoder-aarch64.cc
//                                   needs a ~84 KB frame and blows up inside
//                                   __wasm_call_ctors, before main
//   -sSTACK_OVERFLOW_CHECK=1        turns an anonymous OOB trap into a named
//                                   abort; keep it even in release

#include <cstdint>
#include <cstdio>

#include "aarch64/decoder-aarch64.h"
#include "aarch64/simulator-aarch64.h"

using vixl::aarch64::Decoder;
using vixl::aarch64::Instruction;
using vixl::aarch64::SimStack;
using vixl::aarch64::Simulator;

// VIXL's default guest stack is 8 KB usable. Measured, not assumed: the 9th KB
// trips "Attempt to write to stack guard region" (simulator-aarch64.h:420).
//
// That is tiny for assembly -- 001's clean.s spends 1 KB on a counting table
// without thinking, and a two-sum hash table at the Lab's n=1024 wants ~32 KB.
// Worse, it is an INVISIBLE cliff: native gives 8 MB, so an over-deep .s passes
// on the CLI and traps only in the browser, through no fault of the author.
//
// It is small because of what VIXL is FOR. Its README: "VIXL was developed for
// JavaScript engines" -- the simulator runs JIT-generated code FRAGMENTS on an
// x86 dev box, and a JIT'd function has a small known frame. A default tuned
// for a different workload, not a safety limit.
//
// 1 MB is a conventional thread-stack size (Windows' default; musl uses 128 KB;
// glibc's main thread 8 MB), so it is the number a contributor never has to
// think about. Measured across default/64K/256K/1M builds:
//   - SimStack(N) yields EXACTLY N usable
//   - the guard SURVIVES at every size (every overflow TRAPs; zero silent
//     corruption) -- usable_size_, base_guard_size_ and limit_guard_size_ are
//     independent fields, so raising the stack does not weaken the guard
//   - gx_init stays flat (~103 ms at every size) -- Allocate() does not zero
// Free, so take the headroom. See docs/vixl-arm64.md.
static const size_t kGuestStackBytes = 1 << 20;

static Decoder *g_dec = nullptr;
static Simulator *g_sim = nullptr;

static inline const Instruction *as_insn(uint64_t addr) {
  return reinterpret_cast<const Instruction *>(static_cast<uintptr_t>(addr));
}

extern "C" {

int gx_ptr_bytes(void) { return (int)sizeof(uintptr_t); }

// Constructing the Simulator costs ~771 ms. Build it ONCE per worker and reuse
// it across solves; gx_reset() is the per-solve call.
int gx_init(void) {
  if (g_sim != nullptr) return 0;
  g_dec = new Decoder();
  // Passing the stack means passing the stream too -- the signature is
  // Simulator(Decoder*, FILE* = stdout, SimStack::Allocated = SimStack().Allocate()).
  g_sim = new Simulator(g_dec, stdout, SimStack(kGuestStackBytes).Allocate());
  if (g_sim == nullptr) return -1;
  g_sim->ResetState();
  return 0;
}

// ResetState() seeds lr with kEndOfSimAddress (NULL). That sentinel is how a
// guest ret terminates a run: IsSimulationFinished() is pc_ == kEndOfSimAddress.
void gx_reset(void) { g_sim->ResetState(); }

void gx_write_x(int n, uint64_t v) {
  g_sim->WriteXRegister(n, static_cast<int64_t>(v));
}

uint64_t gx_read_x(int n) {
  return static_cast<uint64_t>(g_sim->ReadXRegister(n));
}

// NOTE: ReadXRegister(31) is XZR, not SP -- reading the stack pointer needs
// Reg31IsStackPointer. A probe that ignores this reports sp = 0 and looks like
// a VIXL bug. It is not.
uint64_t gx_read_sp(void) {
  return static_cast<uint64_t>(
      g_sim->ReadXRegister(31, vixl::aarch64::Reg31IsStackPointer));
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
