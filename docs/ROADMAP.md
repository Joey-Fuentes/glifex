# Roadmap

The sequenced plan. Sources: two external architecture/UX reviews (Jul 2026)
independently re-analyzed, merged with the project's own backlog.
**Tracking:** check items off here; STATUS.md records only what has shipped
and been verified. Rejected items stay listed WITH reasons — settled
decisions don't get relitigated by forgetting.

## Sequenced batches

### A — Architecture gates (before problem 003)
- [x] **A1. Harness single-sourcing + drift gate** — `glifex sync-harnesses`
      command + CI check that every problem's harness copies are
      byte-identical to `languages/templates/`. Kills the copy-divergence
      landmine at 34 files instead of 400. *Critical.*
- [x] **A2. IP + test-minimum policy** — contribution-policy additions:
      problem statements must be original prose (ideas aren't copyrightable;
      expression is — never copy LeetCode text); ≥6 test cases including
      named edge classes (empty, single, duplicates, negatives); verifier
      enforces the count. *Critical, one paragraph each.*
- [x] **A3. app.js modularization** — extract run-engines + UI wiring
      (storage/editor/assertions/runtimes are already out). Gate for all
      Phase U work: three silent failures came from string-surgery on this
      file. *High.*

### U0 — UI bug-tier + structural (with or right after A)
- [x] **U0-1. Markdown rendering** — statements currently show raw `##` and
      backticks. Bug, not enhancement. *Critical.*
- [x] **U0-2. Bake manifests into the corpus** → difficulty/tags/language
      badges in the problem list + statement header. The data exists since
      the policy landed; this is plumbing. Unlocks search/filter later. *High.*
- [x] **U0-3. Accessibility slice** — `aria-live` on results (screen readers
      currently hear nothing on Run), `:focus-visible`, labeled
      Export/Import buttons. *High.*
- [x] **U0-4. URL-hash permalinks** — link directly to a problem;
      prerequisite for sharing and SEO. *High.*
- [x] **U0-5. Run button shortcut hint (Ctrl+⏎)** + a 3-line hero for
      first-time visitors ("Practice algorithms in 18 languages. Runs in
      your browser, offline. No account."). *Medium.*
- [x] **U0-6. Statement | editor side-by-side on wide screens** (CSS grid;
      no resizable panes). *Medium.*

### B — Coverage + infrastructure (after A, interleaved with early corpus)
- [x] **B1. WASM-tier e2e** -- vendor in the e2e job + one smoke spec per
      runtime (all 8 `LOADERS`: TS/Python/Ruby/PHP/WAT/Postgres in
      `runtimes.spec.js`, C in `c-smoke.spec.js`, C++ in `cpp-toolchain.spec.js`;
      JS inline). Each asserts a *green* run; the `e2e` job vendors every
      runtime. The most-debugged subsystem now has regression coverage. *High.*
      (Cache-reuse of the vendor step across the `e2e`/`pages` jobs is a
      separate CI optimization, not required for coverage.)- [x] **B2. Asset-generation stamping** (`app.js?v=STAMP`) — ends SW
      HTML/CSS/JS generation skew (burned us twice). *Medium.*
- [x] **B3. Docs batch** -- architectural invariants section (incl. "blind
      practice is a UX convention, not a security boundary") + two mermaid
      diagrams in `docs/architecture.md`; README plugin-effort caveat (CLI
      plugin != playground tier) + browser-support paragraph; STATUS
      evidence-anchoring convention (claims cite commit/CI run). *Medium, one
      sitting.*- [x] **B4. Visibility batch** — OG/meta tags, README badges + screenshot,
      announcement post. A portfolio piece nobody sees is a diary. *Medium.*

### Bx — Compiled & assembly languages in the browser (before corpus growth)

Live edit-compile-run for every remaining corpus language, in the browser — lazy-loaded, one runtime at a time, honest download UI + CLI-divergence disclosure. Full design: [`browser-runtimes.md`](browser-runtimes.md). Prereq: **B1**.

- [x] **Bx-1. WAT** — native wasm; establishes the assembly-shaped harness — shipped with the 003 nth-Fibonacci problem.

  > **Relaxed for the compiler build-out (re-tighten later):** while we add browser

  > runtimes, *non-worked* problems relax three gates — the bulk `glifex test` practice

  > run is skipped (blank stubs), and floor-of-four + min-6-cases in `glifex verify` warn

  > instead of erroring. Worked examples (001/002) stay strict.
  > *(Later reverted -- 001/002 are no longer worked examples; see
  > contribution-policy.md. Worked examples deferred to a future phase.)*
- [x] **Bx-2. PHP** -- shipped. php-wasm interpreter (drop-in like Python/Ruby);
      in the `LOADERS` registry, green e2e in `runtimes.spec.js`, verified in STATUS.
- [x] **Bx-3. C / C++** -- shipped (caveats tracked). C via clang/WASIX (Wasmer),
      C++ via Binji wasm-clang; green e2e in `c-smoke.spec.js` / `cpp-toolchain.spec.js`.
      See STATUS "C++ runtime (Bx-3b)". *Follow-up: modern-LLVM clang rebuild (Bx-3b-2).*
      - Known issue, likely root-caused and fixed (pending live
        confirmation): the intermittent "RuntimeError: unreachable" trap
        described below turned out, on direct measurement, to correlate
        with a severe memory amplification bug in the shared C JSON
        parser's `jstr_()` -- it allocated a buffer sized to the ENTIRE
        remaining unparsed JSON on every string parsed, not just that one
        string, and those allocations are intentionally never freed
        (short-lived test process). Directly measured on a realistic
        Complexity Lab Analyze payload: 112x amplification (44MB
        allocated for a 394KB input) before the fix, 1.0x after. The
        distinguishing evidence that pointed here rather than at generic
        SDK flakiness: the trap was reported as happening almost every
        time at large input sizes, not intermittently -- inconsistent
        with random instability, consistent with a deterministic memory
        problem. Fixed by computing each string's own actual length
        before allocating, instead of "everything left to parse."
        Genuinely intermittent SDK-level flakiness (the linker-failure
        variant below) is a SEPARATE, remaining issue, not addressed by
        this fix.
      - Known issue (still open, unfixed, third-party SDK limitation):
        the Wasmer/WASIX C runtime intermittently crashes or fails to
        compile -- observed as either the uncaught "RuntimeError:
        unreachable" above, or a clang/lld linker failure with no
        apparent cause in the user's own code. Confirmed NOT a
        cross-call state-leakage bug: every C run is isolated into its
        own fresh Worker with the SDK fully re-initialized (see
        web/c-worker.js), and the failure still occurs occasionally even
        so -- other runs and languages are unaffected afterward, and
        re-running the same attempt often succeeds. Consistent with
        independently-reported instability in this exact SDK version
        doing similar in-browser clang/LLVM work elsewhere. Diagnostic
        breadcrumb logging (stage + source/case-size context, both in
        the worker and its caller) added to correlate future occurrences
        against specific inputs rather than guessing from one data
        point; Wasmer's own `initializeLogger("debug")` is available as
        a deeper layer if this needs another pass. Deliberately NOT
        worked around with automatic retry -- would mask the signal
        needed to actually diagnose it. [Bx-3-wasmer-known-issue]
- [x] **Bx-4. Retro trio (6502 / i8080 / SM83)** -- CPU-core-only; OSS cores +
      GoodASM + SingleStepTests vectors run in CI = deterministic,
      silicon-accurate proof. Smallest, most-verifiable, no GC/threads/COI.
      Shipped: 6502 and SM83 via Tom Harte SingleStepTests; i8080 (a
      documented plan pivot from the originally-scoped Z80 -- Tom Harte
      vectors don't exist for the 8080) validated instead against the CP/M
      diagnostic ROM suite, including the exhaustive 8080EXM
      (23,803,381,171 cycles, every CRC matching real Intel silicon).
      Full detail: STATUS.md's "Retro track" and "Operational" sections.
- [x] **Bx-5. C#** -- SHIPPED. Roslyn on .NET-wasm; the mature "real compiler, client-side" story
      (Blazor-class). Work: wire `Console` I/O to the harness. *High.*
      Shipped: persistent module worker (web/csharp-worker.js) boots the vendored
      .NET-wasm runtime once and calls a managed runner (web/csharp-runtime/) that
      Roslyn-compiles the UNMODIFIED CLI Harness.cs + the editor source and runs it
      -- single-threaded (WithConcurrentBuild(false), no COI), byte-image references
      (Basic.Reference.Assemblies, since a.Location is empty in wasm). Vendored at
      deploy like C/C++ (dotnet publish -> web/vendor/csharp/, gitignored). Green
      e2e in csharp-smoke.spec.js; runner proven in csharp-runtime-validate.
      Bx-5c: moved OFF the main thread (module worker + self.window=self shim so the
      .NET loader takes its web boot path, + addEventListener not self.onmessage --
      the loader installs its own onmessage during boot; root-caused in a real
      browser). Bx-5d: Complexity Lab time + space (harness [METRIC] adaptive-repeat
      Stopwatch + [SPACE] GC allocation volume). NOTE: Lab time/space CLASSIFICATION
      still needs per-language ladder tuning -- real-O(n) workloads classify
      correctly (two-sum: O(n)/O(n)), but small-n problems like fib read O(1) under
      per-call overhead (same effect seen for JS/WAT). Deferred.
- [x] **Bx-6. Rust** -- SHIPPED. Miri (MIR interpreter) in wasm, *not* `rustc` -- sidesteps the
      in-browser linker problem. Vendored from LyonSyonII/rubri (bjorn3's Miri-to-wasm +
      browser_wasi_shim); all-permissive (MIT / Apache-2.0). Pinned nightly ~1.78, edition 2021.
      web/rust-worker.js runs Miri in a Web Worker: it synthesises a single-file program
      (json.rs inlined + the editor's solve + the cases embedded + a harness main) and
      interprets it -- verdict-identical to the CLI (solve single-sourced; only input delivery
      differs). Minimal sysroot: the 23 rlibs std actually links + miri.wasm (test/proc_macro/
      getopts/unicode_width dropped; the backtrace/compression stack are std hard-deps and stay
      -- so compile-error + panic output is intact). Vendored at deploy like the others
      (web/vendor/rust/, gitignored, ~122MB raw / ~65MB gzip, cached). Panics truncate Miri's
      unsupported-unwind noise to the real message + location. Corpus at 4 variants incl. 003.
      Green e2e in rust-smoke.spec.js. Complexity Lab time + space (heap) both work and classify
      correctly (validated locally: two-sum -> time O(n)/Omega(1), space O(n) "peak heap"): the
      synthesis interposes a #[global_allocator] (peak live bytes -> [SPACE]) and times each solve
      warmup + best-of-2 under Miri's virtual clock (~proportional to work -> [METRIC]); Miri is
      ~1000x slow so rust uses a small per-language Lab ladder (wallByLang), Analyze ~2min.
      Panic + compile-error locations are mapped from the synthesised main.rs back to the editor
      line (validated: panic -> editor line, E0308 -> editor line). STACK is not measurable under
      Miri (abstract stack model; no poison-scan; std::backtrace unsupported), so space is heap-only
      like C#; fib stays overhead-dominated at its tiny n (same as JS/WAT). Track complete.
- [x] **Bx-7. x86-64** -- SHIPPED (checkbox was stale). **Blink** (ISC) built to wasm and
      vendored at `web/vendor/asm-x86_64/` (`blinkenlib.js`); `web/asm-x86-blink.mjs` is a minimal
      port of x86-64-playground's `blink.ts`. The user's AT&T/SysV asm is assembled + linked by the
      **guest `as`/`ld` running under Blink itself**, then -- the novel part -- `asm-x86-worker.js`
      drives the guest function directly: set registers + guest memory, jump `rip` to the symbol,
      single-step to its `ret`, read `rax`. No C, no libc, no ELF-loader/syscall harness needed.
      Emulated x86-64 runs uniformly regardless of the user's real CPU, so an ARM-laptop user can
      run x86-64 asm they cannot execute natively. CLI is arch-scoped (see STATUS: browser ✅,
      arch ⏭, ABI ⏭ -- hand-written SysV AT&T; the Windows x64 ABI differs in rcx/rdx, scoped by
      design).
- [x] **Bx-8. Java** -- SHIPPED. Real `javac` in the browser via **teavm-javac** (TeaVM's
      AOT-compiled javac on the WasmGC backend), *not* the originally-planned DoppioJVM/GraalVM.
      Vendored playground snapshot at deploy (`web/vendor/java/`, gitignored, like the other
      runtimes). `web/java-worker.js` compiles in a Web Worker: boots teavm-javac once (cached
      per source), detects the class that `implements Solution` (any variant name --
      Practice/Clean/Optimized/BruteForce -- runs, like the other languages calling `solve`),
      strips the interface, injects a fixed timing `main`, compiles that one class, and runs it
      with the test cases fed at **runtime** as `main` args (US/GS separators, printable result
      marker) -- same result shape as the csharp/rust workers, so the Complexity Lab + test
      runner drive it with no lab.js changes. **The compile ceiling is inherent, not a
      misconfig:** teavm-javac exhausts the browser's fixed JS call stack on deep compile-time
      recursion (annotations especially) -- root-cause analysis + mitigations in
      docs/teavm-javac-compile-ceiling.md. We keep the harness within it (no `@SuppressWarnings`,
      minimal harness); within that headroom HashMap, Arrays.sort, generics, `List.of`, and naive
      recursion all compile+run. Corpus at 4 variants incl. 003 (brute-force uses the repo
      convention: file `Brute-force.java`, non-public `class BruteForce`; the CLI Harness
      reflection PascalCases hyphen parts, mirroring C#). Complexity Lab: time measured (per-case
      nanos); space display-only (no in-browser allocation instrumentation). All 12 variants
      validated live in the worker.
- [ ] **Bx-9. Kotlin** -- BLOCKED in-browser; CLI-only. The original plan (TeaVM/Doppio) is dead,
      and the risk called out here was correct -- just understated. Every vehicle was tested, not
      guessed:
      **TeaVM cannot AOT kotlinc.** CI-proven: kotlin-compiler-embeddable 2.4.10 + teavm-maven-plugin
      0.15.0 aborts with **121 distinct unresolved JDK classes** -- `java.util.concurrent`(+locks,
      atomic), `kotlinx.coroutines`, `javax.xml.stream`, `java.lang.management`, `java.awt`/`beans`.
      Structural (TeaVM's classlib is a JDK *subset*, and it restricts reflection/classloaders/JNI/
      threading), not shimmable; near-exact precedent = Dotty/Scala-3 at ~1,643 errors. Details in
      docs/teavm-javac-compile-ceiling.md.
      **teavm-javac cannot host it:** its javac classpath is the fixed SDK `.bin`; `addJarFile` feeds
      only the TeaVM stage. **DoppioJVM:** unmaintained, will not load Java 21 bytecode.
      **CheerpJ runs real kotlinc** but is a *runtime, not a baker* -- nothing to vendor -- and its
      Community License forbids self-hosting, so it breaks offline + no-runtime-fetch.
      **Emulated Linux (the "langbox")** works and is ON HOLD -- real kotlinc in a browser tab, no
      server, measured at ~1015s/compile under a flat ~300x emulator tax. Full measurements +
      upstream mechanics in **docs/langbox.md**.
      *The finding that outlives all of it:* **kotlinc is ~94% startup** (one JVM, repeated compiles,
      native: 3595ms -> 368 -> 246 -> **230ms**). A resident compiler daemon removes almost the whole
      cost, wherever Kotlin eventually runs. Not the heap (-Xmx256m == 4GB), not `-include-runtime`,
      not `.kts`, not the guest JIT -- all measured, all ~flat.
      *Most promising path:* **OpenJDK Zero compiled straight to wasm** -- no QEMU, no Alpine, no
      emulator at all. The same author whose QEMU+Alpine JavaBox was the langbox precedent has since
      done exactly this ("no longer using alpine linux and QEMU, compiled OpenJDK Zero to
      WebAssembly"). **Zero** is the interpreter-only HotSpot build with no assembler for any arch,
      so **no JIT -> no self-modifying code -> the SIGSEGV that killed our resident daemon cannot
      occur** (that crash was a consequence of JIT-under-emulation, not a bug to fix); and with no
      QEMU there is no TCI, which *is* the ~300x. ~75MB (3MB code + 72MB data) vs the langbox's
      435MB; 256/512MB vs QEMU's 3000MB heap; boot target ~3-5s vs ~55s. The link has **no
      ASYNCIFY**: real pthreads + `-mtail-call` (what a bytecode interpreter's dispatch loop wants)
      + a SharedArrayBuffer/`Atomics.wait` stdin ring. A real JVM in wasm unblocks the whole family:
      Kotlin, **and un-ceilings Bx-8 Java** (teavm-javac's JS-call-stack limit is a TeaVM artifact --
      Zero has none), plus Scala/Clojure/Groovy. The port is **~26 files** in OpenJDK's standard
      porting dirs (`src/hotspot/os/emscripten/` ~15, `src/hotspot/os_cpu/emscripten_zero/` ~11) --
      textbook shape, not smeared across the JDK; upstream already ships `os/linux/` +
      `os_cpu/linux_zero/` to copy from. **Blocked on one accident:** his `openjdk` gitlink
      (`97a3d2372d457c5a72413df14bf08cf99545c695`, branch `wasm-emscripten`) has **no `.gitmodules`**
      -- `git add` instead of `git submodule add` -- so the fork is unreferenced, unpublished, and
      the repo cannot be built by anyone but him (issue filed). *Caveat from his own Known
      Constraints:* **"JVM internal threads (Finalizer, GC) may fail to start"** under Emscripten
      pthreads -- fine for javac/Doom, but kotlinc is aggressively multi-threaded (we measured
      user 37m > real 22m), so **Bx-8 Java un-ceilinged is the safer first tenant**. Not yet
      validated on our own numbers: his benchmark script *measures* rather than reports, so
      "actually fast now" is still his claim -- his live deploy could be measured without the fork.
      Full writeup in **docs/langbox.md**.
      *Fallback path:* **minikotlin** (minikotlin.run) -- a from-scratch Kotlin->WasmGC compiler
      **written in C and itself compiled to wasm**, so `.kt` in / running `.wasm` out, entirely
      client-side. That is the shape glifex already ships for eight languages: no emulation, no
      ~300x, no ~800MB. A subset (though a substantial one: vtables via `call_ref`, interfaces,
      data/sealed/enum, smart-casts via `ref.test`, generics, coroutines with real continuations,
      657 frontend tests) -- so CLI-divergence to disclose, like MiniSwift. **Not yet public**;
      author states "soon" and has a track record (his Swift frontend `toprakdeviren/msf` is MIT on
      GitHub). *Revisit triggers: the OpenJDK wasm-emscripten fork is published (or someone lands
      `wasm32-unknown-emscripten` upstream), OR minikotlin source published, OR an OSS offline self-hostable
      JVM-in-browser appears (or CheerpJ's licence changes), OR JetBrains self-hosts kotlinc via
      Kotlin/Wasm -- note that last one is architecturally hard: Kotlin/Wasm's stdlib has no `java.*`
      at all and kotlinc embeds IntelliJ-core Java source.*
- [x] **Bx-10. arm64** -- SHIPPED. Full record, numbers and dead ends:
      `docs/vixl-arm64.md`. **Neither half went the way this entry originally
      planned.** Not arm-sandbox (v0.1, incomplete A64, ELF-loader-only, no
      register-write/step API) and not clang: the emulator is **VIXL**
      (`gitlab.arm.com/runtimes/vixl`, BSD-3, Arm/Linaro -- the simulator Android
      ART and SpiderMonkey test with), built to **wasm32** (2.09 MB, ~0.92 M
      insn/s). Nobody had built VIXL to wasm before; the research claim that it
      needs an LP64 host was wrong three times over -- it builds at 4-byte
      pointers, it runs, and wasm32 is ~2.9x faster than wasm64.
      The **assembler** is GNU `as`+`ld` cross-targeting aarch64, run as guest
      ELFs **under Blink** -- reusing Bx-7's already-vendored emulator, so the
      assembler half cost no new technology. They must be **musl**-static: a
      glibc-static `as` SIGSEGVs under Blink, and the recipe is the
      x86-64-playground's own `compile_musl_binutils.sh`, retargeted. Blink stays
      x86-64-guest-only -- it runs the *toolchain*, which is an x86-64 binary
      that *emits* aarch64; it never executes arm64.
      Pipeline, all in a Worker: `.s` -> Blink(as) -> Blink(ld) -> relocate
      PT_LOADs to a 4K-aligned base -> VIXL -> x0. `adrp` is PC-relative, so
      linked ELFs relocate freely and the corpus needs **no** position-
      independence constraint. Output byte-identical to native
      `aarch64-linux-gnu-as` on every kata. ~3.1 s/solve, ~9.5 MB vendored.
      Det tier with **exact** instruction counts (VIXL single-steps); ladders
      mirror asm-x86_64 (001/002 `[32..512]`, 003 `[4..20]`).
      *Two findings worth carrying forward:* VIXL's guest stack defaults to
      **8 KB** (it was built to run JIT'd fragments, not programs) -- raised to
      1 MB, since native gives 8 MB and the gap is an invisible cliff. And a
      det-tier language inherits its ladder at RUNTIME, so an absent
      `sizes.det` silently means the full wall ladder -- which shipped, and is
      what `web/lab-ladder.test.mjs` now guards.
- [ ] **CI dependency hardening** -- not a Bx track; affects every track already
      shipped. Every vendored runtime is fetched at deploy from a third party, and
      a pinned ref protects against *change*, not *unavailability*. Java fetches
      from a single project own web server (teavm.org) and answered 415 during
      Bx-10 vendor work -- cause never confirmed, and the stale cache had been
      hiding a broken cold re-vendor on main. arm64 added two more single-origin
      deps (ftp.gnu.org, gitlab.arm.com). Options and evidence:
      `docs/ci-dependency-hardening.md`. *Cheapest first step: a scheduled
      cold-vendor canary with no cache, so the next break surfaces on a Tuesday
      instead of at the next cache-key bump.*
- [ ] **Bx-11. Zig** -- self-hosted zig-compiler-in-wasm. *Spike first:* a turnkey offline
      client-side compile artifact is unproven; feasibility spike before it earns a slot.
      *Langbox spike done (2026-07-15, ON HOLD -- see docs/langbox.md):* real `zig` 0.14.0 inside
      emulated Alpine ran in-browser (`zig version` answered), but `zig build-exe hello.zig` wedged
      the guest -- LLVM backend, likely OOM, on a small VM under a ~300x tax. Zig was dropped from
      the spike in favour of a gcc/kotlinc ladder that isolates the cost. Note `zig1.wasm` exists in
      Zig's own bootstrap chain -- a wasm build of the compiler -- which is worth a look before any
      emulated route.
- [ ] **Bx-12. Go** -- gc toolchain in wasm (faithful over light). *Spike first:* heavy +
      unpackaged for offline client-side; prove the path before committing.
      *Langbox (ON HOLD, docs/langbox.md)* would run the real `go` toolchain but at ~300x with a
      ~400MB SDK on top of a ~400MB substrate, and Go compiles are one-shot (no daemon to amortise
      startup, unlike the JVM). The `gc` compiler is written in Go and Go targets `wasip1`, so
      **self-hosting is the path to check first** -- same argument that makes Bx-13 tractable.
- [ ] **Bx-13. Dart** -- **likely the easiest remaining track, not the hardest.** The note below
      was right that *dart2wasm* is a host build-time tool -- but the client-side path is not
      unproven, it **shipped**: Google's `try.dartlang.org` (2013) compiled Dart to JS **in the
      browser, offline**, by running **dart2js on itself** -- dart2js is written in Dart, so it
      self-hosts to JS and the browser runs the output natively. The structural reason this works
      for Dart and not Kotlin: **no JVM underneath.** kotlinc needs a JDK (121 missing classes);
      dart2js needs only Dart's core libs. The blocker shrinks to a `dart:io` shim (virtual FS),
      not a runtime port. No emulation, no ~300x, no vendored VM -- the same shape as the eight
      tracks glifex already ships.
      *Spike:* self-compile a modern dart2js (or dart2wasm, the modern equivalent) to JS/wasm and
      measure the artifact size + compile time; try.dartlang.org was retired (DartPad went
      server-side) and today's compiler is bigger and leans harder on `dart:io`.
- [ ] **Bx-14. Swift** -- Emscripten + MiniSwift, but **the scope caveat resolved badly: MiniSwift
      (`toprakdeviren/msf`, MIT, C11, no deps, 280+ tests, has a `make wasm` target) is a FRONTEND
      ONLY** -- "Lexer -> Parser -> Sema -> typed AST. No LLVM, no codegen, no runtime." It cannot
      emit or execute anything, so **it cannot back a Swift track** (glifex must run code and check
      results). This entry needs a new plan.
      *Still useful today:* msf built to wasm would give real in-editor Swift **diagnostics** (type
      errors, resolved types) for a language glifex otherwise cannot touch -- a legitimate half-track.
      *Watch:* the same author's **minikotlin** is a full from-scratch compiler *with* a WasmGC
      backend (see Bx-9). If he applies that backend to msf's frontend, Bx-14 becomes real. Other
      options remain SwiftWasm (compiles Swift *to* wasm at build time -- does not put `swiftc` in
      the browser) or the langbox (ON HOLD; `swiftc` is the heaviest possible tenant -- LLVM,
      glibc/Ubuntu-oriented, one-shot compiles, ~300x). See docs/langbox.md.

### L -- Complexity Lab (browser face of C3; the falsifier doctrine applies)

Empirical growth analysis inside the playground: seeded input families at
growing sizes, correctness-gated against the JS clean oracle, judged by
consecutive growth ratios (constants cancel; absolute cross-language speed
never enters a verdict -- Decision 6 holds). Notation done properly: worst/
average/best CASE are input families; O / Omega / Theta are BOUNDS on any of
them. The declared O is tested on the adversarial family, the declared Omega
on the easy family; a Theta badge appears only when both ends pin one class.

- [x] **L1. Browser complexity falsifier, all tiers** -- per-case metric
      samples through the existing runner contract (caseLoop + js-runtime
      wall ns, retro per-case cycles/space, C/C++ harness `[METRIC]` lines
      behind `--metrics`, PHP in-script timing); engine battery in CI;
      e2e smoke on the JS track. Deterministic (cycle) tracks get tight
      tolerance and exact verdicts; wall tiers get medians + loose
      tolerance and honest "inconclusive" below timing resolution. Grew
      well past its original scope: declared bounds are now per-variant
      (brute-force / clean / optimized can each declare a different
      bound, not one shared per-problem value), with two distinct judging
      modes (revealed -- test the open reference's own bound; empirical-
      match -- no reveal, measure first and report which known variant(s)
      match). Full detail, evidence, and the still-open C-runtime known
      issue: STATUS.md's "Complexity Lab (L1)" section.
      - Known issue (documented in the PR that added this line;
        not yet fixed): the wall-tier adaptive-repeat sampler can
        produce a false REFUTATION (not just "inconclusive") on
        cheap, side-effect-free solutions -- a dead-code-elimination
        / JIT-noise gap in the sampler itself. Candidate fixes: an
        anti-DCE sink, and a magnitude/consistency floor for the
        inconclusive check. [L1-dce-known-issue]
      - Known issue, root-caused (not yet fixed): a real CI failure
        pattern (near-total point disagreement, e.g. 22-30 of 30, on
        e2e/lab.spec.js's JS/Fibonacci tests) survived four rounds of
        statistical robustness fixes (min-of-N sampling, rep-level
        outlier replacement, a replacement time budget, and majority-
        agreement point reliability -- see web/lab.js and
        web/lab-engine.mjs's isReliable()) before the actual mechanism
        was found: e2e/lab.spec.js runs non-cross-origin-isolated
        (confirmed via self.crossOriginIsolated === false and a
        directly-measured ~0.2ms clock granularity in that exact
        environment) -- e2e/coi.spec.js is the only spec that
        deliberately isolates itself (register the SW, then reload).
        Chrome coarsens performance.now() to 100us resolution (plus
        deliberate random jitter, a separate anti-fingerprinting
        measure) outside a cross-origin-isolated context, versus 5us
        inside one -- a 20x difference. The wall-tier sampler's
        adaptive-repeat loop doubles its repeat count until crossing a
        2ms window; for a very fast operation (small-n Fibonacci can be
        nanoseconds per call), that doubling interacts badly with a
        clock this coarse -- each step's overshoot past the quantization
        boundary is essentially arbitrary, producing systematic (not
        occasional) noise across nearly every measured point, which
        explains why the four statistical fixes each helped partially
        (they make the estimator more robust to noise in general) but
        none fully resolved it (none address the clock resolution
        itself). Candidate fix: make the Lab's own page cross-origin
        isolated the same way e2e/coi.spec.js already proves is
        possible (register the service worker, reload through it) --
        a real architectural change, not another statistical layer;
        scoped out but not yet built. [L1-coi-clock-known-issue]
      - Coverage gap, not a bug: `e2e/lab.spec.js` (the only e2e spec that
        exercises Analyze at all) never switches languages -- it only ever
        runs the Lab against a hardcoded JavaScript fixture. Every
        compiled-language Analyze bug found in this session's C/C++ work
        (a WASM-backend crash, a fixed-capacity hash table that could
        hang at large n, a worker-reuse bug, a severe memory-amplification
        bug) happened in exactly the part of the surface this suite was
        never watching. [L1-e2e-analyze-js-only-gap]
- [ ] **L2. Manifest promotion** -- move generators + declared O/Omega into
      problem manifests with verifier support; reconcile with the C3 CLI
      falsifier so browser and CLI share one source of truth.
- [x] **L3. Worker migration + bigger ladders** -- moved lab execution off
      the main thread for every runtime (JS, TypeScript, Python, Ruby, PHP,
      WAT, Postgres, the retro CPU trio, C, and C++), spawning a fresh
      worker per call rather than reusing one across a session -- closes
      the hang-exposure class where a single stuck call (runaway user
      code, or a genuine bug like C++'s hash-table issue below) could
      poison every subsequent call for the rest of the session, not just
      that one. C already had this from earlier work (STATUS.md's C
      runtime section); C++ did not until this batch, and needed it for
      the same reason C originally did. Size budgets raised: the
      Complexity Lab's ladder extended from 5 to 10 points (up to n=32768,
      from n=1024), grounded in a real, observed timing measurement
      (~20s for the original 4-point ladder scaled to ~40s for 10, well
      under the 2-minute outer runtime-lock timeout) rather than a guess.
- [x] **L4. Space complexity falsifier** -- the declared-bounds system
      (time: O/Omega/Theta) now tests declared SPACE too, same doctrine
      (refute, never confirm) against measured space growth. Landed across
      every executable track: the exact tracks get hard verdicts
      (`judgeSpaceUpper`, web/lab-engine.mjs -- upper-only, O(1)-aware via a
      pure flatness test rather than the time-tier bHat correction); the
      approximate tracks render the measured per-size series + step-ratios
      with an honest "hint, not proof" disclaimer. A conditional Time|Space
      tab + byte-axis chart renders wherever a space signal exists, with a
      second (dashed) recursion-depth line where a stack metric applies.
      **Method per track.** retro 6502/SM83/i8080 -- exact per-cell RAM
      high-water + code bytes (web/retro-worker.js). WAT -- exact
      linear-memory zero-scan high-water. Python -- exact `tracemalloc` heap
      peak + `settrace` max stack depth. C++ (binji) -- approximate PEAK:
      global `operator new`/`delete` interposed to track a live/peak byte
      counter (every STL alloc + `make_rc` routes through it), bracketed
      around the solve, + a bounded stack poison-scan. C (WASIX clang) --
      approximate PEAK: the worker `clang -include`'s a prelude that
      interposes `malloc`/`calloc`/`realloc`/`free` across every translation
      unit, same peak-delta + poison-scan. JS/TS -- approximate peak via
      `performance.measureUserAgentSpecificMemory()` sampled at the
      allocation high-water, unlocked by the cross-origin-isolation change
      (the same COI wall as the L1 clock). Ruby/PHP -- approximate
      allocation VOLUME (`total_allocated_objects` / snapshot diff): an
      upper bound on peak, not a true peak. Every non-exact track carries
      `spaceApprox` + a `spaceApproxKind` (`peak` for C/C++, else volume) so
      the disclaimer states exactly what was measured. The C/C++
      instrumentation is wasm-build-only (`#ifdef __wasm__` + a worker-only
      `-include`), so the native `g++`/`gcc` reference verify compiles the
      pristine harness and is unaffected.
      **Corrected prior claims:** earlier drafts said C/C++ do not report
      space and JS/TS stays unmeasured -- both are now live in production.
      **Remaining:** Go and Java stay display-only (declared space class
      shown, not measured) -- no in-browser execution path to instrument.
      C# now measures space (GC allocation volume) and time (adaptive-repeat
      Stopwatch) as of Bx-5d, though its Lab time/space classification still
      needs per-language ladder tuning (small-n problems like fib read O(1)
      under per-call overhead; real-O(n) workloads classify correctly).

### C — Corpus era (the forever-work; policy is law as of 002)
- [ ] **C1. Problems 003+** — floor-of-four, manifest-first, blank stubs,
      original statements. Portfolio strategy: range over count (one great
      graph problem beats five array problems).
- [ ] **C2. C kit + tree/list builders** — `kit.h` (dyn array, hash map,
      heap) + level-order JSON builders per floor language. *Trigger: the
      first map/tree/graph problem.*
- [ ] **C3. Input generators + differential testing** — per-problem
      generators (adversarial modes) feeding cross-language differential
      runs vs the Python clean oracle, and the empirical complexity
      falsifier (`glifex complexity` — refutes claims, never confirms).
      *Trigger: corpus ≥ ~10.*

### U1 — UI at corpus ≥ ~10 problems
- [ ] **U1-1. Search + filters** (difficulty/tags/solved) — depends on U0-2.
- [ ] **U1-2. Progress dashboard** — solved grid per language, personal
      bests. Local-only. **No streaks** (see Rejected).
- [ ] **U1-3. Empty-state workflow hint + run spinner.** *Low.*

### U2 — Content-coupled UI (during corpus era)
- [ ] **U2-1. Hints/editorial fields** in manifest + problem.md →
      progressive disclosure (hint → approach → reference). Authoring cost
      dominates; UI follows content.
- [ ] **U2-2. Learning paths** as tag-ordered tracks. *Trigger: ≥20 problems.*
- [ ] **U2-3. Statement template** (constraints/examples/complexity-goal
      sections) — folds into the contribution policy.

## Parked (named triggers, not forgotten)
- Mobile-specific navigation — responsive tweaks only, until mobile-usage
  evidence. Works today (verified Android).
- Docs-tab sectioned navigation — when docs content triples.
- CI sharding / verify compile-caching — **trigger: any matrix leg > 15 min.**
- Plugin versioning/semver — trigger: first external plugin PR.
- requirements.md — trigger: second regular maintainer.
- Codespaces prebuilds, hosted-Postgres CI path, Go real bench, Dev
  Container confirmation — as needed.
- Lean proofs for the retro track — future design sessions; documented in README.
- Theme switcher, focus mode, personal notes, related problems — backlog;
  harvest on demand.

## Rejected (settled — reasons matter)
- **Streaks / badges / certificates / daily goals** — engagement-farming
  psychology contradicts the local-first, no-tracking identity the privacy
  page promises. Personal bests + solved counts are the honest motivation
  layer. Certificates without identity are decoration.
- **Heavy onboarding tour** — a one-screen app needs a 3-line hero, not a
  tour; discoverability (B4) precedes onboarding.
- **Six-category status ladder** — superseded by evidence-anchoring (B3).
- **ADR directory split** — docs/architecture.md's numbered Decisions
  already are the ADR log.
- **Cross-language benchmark comparison** — measures runtimes, not
  algorithms. Founding decision; stays rejected.
