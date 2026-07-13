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
      Green e2e in rust-smoke.spec.js. **Deferred:** panic line-numbers point at the synthesised
      main.rs (preamble offset -- map back to editor lines); Complexity Lab time/space not yet
      wired for Rust (Miri is a slow interpreter -- expect heavy overhead-domination like C# fib).
- [ ] **Bx-7. x86-64** -- Blink emulator (ISC) on real ELF; assemble user asm -> ELF ->
      Linux-syscall harness. More pipeline than size. *Medium.*
- [ ] **Bx-8. Java** -- TeaVM + DoppioJVM. DoppioJVM (a JVM written in JS) runs the compiler
      (javac/ECJ) and the user's freshly-compiled bytecode in-browser; TeaVM can AOT the fixed
      ECJ frontend to JS to speed the compile step (TeaVM can't execute dynamic user bytecode).
      Sets up the JVM-in-browser base. *Medium; DoppioJVM looks largely unmaintained -- verify.*
- [ ] **Bx-9. Kotlin** -- same TeaVM + DoppioJVM base as Bx-8: run `kotlin-compiler-embeddable.jar`
      on DoppioJVM for source->bytecode, then execute. Gated on Bx-8. *Medium; kotlinc is huge +
      reflection-heavy, so it likely rides Doppio (TeaVM can't AOT it) and runs slow -- the risk.*
- [ ] **Bx-10. arm64** -- all-permissive path (retires the Unicorn/Keystone GPL route): assemble with
      clang cross-target `aarch64-linux` (Apache) -> ELF, execute on **arm-sandbox** (MIT aarch64 emulator)
      built to wasm via Emscripten. *Spike first: arm-sandbox is v0.1 + "incomplete A64" + solo -- Emscripten
      the core, run ~3 clang-assembled katas, measure missing instrs. Confirm the vendored clang has AArch64.*
- [ ] **Bx-11. Zig** -- self-hosted zig-compiler-in-wasm. *Spike first:* a turnkey offline
      client-side compile artifact is unproven; feasibility spike before it earns a slot.
- [ ] **Bx-12. Go** -- gc toolchain in wasm (faithful over light). *Spike first:* heavy +
      unpackaged for offline client-side; prove the path before committing.
- [ ] **Bx-13. Dart** -- dart2wasm. *Spike first:* dart2wasm is a host build-time compiler; a
      client-side (in-browser) compile path is unproven. WasmGC-only if/when it exists.
- [ ] **Bx-14. Swift** -- Emscripten + MiniSwift: MiniSwift built to wasm via Emscripten, run
      in-browser -- sidesteps the missing in-browser `swiftc` (like rubri does for Rust).
      *Subset, not real swiftc -> CLI-divergence to disclose; MiniSwift scope unverified -- confirm.*

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
