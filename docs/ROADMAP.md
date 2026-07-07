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
- [ ] **B1. WASM-tier e2e** — vendor in the e2e job (reuse the cache) + one
      smoke spec per runtime. The most-debugged subsystem currently has zero
      regression coverage. *High.*
- [x] **B2. Asset-generation stamping** (`app.js?v=STAMP`) — ends SW
      HTML/CSS/JS generation skew (burned us twice). *Medium.*
- [ ] **B3. Docs batch** — architectural invariants section (incl. "blind
      practice is a UX convention, not a security boundary"), two mermaid
      diagrams, README plugin-effort caveat (CLI plugin ≠ playground tier),
      browser-support paragraph, STATUS evidence-anchoring convention
      (claims cite commit/CI run). *Medium, one sitting.*
- [ ] **B4. Visibility batch** — OG/meta tags, README badges + screenshot,
      announcement post. A portfolio piece nobody sees is a diary. *Medium.*

### Bx — Compiled & assembly languages in the browser (before corpus growth)

Live edit-compile-run for every remaining corpus language, in the browser — lazy-loaded, one runtime at a time, honest download UI + CLI-divergence disclosure. Full design: [`browser-runtimes.md`](browser-runtimes.md). Prereq: **B1**.

- [x] **Bx-1. WAT** — native wasm; establishes the assembly-shaped harness — shipped with the 003 nth-Fibonacci problem.

  > **Relaxed for the compiler build-out (re-tighten later):** while we add browser

  > runtimes, *non-worked* problems relax three gates — the bulk `glifex test` practice

  > run is skipped (blank stubs), and floor-of-four + min-6-cases in `glifex verify` warn

  > instead of erroring. Worked examples (001/002) stay strict.
- [ ] **Bx-2. PHP** — php-wasm interpreter (drop-in like Python/Ruby)
- [ ] **Bx-3. C / C++** — clang-in-wasm; proves heavy-toolchain vendoring + progress UI
- [ ] **Bx-4. C#** — Roslyn on .NET-wasm
- [ ] **Bx-5. Zig** — self-hosted zig-compiler-in-wasm
- [ ] **Bx-6. Retro trio (6502 / Z80 / SM83)** — OSS cores + GoodASM + cycle-accurate test-suite proof; CPU-core-only
- [ ] **Bx-7. Dart** — client-side dart2wasm (WasmGC-only)
- [ ] **Bx-8. x86-64** — clang cross-assemble + Blink-in-wasm; ELF+syscall harness
- [ ] **Bx-9. arm64** — Unicorn/qemu (GPL); heaviest emulation
- [ ] **Bx-10. Go** — gc-in-wasm (faithful, heavy)
- [ ] **Bx-11. Java** — GraalVM-wasm (javac+Espresso) when browser-ready; CLI-only until then
- [ ] **Bx-12. Kotlin** — gated with Java (JVM-in-browser); CLI-only until then
- [ ] Swift — deferred; no in-browser swiftc yet (CLI-only, disclosed)
- [ ] Rust — deferred; no in-browser rustc yet (CLI-only, disclosed)

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
