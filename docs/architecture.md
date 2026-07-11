# Architecture & decisions

The *why* behind Glifex, so the reasoning survives.

## Problem

A polyglot practice/benchmark tool that (1) supports many languages natively,
(2) enables blind practice, (3) keeps one source of truth for tests, (4) is
easy to run in VS Code across Linux/macOS/Windows, and (5) is AI- and CI-friendly.

## Decision 1 — One contract, per-language harnesses

Every solution is a single `solve(input) -> output` function with no I/O. A
generated per-language harness owns reading `test_cases.json`, running, and
diffing. This is what lets one problem run identically across languages, and what
makes solution files clean enough to drop into an AI context window.

## Decision 2 — Hide answers by filename, not by folder

The obvious "put solutions in `.solutions/`" breaks compiled languages: C#'s
MSBuild globs `**/*.cs` including dot-dirs, and Java can't use `.solutions` as a
package. Both would pull hidden answers into the build and collide. So references
are siblings named `clean.*` / `optimized.*`, hidden from the human via VS Code
`files.exclude` — visible to the compiler, invisible in the editor. (The database
track has no compiler, so it uses a `.solutions/` folder.)

## Decision 3 — Languages are a plugin registry, not hardcoded

The number of languages is open-ended. Each is a `languages/<name>.toml` the
runner, `doctor`, scaffolder, and (later) the VS Code pickers all read. Adding a
language is a config file + a harness template — never an edit to `glifex.py`.
This was a deliberate correction: an earlier design hardcoded the language list in
the runner's dispatch, which is the same drift trap the tool is meant to avoid.

## Decision 4 — The database track is a separate track, not a language

SQL problems need a running database and have a query contract, not a
`solve(input)` one. Forcing them into the language registry would break the model.
They live in `problems-db/` with their own harness, sharing the CLI and
blind-practice UX. The engine is pluggable: **SQLite** offline (zero infra, Python
stdlib) and **Postgres** hosted (Docker/psql). Benchmarking uses `EXPLAIN ANALYZE`
plan diffs, not wall-clock — the useful signal for SQL.

## Decision 5 — Cross-platform via a version manager, not 21 install guides

`.tool-versions` + `mise` collapses "install N languages on 3 OSes" into one
command. A Dev Container guarantees the environment; native package managers are
the fallback. Windows is steered to WSL2. `glifex doctor` reports the truth.

## Decision 6 — Benchmarking honesty

Cross-language nanosecond comparison measures the runtime, not the algorithm, so
it isn't offered. Within-language comparison delegates to each language's real
tool (`go test -bench`, JMH, BenchmarkDotNet, `pytest-benchmark`, tinybench). The
current `bench` is coarse in-harness timing pending that delegation.

## Decision 7 — The web playground is static and offline-first

Docs + an in-browser playground in `web/`, built from the same `problems/` corpus
so it can't drift from the CLI. Hard rule: **no server compute, no runtime fetched
at run time.** JavaScript runs natively (offline, zero setup); other languages use
WASM runtimes vendored once via `fetch-runtimes.mjs`; the DB track uses PGlite
(Postgres-in-WASM). This makes "offline === hosted" a guarantee, not a hope.

## Naming

`Glifex` was chosen after rejecting `pape` (trademark), `polysolve` (taken PyPI/npm
names), `heptaglot` (bakes in a fixed count of seven, conflicting with the
open-ended plugin model), and `lexiq` (crowded legal-tech trademarks). `Glifex` is
abstract, brandable, count-neutral, and its `glif-` root nods at glyphs/code.
Namespace/trademark checks remain the owner's to finalize.

## Decision 8 — CI gates you control; AI review is advisory

The quality pipeline is: lint → typecheck → corpus-staleness → polyglot matrix
(3 OSes) → playground engine → Playwright E2E (with an **offline-mode test** that
regression-checks the core promise) → CodeQL (SAST) + Trivy (SCA/secrets).
Auto-generated PRs were rejected (workflow-created PRs don't trigger CI with the
default token — a known GitHub trap), and AI review (CodeRabbit) is advisory,
never a required check: merge ability must not depend on third-party SaaS uptime.
Secrets are caught pre-commit (gitleaks) and by GitHub push protection — CI
scanning is the backstop; on a public repo, a secret reaching CI is already burned.

## Decision 9 — A required check must itself be required, and must actually be reported

A red `playground` job still deployed once: its downstream `e2e` job (`needs:
[playground]`) was skipped rather than failed, and GitHub's branch protection
treats a **skipped** required check as satisfying it, not blocking it — only a
genuinely failed one blocks a merge. Fixed with a single `ci-status-gate` job
that depends on every real job, runs unconditionally (`if: always()`), and
explicitly fails unless every dependency's result is `success` — required
status checks point at *this* job, not at any individual leg. A second,
independent gap let it through anyway: Deploy Pages triggered on `push:
{branches: [main]}` with zero awareness of whether CI had passed at all: fixed
by switching to a `workflow_run` trigger gated on `conclusion == 'success'`,
checking out the exact commit CI tested rather than assuming `main` hasn't
moved. Verified by deliberately breaking each gate on a real PR and confirming
merge/deploy correctly refused, not just by reasoning about the YAML. Full
incident account, every gotcha (including a required-check name silently not
matching what the job actually reports, which reintroduces the same failure
mode from a different angle), and the verification methodology: [CI/CD
pipeline](ci-cd.md).

## Invariants

Decisions above are choices; these are the load-bearing rules a change must not
quietly break. If a diff violates one of these, it is wrong even if CI is green.

1. **Blind practice is a UX convention, not a security boundary.** Reference
   solutions (`clean.*` / `optimized.*`) ship inside the corpus and the served
   page; the reveal panel and `files.exclude` only *hide* them. Anyone can read
   them via view-source or devtools. Never treat "hidden" as "secret," and never
   add a feature that depends on the answer being unreachable.
2. **One source of truth for harnesses.** Per-problem harness/support files are
   generated from `languages/templates/` by `glifex sync-harnesses`. A CI drift
   gate fails if any copy differs from its template. Edit the template, sync,
   then commit -- never hand-edit a per-problem copy.
3. **The corpus cannot drift from the source.** `web/problems.generated.json` is
   baked from `problems/**` by `web/build.mjs`; CI diffs it against the committed
   file. The playground and the CLI therefore run the same problems by
   construction.
4. **Offline === hosted.** No server compute and no runtime fetched at run time.
   JavaScript runs natively; every other in-browser language uses a WASM runtime
   vendored once at build time. If a change needs the network at run time, it
   breaks the core promise.
5. **Languages are config, not code.** Adding or removing a language is a
   `languages/<name>.toml` plus a harness template -- never an edit to
   `glifex.py`'s dispatch.
6. **CLI tier and playground tier are independent capabilities.** A language can
   be CLI-verified without an in-browser runtime; the playground tier requires a
   separately vendored WASM runtime. A new plugin is CLI-only in the browser
   until such a runtime exists.
7. **Cross-origin isolation is scoped to the C runtime.** Only the C (Wasmer)
   runtime needs `SharedArrayBuffer`; its one-time COI reload gate is C-only. The
   C++ runtime (Binji, single-threaded) must not depend on isolation.
8. **Deploys stamp assets to prevent skew.** Deploy rewrites asset URLs to
   `?v=<sha>` and self-versions the service-worker cache, because the SW serves
   each asset one generation stale and independently. Do not reintroduce
   unversioned asset URLs.

## Diagrams

**Single-sourcing and the two drift gates** -- how templates and problems become
the one corpus both tiers run:

```mermaid
flowchart LR
  T["languages/templates/*"] -->|sync-harnesses| P["problems/NNN-slug/lang/*"]
  TOML["languages/*.toml"] --> P
  P -->|"node web/build.mjs"| C["web/problems.generated.json"]
  C --> CLI["glifex test (native CLI)"]
  C --> PG["web playground"]
  P --> G1{{"CI drift gate: copy == template"}}
  C --> G2{{"CI staleness gate: corpus fresh"}}
```

**Playground run path** -- one contract, many runtimes, one result shape
(`.summary.ok` / `.summary.bad`):

```mermaid
flowchart TD
  U["user code + Run"] --> APP["web/app.js run path"]
  APP -->|javascript| JS["js-runtime.js (inline, native)"]
  APP -->|other langs| R["runtimes.js LOADERS"]
  R --> TS["typescript"]
  R --> PY["python (Pyodide)"]
  R --> RB["ruby.wasm"]
  R --> PHP["php-wasm"]
  R --> WAT["wat (wabt)"]
  R --> PGL["postgres (PGlite)"]
  R --> CPP["cpp (Binji wasm-clang, single-thread)"]
  R --> CC["c (Wasmer WASIX clang)"]
  CC -->|needs SharedArrayBuffer| COI["COI reload gate (C only)"]
  JS --> RES[".summary .ok / .bad"]
  R --> RES
```

