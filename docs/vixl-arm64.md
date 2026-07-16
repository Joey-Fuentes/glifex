# Bx-10 arm64 — VIXL + Blink (the spike record)

**Status: feasibility PROVEN, track not yet built.** Every stage below ran in a
real headless Chromium, off the main thread, on a plain (non-COI) server. What
remains is engineering, not unknowns — see "Remaining work".

Companion docs: `GLIFEX_COMPILED_LANG_TESTING.md` (runtime behaviour),
`GLIFEX_PLAYWRIGHT_SETUP.md` (the headless rig), `docs/ROADMAP.md` (Bx-10 entry).

---

## 1. The pipeline

```
editor .s
  -> Blink runs the guest aarch64-targeting `as`   -> .o
  -> Blink runs the guest aarch64-targeting `ld`   -> linked ELF
  -> parse PT_LOADs, copy to a 4K-aligned malloc'd base
  -> VIXL aarch64 Simulator (wasm32) executes it   -> x0
```

**Two emulators, deliberately.** Blink (x86-64 guest) runs the *assembler*;
VIXL (aarch64) runs the *result*. That looks odd until you notice Blink is
already vendored and already proven at exactly this job by Bx-7 — so the
assembler half costs zero new technology. Blink itself remains x86-64-guest-only;
it never emulates arm64 and never will.

**The inversion that is easy to lose.** `aarch64-as.elf` is an **x86-64** binary
that **emits** aarch64. It is x86-64 because Blink emulates x86-64. It therefore
cannot run on an arm64 phone — that is not a defect, it is the design.

---

## 2. Measured cost

| stage | cost |
|---|---|
| Blink boot (both guest tools preloaded) | 223 ms |
| guest `as` assemble | ~1.85 s |
| guest `ld` link | ~1.20 s |
| VIXL module load | 265 ms |
| `gx_init` (Decoder + Simulator construction) | **771 ms** — build ONCE per worker, never per solve |
| VIXL execution | **~0.92 M insn/s** (wasm32) |

**~3.1 s per solve** for assemble+link. Per *source*, not per Lab size — same
league as C#/Rust cold-load.

Vendor payload ≈ **9.5 MB**: blinkenlib 247 KB + `as` 3.08 MB + `ld` 4.10 MB +
VIXL 2.09 MB. Trivial next to Rust's 122 MB or C's 106 MB `clang.webc`.

**Speed implication:** ~2000-3000x slower than native aarch64 — Miri's ballpark.
So arm64 needs a small per-language ladder exactly like Bx-6 did:
`lab-config.mjs` `sizes.wallByLang["asm-arm64"]`. At 0.92 M insn/s, ~110 M
instructions fit the 120 s worker budget, so an O(n^2) kata reaches n≈1024.
Rust's `[64,128,256,512,1024]` is the right starting point; tune on the
deployed site.

---

## 3. VIXL — the emulator half

**Source: `https://gitlab.arm.com/runtimes/vixl` (canonical).**
`github.com/Linaro/vixl` is a **stale mirror** — frozen at 5992185 (2026-04-17)
whose commit message is literally "Update README for new repository". Canonical
was at d61a1e7 (2026-07-08, "Small performance improvements to decoder
compilation"). Vendor from GitLab; pin the commit.

License BSD-3-Clause. Authored by Arm/Linaro; the same simulator Android ART and
SpiderMonkey use for testing. This retires the Unicorn/Keystone GPL route.

### Build

```
emcc gx_vixl.cc $(find src -name '*.cc' -not -path '*aarch32*') \
  -I src -std=c++17 -O2 \
  -DVIXL_INCLUDE_SIMULATOR_AARCH64 \
  -DVIXL_INCLUDE_TARGET_AARCH64 \
  -DVIXL_CODE_BUFFER_MALLOC \
  -fexceptions \
  -sSTACK_SIZE=8388608 -sINITIAL_MEMORY=33554432 \
  -sSTACK_OVERFLOW_CHECK=1 \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH=1 ...
```

- **`VIXL_INCLUDE_TARGET_AARCH64` is mandatory** — VIXL gates headers with
  `#error` and clang stops at the first one.
- **`-sSTACK_SIZE` is the difference between working and not.** Emscripten's
  default stack is **64 KB**; a static initializer in `decoder-aarch64.cc` wants
  a **~84 KB** frame and blows up inside `__wasm_call_ctors`, before `main`. At
  `-O2` the ctor frame squeaked under the limit and the overflow instead
  corrupted the stack later inside `gx_init`, presenting as an unexplained
  `memory access out of bounds`. **One bug, two costumes** — it cost three
  rounds. 8 MB matches the native stack VIXL is developed against; it is a
  "take it off the table" value and should be tuned down against a measured
  high-water mark.
- **Keep `-sSTACK_OVERFLOW_CHECK=1` in release.** It converts an anonymous OOB
  trap into a named abort. That one flag is the whole reason the bug above was
  ever identified.

### wasm32 beats wasm64 on every axis

| | wasm32 | wasm64 |
|---|---|---|
| execution | **0.92 M insn/s** | 0.32 M insn/s |
| `gx_init` | **771 ms** | 861 ms |
| `.wasm` | **2,088,513 B** (622 KB gz) | 2,197,726 B (648 KB gz) |
| needs memory64 | **no** | yes |

**Use wasm32.** The prior research called wasm32 dead ("VIXL requires an LP64
data model") and was wrong three times over: it built at `sizeof(uintptr_t)==4`,
it ran, and it is ~2.9x faster (memory64 pays bounds-check overhead). The
README's "32-bit is broken" caveat is an **x87** artifact and does not transfer
to wasm, which does IEEE doubles properly.

### API (verified against the real header, not documentation)

| symbol | line | note |
|---|---|---|
| `ReadXRegister(unsigned, Reg31Mode)` | 1575 | **`ReadXRegister(31)` is XZR, not SP** — reading sp needs `Reg31IsStackPointer`. A probe that ignores this reports `sp = 0x0` and looks like a VIXL bug. It is not. |
| `WriteXRegister(unsigned, int64_t, ...)` | 1709 | |
| `RunFrom(const Instruction*)` | 1299 | |
| `RunFrom<R, P...>(code, args...)` | 1313 | **bonus** — marshals AAPCS64 args and returns the result |
| `WritePc(const Instruction*, ...)` | 1369 | |
| `ExecuteInstruction()` | 1401 | single-step primitive |
| `IsSimulationFinished()` | 1362 | `pc_ == kEndOfSimAddress` |
| `ResetState()` | 1295 | seeds lr with `kEndOfSimAddress` (NULL) — that sentinel is how a guest `ret` terminates a run |

This surface maps 1:1 onto what `web/asm-x86-blink.mjs` already drives for
blinkenlib, so Bx-7's "set registers, jump to a symbol, single-step to `ret`,
read the result" pattern ports over intact. A GDB-style stepper is viable.

### Memory model

VIXL dereferences guest addresses as **raw host pointers** — no MMU. Guest
addresses therefore *are* wasm linear-memory offsets. This was flagged in
research as a possibly-fatal risk; it is not. It works, including
`stp`/`ldp` pre/post-index frames and caller-supplied buffers.

### Cross-origin isolation — tested as it ships

arm64 is single-threaded (`shared:false`, no SharedArrayBuffer), so unlike
Python/Ruby/PHP/WAT/retro it does not *require* isolation — verified `coi:false`
on a plain `http.server`, 7/7.

**That is a property, not a testing strategy.** The live site IS isolated
(`web/sw.js` + the `#coi-boot` path), so `e2e/asm-arm64-smoke.spec.js` uses
`e2e/coi-fixtures` like the other asm tracks and goes through the same
bootstrap — including the one reload the app performs to become isolated.
Testing on a plain server would prove something no user ever experiences. The
first browser run of VIXL was in fact isolated (`{"coi":true,"sab":"function"}`,
7/7); the plain-server run only established that isolation is not a
*requirement*.

---

## 4. The assembler half — musl or nothing

**THE finding of this spike.** A **glibc**-static `as` SIGSEGVs under Blink
after startup. A **musl**-static one works. Nothing else about the binary
mattered.

The recipe is the x86-64-playground's own `compile_musl_binutils.sh`, verbatim,
with only the target triple changed:

```
CC=musl-gcc \
CFLAGS="-O3 -static --static -static-libgcc -static-libstdc++" \
CXXFLAGS="-O3 -static --static" \
  binutils-gdb/configure \
    --target=aarch64-linux-gnu --enable-targets=aarch64-linux-gnu \
    --enable-default-execstack=no --enable-deterministic-archives \
    --enable-new-dtags --disable-doc --disable-gprof --disable-nls \
    --disable-binutils --disable-gdb --disable-gdbserver \
    --disable-libdecnumber --disable-readline --disable-sim \
    --disable-werror --enable-static --enable-plugins=no --disable-shared
make -j all-gas all-ld
strip --strip-unneeded gas/as-new ld/ld-new
```

Two traps in there, both of which cost round trips:

- **`-static` rides in `CFLAGS`, not `LDFLAGS`.** binutils' `CCLD` expands
  `$(CFLAGS) $(LDFLAGS)`, and binutils does **not** reliably propagate
  configure-time `LDFLAGS` into sub-builds. `LDFLAGS=-static` silently yields a
  dynamic PIE. (The same propagation failure swallows configure-time `CFLAGS` —
  if a flag matters, put it in `CC` or verify it in the output.)
- **`make all-gas all-ld`, not their `make all`.** Their target is
  `x86_64-linux-musl`; an aarch64 target pulls in extra components (gold,
  gprofng) their flag set never disables, and one fails under musl. We need
  exactly two binaries.

**Identifying musl correctly:** the marker is **`MUSL_LOCPATH`**. It is *not*
`linux-musl` — that is a **target triple** string, present in the playground's
binary only because it targets `x86_64-linux-musl`. Our aarch64 build can never
contain it however musl-linked it is. And `grep glibc` **false-positives** on any
binutils, which contains `GLIBC_ABI_DT_RELR` / `GLIBC_2.36` as version-symbol
vocabulary. Check `MUSL_LOCPATH` present + `__libc_start_main` absent.

Sizes (stripped): `as` 3.08 MB, `ld` 4.10 MB. Output verified **byte-identical
to stock `aarch64-linux-gnu-as`** on all seven katas — the musl host libc does
not perturb a single emitted instruction.

---

## 5. Relocations — no corpus constraint

VIXL executes from a `malloc`'d base; a linked ELF wants fixed vaddrs
(0x400000...). That looked like it would force the corpus to be
position-independent. **It does not.**

`adrp` is **PC-relative** — the linker encodes a *page delta*, not an address.
Load every `PT_LOAD` at `base + (vaddr - min_vaddr)` and the delta survives.
Verified: an `adrp`/`:lo12:` kata against `.data`, linked and relocated to a
foreign base, returned the correct quad.

**Page alignment is load-bearing.** `adrp` masks PC to a 4 KB page, so:

```
(base - min_vaddr) % 4096 == 0     // MUST hold
```

`malloc` does not guarantee this — over-allocate and round up. Get it wrong and
every page delta shifts by one, which surfaces as garbage reads, not a fault.

**`-z max-page-size=4096` at link.** ld defaults to a 64 KB page on aarch64 and
parks `.data` a full page above `.text`: the linked span for a 200-byte program
was **65,736 bytes**, dropping to **4,296** with the flag. That span is what the
worker allocates per solve.

So: katas may use `adrp`, `.data`, literal pools — anything. No CLI divergence
to disclose. **Keep `ld`.**

---

## 6. Dead ends — do not re-run these

Each cost at least one round trip.

| theory | how it died |
|---|---|
| **`mprotect` unsupported** | Blink **implements** it (`syscall.c:5507`). `warning: unsupported syscall: __syscall_mprotect` is Blink's **own host-side** call under emscripten, which has no `mprotect`. **The working reference emits the identical six warnings.** Benign noise. |
| **CET / `GNU_PROPERTY`** | `loader.c` never reads it. Blink's own `configure` disables CET for its **JIT**, which is irrelevant under emscripten (no JIT). The reference lacks the segment only as a byproduct of being musl-built. |
| **glibc version (Ubuntu 22.04)** | Failed identically to 24.04, and produced a *bigger* binary. |
| **binary too big** | `tunables.h`: `kMaxResident` 8 GB, `kMaxVirtual` 64 GB, vs our 4 MB. |
| **the local rig** | It runs the playground's own `gnu-as.elf` in **633 ms, exit 0**, producing a real `.o`. **Run this control FIRST.** It exonerates the harness, kills the mprotect theory, and points at the binary — in five minutes. |

---

## 7. What shipped, and what is still open

**Bx-10 is built.** #91 vendor step (pinned, self-bumping cache) · #92 worker +
core + loader · #93/#96 corpus 001/002/003 × 4 variants · #94 guest stack 1 MB ·
#95 vendor-sync guard · #97 ladders, honest step budget, units, smoke, stack
probe.

Verified against the deployed toolchain and the deployed VIXL, at the top rung
of every shipped ladder:

| problem | ladder | clean | optimized | brute-force |
|---|---|---|---|---|
| 001 | `[32,64,128,256,512]` | 8,587 | 8,587 | 2,630,160 |
| 002 | `[32,64,128,256,512]` | 14,090 | 13,634 | 1,180,918 |
| 003 | `[4,8,12,16,20]` | 101 | 64 | 197,012 |

Ladders mirror `asm-x86_64`. Instruction counts are **exact** — VIXL
single-steps — so the det tier gets a real signal, not an estimate.

### Still open, in rough priority

1. **`BINUTILS_SHA256` is blank** in `pins.env`. Deliberately: we had never seen
   the hash, and inventing one is worse than not pinning. The build prints it;
   one paste closes this.
2. **`EMSDK_VERSION=latest`** — the only unpinned input. The build records the
   resolved `emcc --version` in the manifest, so a regression is at least
   attributable. Suspect for the unexplained `gx_init` swing (103 ms on spike
   builds vs 267 ms on the deployed one — same code).
3. **`STACK_SIZE=8388608` / `INITIAL_MEMORY=33554432`** in `build-vixl.sh` are
   "take it off the table" values, never tuned against a measured high-water.
   (Not to be confused with the *guest* stack, which is measured — §3.)
4. **001's `clean` and `optimized` are the same algorithm** — both 8,587
   instructions, so they plot exactly on top of each other in Compare. Matches
   the x86-64 track's own 002 (both "hash table, linear probing"), so it is
   precedent rather than defect, but it is a dull lesson for the one track with
   exact counts. 002 does it properly: 14,090 vs 13,634, the Fibonacci hash
   earning its keep.
5. **Spike branches** `chore/export-armas-spike-*` and `chore/export-vixl-*` are
   throwaway by design and never merged (like `chore/export-rust-vendor`).
   Deletable.
6. **#93, #94 and #95 carry the wrong commit subject** — all three squash-merged
   with #91's message ("vendor the arm64 toolchain"). The PR titles and bodies
   on GitHub are correct; only the commit subjects lie. What they really are:
   **#93** corpus 001+003 · **#94** guest stack 8 KB → 1 MB · **#95** the
   vendor-sync guard. Cause: the batch generator substituted the commit message
   by regex, the anchor matched inside #91's body instead of at its end, and the
   substitution silently did not fire. Payloads were verified obsessively; the
   commit message was the one artifact with no check at all.

---

## 8. Side-track — native aarch64 downloads

Not part of Bx-10, but the same toolchain proves it, and the findings are cheap
to record now and expensive to rediscover.

A freestanding `.s` (raw syscalls, no libc) assembled and linked by our own
musl-built `as`+`ld` **runs on a Pixel 9 under Termux**: prints, and exits 55
from a `madd`/`cbz`/`sub`/`b` loop — the same kata VIXL runs in wasm. **5,816
bytes.**

The recipe, found by shipping four link variants and letting the phone choose:

```
ld -pie --dynamic-linker /system/bin/linker64 -z max-page-size=4096
```

| variant | result on the Pixel |
|---|---|
| plain (ET_EXEC) | `has unexpected e_type: 2` — **Android requires ET_DYN** |
| `-static -pie --no-dynamic-linker` | `Could not find a PHDR: broken executable?` |
| + forced `PHDRS` linker script | `.dynamic` offset mismatch (script declared no dynamic segment) |
| **`-pie --dynamic-linker /system/bin/linker64`** | **works, exit 55** |

Zero `NEEDED` libs, so bionic maps it, resolves nothing, and jumps to `_start`.

- **`/system/bin/linker64` is Android-specific** — desktop Linux uses
  `/lib/ld-linux-aarch64.so.1`. The same binary cannot serve both; a download
  must be target-aware.
- **qemu is not Android.** `qemu-aarch64-static` ran *both* rejected variants
  happily and reported exit 55. A green qemu run is necessary, not sufficient;
  for anything Android-specific the phone is the only oracle.
- **`~/storage/downloads` is noexec** — copy to `$HOME` before running.
- If that track ever wants **C**, it needs a libc, and Android's is Bionic, not
  glibc. Static musl is the likely answer.

---

## 9. Lessons that generalise

- **String-matching as a decision gate lied four times here**: `file(1)` prose
  (in both directions), `grep glibc` matching binutils' own vocabulary (this one
  killed the *correct* musl hypothesis for five rounds), and a target triple
  standing in for a libc marker (twice). The repo's existing rule — *check bytes
  with python3, not a quoted grep* — is not a style preference.
- **Run the known-good control before debugging your own artifact.** One
  five-minute run of the playground's `gnu-as.elf` would have exonerated the rig
  and killed two theories.
- **Read the upstream build script before theorising about upstream's binary.**
  The answer was sitting in `compile_musl_binutils.sh` the whole time.
- **A self-check bug must not be fatal to independent work** — keep diagnostic
  steps `continue-on-error` so a wrong gate cannot cost a whole round trip.
