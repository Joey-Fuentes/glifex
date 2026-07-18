# Browser Runtimes — Live Compile-and-Run for Every Language

**Status:** design (pre-implementation). **Phase:** current B-phase workstream, before corpus growth (Phase C).

> **Sequencing + some toolchain picks superseded (2026-07) -- see `ROADMAP.md` section Bx for the current order.**
> A feasibility / verification-story review reprioritized the sequence: retro CPU-cores first (deterministic
> SingleStepTests CI proof), C# early, Rust via **rubri** (Miri/MIR-interpreter in wasm, not `rustc`),
> Java **shipped** in-browser via **teavm-javac** (TeaVM's real javac AOT-compiled to WasmGC; compile-in-worker,
> cases fed at runtime) -- not the DoppioJVM/GraalVM paths first sketched here; Kotlin stays gated on a JVM-in-browser. Swift's candidate path is **Emscripten + MiniSwift** (subset, unverified). arm64's spike is
> **DONE and the path is proven** (`docs/vixl-arm64.md`): **VIXL** (BSD-3, Arm/Linaro) built to wasm32
> executes the code, and GNU as+ld cross-targeting aarch64 run as musl-static guests **under Blink** to
> assemble it -- not arm-sandbox, not clang, and the Unicorn/Keystone GPL route is retired for real.
> Blink is still x86-64-guest-only and still never emulates arm64 -- it runs the *assembler*, which is an
> x86-64 binary that *emits* aarch64. Zig and Swift remain feasibility
> *spikes*. Also: PHP and C/C++ browser runtimes already shipped (Bx-2/Bx-3, verified in STATUS) -- the old
> "feasible to add now" wording below predates that. These toolchain calls are under active re-research
> (J. Fuentes, in parallel); the per-target notes and "Decisions locked" below will be reconciled once it
> lands. Old rationale is retained, not deleted (roadmap rule: settled decisions aren't relitigated by
> forgetting).

**Goal:** every language and assembly target in the corpus can be *edited and run by the user in real time in the browser* — not precompiled references, not CLI-only. Where the best production-grade in-browser toolchain diverges from the CLI, disclose it clearly in the UI (at the point of run) and in the docs.

This is the completion of the platform's core promise: the browser runs the same corpus as the CLI. For interpreted languages (Python/Ruby/JS/TS) and SQL that promise already holds. This workstream extends it — honestly — to the compiled and assembly families.

## Hard requirements

1. **Live edit-compile-run.** The user's own edited source compiles and runs in the browser. Precompiled-reference-only is off the table for every target.
2. **CLI-fidelity or disclosure.** Ship the best production-grade in-browser toolchain per language. Where it diverges from the CLI's real toolchain, surface that divergence inline at run time AND document it. Never fake parity.
3. **Snappy.** Nothing loads at page open. Each runtime lazy-loads on first Run in that language, is cached, and **exactly one runtime is live at a time.** Memory stays bounded to one runtime. This extends the existing `Runtimes.get(lang)` gate.

## Shared architecture

All targets plug into the existing pattern in `web/runtimes.js` and `web/fetch-runtimes.mjs`:

- **Vendored, never CDN at runtime.** Each toolchain's files are fetched once by `fetch-runtimes.mjs` into `web/vendor/<lang>/` (gitignored), with LICENSE + `THIRD_PARTY_NOTICES.md` entry + `manifest.json`. This preserves THE OFFLINE RULE.
- **Lazy + cached + one-at-a-time.** A `loadX()` loader per language returns a runner `{ run(source, cases) }`. `Runtimes.get(lang)` caches the instance and is the single gate; switching languages idles the previous runtime.
- **Honest download UI + docs, not a metadata schema.** Runtimes aren't tagged with structured `fidelity`/`size` fields. Instead: (a) the docs state each language's approach and any CLI divergence, and (b) the UI shows a real download indicator at fetch time — e.g. "Downloading C toolchain — ~100MB, one-time…" via the run spinner — so users always know when a heavy runtime is loading and why. Where a toolchain genuinely diverges from the CLI (none of the Tier-1/2 targets do materially), a short inline note by the results says so. This keeps the loader contract simple: a loader + an optional divergence note, nothing more.
- **Harness reuse.** The CLI already defines the per-language harness contract (`languages/templates/Harness.*`). The browser compiles the *same* user-solve-plus-harness with the in-browser toolchain — a strong fidelity anchor. No `app.js` run() changes needed; the compiled/asm langs route through the existing non-JS path.

## The targets

Tiered by feasibility × fidelity × effort.

### Tier 1 — native / trivial

**WAT (WebAssembly Text)** — WAT *is* WASM. Assemble with a small `wat2wasm` (wabt, compiled to WASM) or an inline assembler, instantiate, run. **Fidelity: highest** — the browser runs the same WASM the CLI's wabt produces; zero cross-compiler divergence. Tiny. **Sequence first.**

### Tier 2 — clean, high-fidelity, OSS

**C / C++** — `clang` + `wasi-libc` compiled to WASM (wasi-sdk / Wasmer WASIX; proven in Chrome/Safari/Firefox). User source → clang compiles in-browser → run. **Fidelity: high** (genuine clang + wasi-libc); C++ caveat: exception handling support is limited; WASI has no sockets (irrelevant for algorithm problems). **Size: heavy (~40–100MB toolchain), one-time cached.** License: LLVM/Apache (OSS). **Proves the heavy-toolchain vendor + progress architecture — do first among compiled.**

**C#** — Roslyn (the real Microsoft C# compiler) on the .NET/Mono WASM runtime: `CSharpCompilation.Create` → `Emit` → execute the assembly. **Fidelity: high** (Roslyn is the CLI's compiler). **Size ~10–30MB** (trimmable). Work: wire `Console` I/O to the harness. License: MIT/.NET (OSS).

**PHP** — the official PHP interpreter compiled to WASM (php-wasm; PHP 8.x, production-proven by WordPress Playground). PHP is interpreted, so this is the *easy* shape — run user source directly, exactly like the existing Python/Ruby runtimes; no compiler-in-browser problem. **Fidelity: high** (official interpreter + stdlib). Size ~10–20MB, one-time cached. License: OSS (PHP License / Apache-class wrapper).

**Zig** — the **self-hosted Zig compiler** runs as WASM (the bootstrap ships a `zig1.wasm`; zigwasm.org does interactive in-browser compilation of the compiler + stdlib). User source → zig-in-wasm compiles → run. **Fidelity: high** (the real compiler). Moderate size. License: MIT. Caveat: Zig is pre-1.0 and ships breaking changes — pin a version.

**Dart** — **SHIPPED (Bx-13b), see `docs/dart2js-self-hosted.md` and `docs/bx13b-handoff.md`.** **dart2js self-hosted to JS.** dart2js is written in Dart, so it compiles itself to JavaScript and the browser runs the output natively: **5.4 MB gzipped**, **~4.4s** per compile in real Chromium, byte-identical to the VM. **Fidelity: high** (the real dart2js). BSD-3. **No WasmGC, no COI** — the output is plain JS, single-threaded, `shared:false`, so like C#/Rust/Go/Java it runs on a plain server. Shape: a thin `dart-worker.js` relay over a `dart-core.mjs` logic module — the same split the asm workers use, because a typeless root `package.json` makes node resolve a `.js` entry as CommonJS and reject its `export`s. Vendored at deploy (Bx-13a, #124), never committed. *Correction (kept):* the dart2wasm claim that once stood here was wrong — dart2wasm shells out to a `wasm-opt` subprocess a browser cannot provide. **The one hard bug — and the lesson it taught:** a compile *error* crosses the `.toJS` bridge boxed, and CI's shape report proved the Dart message does not survive onto the thrown object at all (`.error` has no own properties and toStrings to `[object Object]`; `.stack` is pure frames; `.message` is the generic wrapper). Reading `.error` or `.stack` recovers nothing — the diagnostic exists only where `gx_core.report` **prints** it to console during the compile, so `driveProblem` captures console and keeps the reporter's own `[error]` lines. No compiler change. This mattered because it is the ONLY path a spike of correct katas never reaches: **a track that only compiles correct code has never tested its diagnostics, and the diagnostics are the product.** The e2e smoke asserts this path explicitly (first in the repo to do so).

**Retro trio — 6502, Z80, SM83 (CPU-core-only)** — small OSS CPU cores (JS or WASM) + an OSS assembler (GoodASM covers all three, stable; or per-arch JS assemblers) + a new per-chip register/memory harness. **Fidelity: high and PROVABLE** — SingleStepTests/jsmoo give cycle-by-cycle reference suites (1000 tests/opcode w/ bus activity) we can run in CI to prove the core matches silicon. **Size: smallest of everything.** License: cores/assembler MIT/BSD-class. Scope: pure CPU (registers + RAM in, result out) — **no Game Boy hardware/PPU/MMIO** (separate future track).

### Tier 3 — hard / gated

**x86-64** — assemble the user's AT&T/SysV asm with clang cross-targeting `x86_64-linux` (reuses the C/C++ toolchain) → ELF → execute on **Blink** compiled to WASM (ISC, ~177kb, runs real x86-64-Linux ELF, WASM-proven by `x86-64-playground`). **Fidelity: high** (real machine code on a faithful emulator; Linux syscalls back the stdio harness). Lighter than expected, but the assemble→ELF→emulate→syscall/ABI harness pipeline is more involved. Bonus: emulated x86-64 runs uniformly regardless of the user's real CPU — an ARM-laptop user can finally run x86-64 asm they can't test natively.

**arm64** — **PROVEN, see `docs/vixl-arm64.md`.** Assemble+link with GNU `as`/`ld` cross-targeting aarch64, run as **musl-static x86-64 guests under Blink** (the Bx-7 emulator, already vendored) → execute the result on **VIXL**'s AArch64 Simulator (BSD-3, Arm/Linaro) compiled to **wasm32** (2.09 MB, ~0.92 M insn/s). **Fidelity: high.** All-permissive; no Unicorn, no qemu, no GPL in the linked page. ~3.1 s/solve, no COI needed.

**Go** — **SHIPPED (Bx-12), see `docs/go-self-hosted.md`.** **gc-in-wasm** (decision: faithful over light). The real `gc` toolchain (`cmd/compile` + `cmd/link`, built for `GOOS=wasip1 GOARCH=wasm`) compiled to WASM, running in a worker over one virtual FS to compile user source → link → run. No `cmd/go` — it builds by forking and `os/exec` is absent under `wasip1` — so JS orchestrates the two tools and std export data is precomputed at vendor time. **Fidelity: high** (the real compiler). **Size: 79.4MB vendored** — expected to be heavy, but in practice the *lightest* compiled track, under Rust's 122MB and C's 106MB `clang.webc`, and it needs neither COI nor the Chromium heap flag C requires. Rejected alt: `yaegi` interpreter (lighter but interpreter-divergent — undercuts CLI-parity).

**Java** — **SHIPPED (2026) via teavm-javac**: TeaVM's real `javac` AOT-compiled to WebAssembly (WasmGC), compile-in-worker with cases fed at runtime (neither DoppioJVM nor GraalVM). **Built from pinned source at deploy since Bx-8b** (`konsoletyper/teavm-javac` @ 7e4a44cf, TeaVM 0.13.1, OpenJDK jdk25u @ 6c48f4ed; byte-reproducible across four CI runs) — it previously fetched an unversioned, and measurably stale, snapshot from the maintainer's own web server. Full record: `docs/teavm-javac-self-built.md`. Known inherent JS-call-stack **compile ceiling** (annotations / deep recursion) — root cause + mitigations: `docs/teavm-javac-compile-ceiling.md`. *Pre-ship analysis, kept for context:* **GraalVM-wasm (javac + Espresso)**. GraalVM is building a WASM backend; a functional `javac`-in-browser demo exists, and Espresso is an OSS, TCK-passing JVM. Run javac on Espresso-in-wasm → bytecode → execute on Espresso-in-wasm. **Fidelity: high** (real OpenJDK-class, TCK). License: GraalVM CE (OpenJDK-style, OSS). **Status: 2026-immature** (no networking yet, "lots of work"). **Decision (superseded — Java shipped via teavm-javac):** originally to track GraalVM-wasm and keep Java CLI-only until browser-ready. Not CheerpJ — its free Community License forbids self-hosting (violates the offline rule); self-hosting needs a paid or branded-dedicated license.

**Kotlin** — `kotlinc` is JVM-based, so live in-browser Kotlin needs a **JVM-in-browser** to run the compiler — the same dependency as Java. **Gated with Java: CLI-only until GraalVM-wasm (Espresso) can host kotlinc.** Kotlin/Wasm and Kotlin/Native exist but their compilers still run on the JVM at build time.

**Swift** — SwiftWasm cross-compiles Swift→wasm and offers a browser "Pad," but an **in-browser `swiftc` is unproven** (swiftc is large/LLVM-based; the Pad likely compiles server-side), and SwiftWasm is community-maintained / not fully upstreamed. **Decision: CLI-only + disclosed, revisit** — more hopeful than Rust given active SwiftWasm, but not production-grade in-browser today.

**Rust** — **no production in-browser `rustc`** as of 2026 (self-host request rust-lang/rust#62202 open since 2019; all Rust→wasm is cross-compile-on-dev-machine). **Decision: Rust stays CLI-only with a clear in-UI "no browser runtime yet" note; revisit as tooling matures.**

## Harness contracts

- **Compiled langs (C/C++/C#/Go/Java):** reuse the CLI harness — compile user-solve + `Harness.*`, run, JSON stdin/stdout marshalled by the harness. Same artifact as the CLI.
- **WAT:** export a `solve`; JS marshals inputs/outputs like the TS/JS path.
- **Retro CPU-core (6502/Z80/SM83):** NEW contract, per chip. A bare CPU has no OS/stdio. Define: entry address; where inputs are placed (registers / fixed RAM addresses); where the result is read (register / RAM location); halt/RET convention. This is the substantive new design work for the retro track (the cores/assemblers are off-the-shelf).
- **x86-64/arm64:** assemble+link to a static ELF; execute under the emulator with a minimal Linux syscall shim (read/write/exit) backing the same stdio harness as the compiled langs.

## Fidelity verification

- **Retro:** run SingleStepTests/jsmoo per-opcode suites against the chosen core in CI — cycle-accurate proof.
- **Compiled/asm:** differential testing — the same problem's reference solution run through both the CLI and the browser toolchain must agree on all cases (ties into the Phase C differential-testing work).
- Each runtime's optional inline divergence note states residual CLI mismatches plainly.

## Proposed sequencing

Prereq: **B1** (regression-test the 5 existing browser runtimes) lands first — don't build on an untested foundation.

1. **WAT** — trivial, native; establishes the "assembly-shaped" harness.
2. **PHP** — interpreter-in-wasm; drop-in like Python/Ruby, a fast early win.
3. **C / C++** — clang-in-wasm; proves heavy-toolchain vendoring + progress UI + the assemble pipeline reused later.
4. **C#** — Roslyn; moderate size.
5. **Zig** — self-hosted compiler-in-wasm.
6. **Retro trio (6502 / Z80 / SM83)** — small, provable, distinctive; establishes the CPU-core harness. (Could move earlier — small and high-value.)
7. **Dart** — dart2js self-hosted to JS; no WasmGC. Feasibility proven (Bx-13).
8. **x86-64** — Blink + clang-cross-assemble; introduces the ELF+syscall harness.
9. **arm64** — VIXL-in-wasm32 + GNU as/ld under Blink; all-permissive, spike proven (`docs/vixl-arm64.md`).
10. **Go** — gc-in-wasm (heavy).
11. **Java** — SHIPPED in-browser via teavm-javac (real javac on WasmGC).
12. **Kotlin** — with Java (shares the JVM-in-browser dependency); CLI-only until then.
13. **Swift** — deferred; CLI-only + disclosed until in-browser swiftc is real.
14. **Rust** — deferred; CLI-only + disclosed until an in-browser rustc exists.

Feasible now (Tiers 1–2): WAT, PHP, C, C++, C#, Zig, Dart, 6502, Z80, SM83. Gated/deferred (Tier 3): x86-64, arm64, Go (heavy but doable), Java, Kotlin, Swift, Rust.

Each target ships as its own PR (a `fetch-runtimes.mjs` entry + a `runtimes.js` loader + UI fidelity note + tests), verified before the next — same discipline as the rest of the platform.

## Decisions locked

- Live edit-compile-run required for all; disclose CLI divergence in UI + docs. *(product)*
- Retro trio: CPU-core-only; no Game Boy hardware. *(J. Fuentes)*
- Go: gc-in-wasm (faithful over light). *(J. Fuentes)*
- Rust: CLI-only until in-browser rustc exists. *(research-confirmed)*
- Java: SHIPPED in-browser via teavm-javac (real javac AOT to WasmGC); GraalVM-wasm was the pre-ship plan. Known JS-call-stack compile ceiling (docs/teavm-javac-compile-ceiling.md). *(shipped)*
- Kotlin: gated with Java (JVM-based compiler); CLI-only until GraalVM-wasm hosts kotlinc. *(research-confirmed)*
- Swift: CLI-only until an in-browser swiftc is real (SwiftWasm is cross-compile today). *(research-confirmed)*
- PHP / Zig: feasible now — php-wasm interpreter, self-hosted zig-in-wasm. *(research-confirmed)*
- Dart: **SHIPPED in-browser** (Bx-13b, #128/#129/#130) — dart2js self-hosts to JS, thin worker over a `.mjs` core, corpus + e2e smoke (the smoke asserts the compile-error path, not just the happy one). No dart2wasm, no WasmGC, no COI. *(shipped, Bx-13b)*

## Full corpus coverage

Already in-browser: JavaScript, TypeScript, Python, Ruby, SQL (PGlite), frontend (HTML/CSS/JS), Go, Java, C, C++, C#, Rust, arm64, riscv64, Dart.
Feasible to add now: WAT, PHP, Zig, 6502, Z80, SM83.
Gated/deferred: x86-64, arm64, Go, Kotlin, Swift, Rust — each with the reason and revisit-trigger above. Every corpus language is accounted for: none is silently dropped; the gated ones stay CLI-only with in-UI disclosure until their path matures.
