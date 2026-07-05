# Project status — honest build report

What is **proven by execution** versus **written but not yet run**. Updated after
the Phase B–E build (CI, benchmarking, playground WASM glue, new languages).

## ✅ Verified green (executed in the build environment)

- **CLI**: `doctor`, `test`, `run`, `bench`, `new`, `new-db`, `reveal`,
  `db test`, `db bench` — all plugin-driven, no hardcoded language list.
- **Python / JavaScript / TypeScript** — `001` and `002`, all variants, pass.
- **C** — fully verified end-to-end with gcc: both problems, all variants,
  and bench showing a real 3× spread (practice ~338 vs optimized ~110 ns/case).
  Includes a vendored portable C JSON parser (no POSIX-only calls, MinGW-safe).
- **C++** — fully verified end-to-end with g++: both problems, all variants,
  compile stage, and coarse bench (~87 ns/case for optimized anagram). This
  proves the plugin registry's optional compile stage works.
- **Database track** — `db test` passes (SQLite) for all three query variants;
  **`db bench` shows real query-plan diffs** via `EXPLAIN QUERY PLAN`, and in
  doing so caught a genuine missing index in the sample schema (now fixed —
  plans show `SEARCH ... USING COVERING INDEX`).
- **Scaffolder** — generates correct, non-colliding files for all fifteen scaffolded languages (assembly/WAT are scaffold-opt-out by design).
- **Playground JS engine** — runs the baked corpus green, flags wrong answers.
- **Registry extensibility** — cpp/kotlin/swift were added as pure plugin files;
  `doctor`, `test`, and `new` picked them up with **zero runner changes**.

- **asm-x86_64** — REAL hand-written x86-64 assembly (AT&T syntax, SysV ABI)
  verified end-to-end: anagram in all variants passes, ~66 ns/case — the
  fastest implementation in the repo. The `arch` guard is verified too:
  asm-arm64 correctly skips on this x86_64 host instead of failing.
- **Frontend track** — the declarative assertion engine is unit-verified in
  Node (all five assertion types, pass and fail paths, with useful failure
  details); real computed-style verification runs in the Playwright suite.
  The card-layout problem bakes into the corpus correctly.

## ⚠️ Written but NOT executed here (verify locally / in CI)

No Go, Ruby, .NET, Kotlin, or Swift toolchain here, and a JRE without `javac`:

- **Go, Ruby, Java, C#** — harnesses + solutions for both problems.
- **Kotlin, Swift** — plugins + harness templates (no problem implementations
  yet; scaffold with `glifex new` and fill in).
- **Rust** — plugin, vendored dependency-free JSON parser, and solutions for
  both problems (module-based single-crate `rustc -O` build; `cargo
  bench`/criterion noted as the rigorous path). Verify: `glifex test 001 rust`.
- **asm-arm64** — AArch64 assembly (AAPCS64) for anagram; needs ARM hardware
  (Apple Silicon, RPi, Graviton). Verify there: `glifex test 001 asm-arm64`.
- **wat** — WebAssembly Text plugin + two-sum in hand-written WAT with a Node
  host that marshals arrays into linear memory. Needs `wabt` (`wat2wasm`).
- **Frontend E2E** — the three Playwright frontend tests (real computed styles,
  live preview) run with the rest of the E2E suite once Playwright is installed.
- **Dart** — plugin + solutions (stdlib `dart:convert`; variants namespaced
  via `import as`). Verify: `glifex test 001 dart`.
- **Zig** — plugin + solutions written against **Zig 0.14** `std.json`. Zig is
  pre-1.0 and std APIs shift between releases: expect small fixes on other
  versions; the pin lives in `.tool-versions`. Verify: `glifex test 001 zig`.
- **PHP** — plugin (stdlib `json_decode`, the cheapest harness in the repo) and
  solutions for both problems. Verify: `glifex test 001 php`.
- **Go real benchmarking** — `bench_test.go` template for `go test -bench .`.
- **CI workflows** (`.github/workflows/ci.yml`, `codeql.yml`) — written to
  spec but a workflow can only truly run on GitHub. First push will tell.
- **Playwright E2E** (`e2e/`) — includes the **offline-mode test** that proves
  the core promise. Needs `npm i -D @playwright/test && npx playwright install`.
- **Playground WASM glue** (`web/runtimes.js`) — loaders/executors for
  TypeScript, Pyodide (Python), ruby.wasm, and PGlite (in-browser Postgres).
  The package registry was proxy-blocked here, so runtimes could not be
  vendored or the glue executed. Run `node web/fetch-runtimes.mjs`, then test
  each language in the browser. **Expect small API-version fixes** — WASM
  runtime APIs move fast; verify current Pyodide/ruby.wasm/PGlite versions.
- **Pre-commit hooks / Ruff / Biome configs** — written; installs were blocked.
  Hook `rev:` pins should be bumped to current on first `pre-commit autoupdate`.

## 🔧 One-time steps

- Playground non-JS languages + in-browser DB: `node web/fetch-runtimes.mjs`.
- Local hooks: `pip install pre-commit && pre-commit install`.
- E2E: `npm i -D @playwright/test && npx playwright install chromium firefox`.
- GitHub repo settings (not files): enable **secret push protection**, branch
  protection on `main` requiring the CI checks, squash-merge for linear history.
  CodeRabbit: install as advisory, do **not** make it a required check.

## Known limitations (by design)

- Cross-language nanosecond comparison is not offered — it measures runtimes,
  not algorithms. In-harness `bench` is coarse and labeled as such; real rigor
  is per-language tools (Go's is wired; JMH/BenchmarkDotNet need dependency
  management and are future work).
- Java/Kotlin JSON parsers are vendored minimal implementations — correct for
  the corpus format, not general-purpose JSON libraries.
- The name `Glifex` still needs your GitHub/PyPI/npm + USPTO checks.

## Verify everything

```bash
python3 glifex.py doctor
for p in problems/*/;    do python3 glifex.py test    "$(basename $p)"; done
for p in problems-db/*/; do python3 glifex.py db test "$(basename $p)"; done
python3 glifex.py db bench 001
node web/build.mjs && python3 -m http.server -d web 8080
```
