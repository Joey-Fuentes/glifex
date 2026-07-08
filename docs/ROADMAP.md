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
- [x] **Bx-2. PHP** -- shipped. php-wasm interpreter (drop-in like Python/Ruby);
      in the `LOADERS` registry, green e2e in `runtimes.spec.js`, verified in STATUS.
- [x] **Bx-3. C / C++** -- shipped (caveats tracked). C via clang/WASIX (Wasmer),
      C++ via Binji wasm-clang; green e2e in `c-smoke.spec.js` / `cpp-toolchain.spec.js`.
      See STATUS "C++ runtime (Bx-3b)". *Follow-up: modern-LLVM clang rebuild (Bx-3b-2).*
- [ ] **Bx-4. Retro trio (6502 / Z80 / SM83)** -- CPU-core-only; OSS cores + GoodASM +
      SingleStepTests vectors run in CI = deterministic, silicon-accurate proof. Smallest,
      most-verifiable, no GC/threads/COI. Front of the line. *High.*
- [ ] **Bx-5. C#** -- Roslyn on .NET-wasm; the mature "real compiler, client-side" story
      (Blazor-class). Work: wire `Console` I/O to the harness. *High.*
- [ ] **Bx-6. Rust** -- rubri: Miri (MIR interpreter) in wasm, *not* `rustc` -- sidesteps the
      in-browser linker problem. MIT, offline after first load. Kata-only scope: pinned ~1.78,
      no crates, no multi-file, limited I/O, slow output. *Medium.*
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
- Retro track (Z80/6502/SM83) — **pulled into Bx** (see browser-runtimes.md); Lean proofs still parked
  track — future design sessions; documented in README.
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
