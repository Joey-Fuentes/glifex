# RISC-V RV64GC — libriscv + Blink (the spike record)

**Status: feasibility PROVEN, track not yet built.** Both halves execute. Every
number below is measured — by hand on a real box first, then reproduced in CI
(`chore/export-riscv-spike-*`, throwaway, never merged).

This is Bx-10's continuation. It inherits most of the machinery and almost none
of the risk: `docs/vixl-arm64.md` is the companion, and its findings are
load-bearing here.

---

## 1. The verdict

```
add    PASS  kata@0x100b0  steps=2   icount=2   a0=12                    two COMPRESSED instrs
loop   PASS  kata@0x100b0  steps=29  icount=29  a0=55                    the kata that ran on a Pixel
auipc  PASS  kata@0x100e8  steps=4   icount=4   a0=0x1122334455667788    relocation boundary
```

**libriscv (BSD-3-Clause) built to wasm32 executes RV64GC, driven
register-by-register.** The Bx-7 → Bx-10 pattern — set registers, jump to a
symbol, single-step to `ret`, read the result — ports a **third** time.

## 2. The pipeline

```
editor .s
  -> Blink runs the guest riscv64-targeting `as`  -> .o
  -> Blink runs the guest riscv64-targeting `ld`  -> linked ELF
  -> libriscv (wasm32) loads the ELF and executes -> a0
```

Same two-emulator shape as Bx-10, for the same reason: **Blink is already
vendored and already proven** at running a guest toolchain, so the assembler half
costs no new technology. Blink stays x86-64-guest-only — it runs the *tools*,
which are x86-64 binaries that *emit* riscv64.

**Better than Bx-10's shape in one place:** VIXL dereferenced a guest address as
a raw host pointer, so we relocated `PT_LOAD`s into a 4K-aligned malloc'd base
ourselves. libriscv owns its memory and takes an ELF directly. That suits RISC-V
anyway — see §5, the linker is mandatory here.

## 3. libriscv — the emulator half

Source: `github.com/libriscv/libriscv`, BSD-3-Clause, ~256 C++ files (Spike is
1,961). Purpose-built for **embedding**, which is exactly our shape.

**It already had a wasm example in-tree.** Bx-10 began from "nobody has ever
built VIXL to wasm" and paid for it; this began from a working build.

### The API, read out of the real headers

| need | libriscv |
|---|---|
| read/write registers | `cpu.reg(idx)` → `auto&` (a reference: read *and* write) |
| PC | `cpu.pc()` / `cpu.jump(addr)` |
| **single-step** | **`cpu.step_one(bool use_instruction_counter = true)`** |
| bounded run | `machine.simulate(max, counter)` / `simulate_with(max, counter, pc)` |
| symbol lookup | `machine.address_of(name)` — no symtab parsing |
| **instruction count** | **`machine.instruction_counter()` — NATIVE** |

`step_one` is VIXL's `ExecuteInstruction`; `simulate_with` is `RunFrom`. And
`instruction_counter()` is free — VIXL made us count steps by hand. The det tier
gets its metric from the library.

`cireg(idx) -> registers().get(idx + 8)` confirms the C extension is
first-class rather than bolted on.

### Build configuration — RISCV_EXT_C=ON is MANDATORY

Their `examples/wasm` ships `-DRISCV_EXT_C=OFF`. **The track cannot use that**,
and the failure is not subtle:

```
EXT_C=OFF, handed a compressed rv64gc ELF:   gx_load_elf -> -1  FAIL
```

It rejects at **load**, not at execution — libriscv checks the ELF's ISA
attributes up front. Since `-march=rv64gc` compresses automatically (§5), their
shipped config cannot load anything our assembler emits by default. `EXT_C=ON`
works; it is simply not what their LuaJIT demo needed.

The rest of their options are the source of truth and were arrived at the
expensive way:

```
-DRISCV_32I=OFF -DRISCV_64I=ON
-DRISCV_EXT_C=ON                  # MANDATORY -- see above; their example has OFF
-DRISCV_EXT_V=OFF
-DRISCV_MEMORY_TRAPS=OFF
-DRISCV_BINARY_TRANSLATION=OFF    # the translator dispatches through indirect
                                  # calls -- impossible in wasm. Leaving it on
                                  # produces "table index is out of bounds"
-DRISCV_EXPERIMENTAL=ON
-DRISCV_ENCOMPASSING_ARENA=ON -DRISCV_ENCOMPASSING_ARENA_BITS=28   # 256 MB guest
```

Other things that cost round trips, so they are written down:

- **`-fexceptions` must be on the COMPILE step**, not just the link. libriscv's
  ELF loader throws, and emscripten routes throw/catch through `invoke_*`
  trampolines in the indirect function table. Without it the first throw dies as
  `table index is out of bounds` — naming a table, not a cause.
- **`add_subdirectory(../../lib libriscv)` is RELATIVE.** Build in their tree;
  copying `examples/wasm` elsewhere breaks it.
- **Do not rename the artifacts.** The generated `.mjs` hardcodes
  `findWasmBinary() -> new URL("gx_rv.wasm", import.meta.url)`. Renaming the
  wasm breaks the module's reference to it. Give each config its own directory.
- **Their `examples/wasm/build.sh` is STALE** — it passes
  `-DCMAKE_TOOLCHAIN_FILE=../cmake/wasm.cmake` and that path does not exist in
  the repo. `emcmake cmake` is what works.

## 4. The assembler half — Bx-10's recipe, one triple changed

`build-binutils.sh` with `--target=riscv64-linux-gnu`. Everything expensive
transfers unchanged: **musl not glibc** (a glibc-static `as` SIGSEGVs under
Blink), **`-static` in `CFLAGS` not `LDFLAGS`** (CCLD expands
`$(CFLAGS) $(LDFLAGS)`; binutils drops configure-time LDFLAGS), **`make all-gas
all-ld`** not `make all`, and **`MUSL_LOCPATH`** as the libc marker.

Result: **1.94 MB** — *smaller* than arm64's 2.85 MB.

> **Note on the musl gate.** `build-binutils.sh` also checks `__libc_start_main`
> is absent and calls that "not glibc". It is not: **musl implements that symbol
> too**, and it only disappears because we strip. The check is a stripping
> artifact that has been passing by luck. `MUSL_LOCPATH` is the real marker.

## 5. RV64GC specifics — do not inherit aarch64's assumptions

**The C extension is automatic.** Plain `add a0, a0, a1 / ret` at
`-march=rv64gc` assembles to **two 2-byte instructions** (`952e`, `8082`) — no
`c.*` mnemonics required. Consequences:

- `insns != bytes/4`. Counting stays exact (single-stepping counts
  *instructions*), but every byte-arithmetic assumption from arm64 is void.
- The emulator **must** decode compressed forms. Hence `EXT_C=ON` (§3).

**More katas need the linker than on aarch64.** Even `loop.s` — purely local
branches — carries `R_RISCV_RVC_BRANCH` / `R_RISCV_RVC_JUMP`, emitted so the
linker can perform **RISC-V linker relaxation**. No aarch64 analogue. Fine for
us: we build and ship `ld` regardless, and libriscv wants an ELF anyway.

**`auipc`/`addi` — RISC-V's `adrp`/`:lo12:` — survives.** The `auipc` kata
returns the correct quad through libriscv's own addressing, so the corpus needs
**no position-independence constraint**. Same conclusion as Bx-10, measured
rather than inherited.

**`as` uses `#` for comments; aarch64 uses `//`.** Every kata failed once on
this. The assembler recipe transferring does **not** mean the syntax transfers.

## 6. What this track inherits, and what it still needs

**Free from Bx-10:** Blink (vendored, proven); the musl binutils recipe; the
`pins.env` self-bumping vendor pattern; `vendor-sync.test.mjs`; and — thanks to
the `det` fallback — a **Lab ladder that arrives automatically** at
`[32,64,128,256,512]` without anyone remembering to add one.

**Still to build** — five PRs, mirroring Bx-10:

1. **Vendor** — `tools/riscv-toolchain/{pins.env, gx_rv.cpp, build-binutils.sh,
   build-libriscv.sh}` + the step in `pages.yml`, `ci.yml` **and**
   `export-vendor-bundle.yml`. `vendor-sync.test.mjs` will force the third one.
2. **Runtime** — `asm-riscv64-{blink,core}.mjs`, worker, `runtimes.js` loader.
   Simpler than arm64's: libriscv takes the ELF, so no `PT_LOAD` relocation.
3. **Corpus** — 001/002/003 × 4 variants.
4. **Lab** — units + smoke spec. The ladder is already handled.
5. **Docs** — this file, ROADMAP, STATUS.

**Three things to fix on the way in:**

- **The vendor cache key hashes `tools/arm64-toolchain/**`.** RISC-V's pins would
  not self-bust. Generalise to `tools/**` in PR1, or this track inherits the
  exact footgun #91 retired.
- **`lab.js`'s unit selector is a hand-kept list**:
  `X.lang === "asm-x86_64" || X.lang === "asm-arm64" ? "instructions" : "cycles"`,
  at two sites. A third det track needs a third `||`. That is the same shape as
  the `detByLang` omission that broke arm64 live — **derive it, don't enumerate
  it**, before adding the entry.
- **blinkenlib would be vendored a third time** (~250 KB each). Share it or
  accept the duplication — a decision, not a default.

## 7. Further architectures — for whoever comes next

In descending order of confidence:

- **powerpc64le** — best odds. A first-class Linux target, actively maintained.
  **LE specifically**: big-endian ppc64 is a different problem.
- **s390x** — plausible. IBM maintains real tooling and it is a serious Linux
  platform, but emulators are scarcer and tend to be *machine*-shaped (kernel +
  devices) rather than function drivers.
- **MIPS** — **needs disambiguating before it is a target at all**:
  mips / mipsel / mips64 / mips64el, o32 / n32 / n64 ABIs. "MIPS" as written is
  not a spec.

Each needs the same decisive probe that picked VIXL over arm-sandbox and
libriscv over Spike: **can it set registers, jump to a symbol, single-step to
`ret`, and read the result?** Not "can it boot Linux" — that is the opposite of
what this design wants.

And per-arch gotchas do **not** transfer:

- comment characters differ (`#` vs `//`) — this has already bitten once;
- `insns != bytes/4` is not universal — aarch64 and MIPS are fixed-width,
  RV64GC compresses, **s390x is 2/4/6-byte variable-length**;
- relocation behaviour must be re-measured, not assumed. `adrp` and `auipc` both
  happened to relocate freely. That is two data points, not a law.

> **Spike (riscv-isa-sim) was never judged.** The first probe searched for
> `set_XPR`/`get_XPR` — symbol names that were invented, not read — so its
> ABSENT result proved nothing. libriscv won on evidence; Spike lost on a bad
> probe. If libriscv ever disappoints, Spike is the golden reference model and
> deserves a real look.
