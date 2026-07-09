# Project status — honest build report

> Planned work is tracked in [docs/ROADMAP.md](docs/ROADMAP.md) — this file records only what has shipped and been verified.

> **Evidence convention.** Every claim in this file is either (a) reproducible by
> the commands in [Verify everything](#verify-everything), or (b) anchored to the
> thing that proves it -- a CI job in `.github/workflows/`, an E2E spec in `e2e/`,
> or a specific commit. "Verified" means executed, not intended. Anything written
> but unrun lives under its own "Still written but NOT executed" section below,
> never mixed in with the proven work.

**All 18 registered languages are execution-verified.** Full CI matrix green
on Linux, macOS (Apple Silicon), and Windows; E2E green in real browsers
including the offline-mode test; site live at https://glifex.dev with honest
build-time versioning. This ledger records what is proven by execution versus
what remains written-but-unrun.

## ✅ Languages — 18 of 18 verified

| Language    | Linux | macOS (ARM64) | Windows | Notes |
|-------------|:-----:|:-----:|:-------:|-------|
| Python      | ✅ | ✅ | ✅ | |
| JavaScript  | ✅ | ✅ | ✅ | also runs natively in the playground |
| TypeScript  | ✅ | ✅ | ✅ | explicit-filename compile (cmd.exe doesn't glob) |
| Go          | ✅ | ✅ | ✅ | root `go.mod` provides module context |
| Java        | ✅ | ✅ | ✅ | vendored minimal JSON parser |
| Kotlin      | ✅ | ✅ | ✅ | explicit source list (kotlinc.bat doesn't glob) |
| Swift       | ✅ | ✅ | ⏭ tc | harness is `main.swift` (top-level statements rule); JSONSerialization-canonical compare defeats NSNumber bool/int bridging |
| Ruby        | ✅ | ✅ | ✅ | passed native Windows first try |
| C#          | ✅ | ✅ | ✅ | harness compares JSON-to-JSON |
| C++         | ✅ | ✅ | ✅ | gcc-is-clang on macOS confirmed fine |
| C           | ✅ | ✅ | ✅ | `_POSIX_C_SOURCE 200809L` (Apple libc hides snprintf under 199309L) |
| Rust        | ✅ | ✅ | ✅ | dependency-free vendored JSON parser |
| PHP         | ✅ | ✅ | ✅ | |
| Dart        | ✅ | ✅ | ✅ | |
| Zig         | ✅ | ⏭ env | ✅ | macOS runners: zig 0.14.0 can't locate libSystem at link — runner environment, not code |
| WAT         | ✅ | ✅ | ⏭ tc | hand-written WebAssembly Text; Node host marshals arrays into linear memory; wabt via apt/brew |
| asm-x86_64  | ✅ | ⏭ arch | ⏭ ABI | hand-written SysV AT&T; Windows x64 ABI differs (rcx/rdx) — platform-scoped by design |
| asm-arm64   | ⏭ arch | ✅ | ⏭ ABI | hand-written AAPCS64; Mach-O + ELF dual symbol aliases |

⏭ = deliberate, guard-enforced skip, shown honestly in run logs:
**arch** (wrong hardware) · **ABI** (calling convention scoped by design) ·
**tc** (toolchain absent on that runner) · **env** (runner environment defect).

## ✅ Playground WASM tier — verified in production, desktop + Android, online + offline

Five languages plus SQL run in the browser on glifex.dev: JavaScript (native),
TypeScript (vendored compiler 6.0.3), Python (Pyodide 0.28.0), Ruby
(ruby.wasm 3.4, `@ruby/wasm-wasi` umd), and PostgreSQL (PGlite 0.5.4).
Verified on desktop **and Android Chrome**, and **offline after first use**
(Python and Ruby replayed with the network severed — the SW caches runtimes on
demand; vendor files are deliberately not precached).

Runtimes are vendored at build time by `web/fetch-runtimes.mjs` (release-proof:
PGlite's hashed ESM chunks and wasm/data assets like `initdb.wasm` are
auto-discovered by scanning), each with its LICENSE; THIRD_PARTY_NOTICES.md
records the shipped set. First-contact lessons encoded:
- ruby's *iife* dist is the auto-run flavor with **no API**; the umd build
  carries `DefaultRubyVM`.
- **Capture UMD exports explicitly** (evaluate with an `exports` object) —
  probing window globals was device-dependent: passed desktop, failed Android.
- Loader failures surface as "failed to start" with console detail, never a
  false "isn't vendored"; the vendored-check uses `no-cache` so a fossilized
  pre-vendor 404 can never mask a present runtime.

## ✅ Playground v2 — verified in production (desktop + Android)

- **Local persistence** (localStorage, schema `glifex-progress-v1`): drafts
  autosave (500ms debounce), survive reloads ("draft restored · reset to
  starter"), keyed per track × problem × language (cross-language isolation
  verified). Merge semantics unit-tested in Node (11 tests): newest code wins,
  solved OR'd, attempts maxed, best time minned, hostile imports normalize.
- **Export / Import**: progress downloads as a JSON file the user owns; import
  merges. privacy.html's local-first promise, implemented and verified.
- **Draft-safe reveal**: side panel, clean/optimized tabs, explicit
  Reveal/Hide toggle (label = state, single writer), re-renders on
  language/problem switch; the editor is never touched.
- **CodeMirror 5.65.18** (vendored, MIT, in notices): highlighting, line
  numbers, dark theme, Ctrl/Cmd+Enter; mirrors into the original textarea;
  plain-textarea fallback if unvendored.
- **Post-run timing**: adaptive repetition (≥5ms window) because
  performance.now()'s ~0.1ms grain read fast JS as 0; median sample; labeled
  coarse; "compare vs optimized" runs the reference in the same runtime.
- **E2E**: 20/20 across Chromium + Firefox, including draft-survives-reload
  and the full reveal toggle cycle as contracts.
- Lessons: author `display` silently defeats the `[hidden]` attribute —
  re-assert `[hidden]{display:none}`; SWR serves each asset one-generation
  stale INDEPENDENTLY, so HTML/CSS/JS can skew during rapid deploys
  (follow-up: version-stamped asset URLs); runtime-injected CSS beats
  style.css on load order — win by specificity; batches must gate on
  `node --check`, not just report it.

## ✅ Tracks & infrastructure

- **Database track** — `db test` (ephemeral SQLite) and `db bench`
  (`EXPLAIN` query-plan diff) green on all three OSes.
- **Frontend track** — assertion engine unit-verified in Node AND verified in
  real Chromium + Firefox via E2E (computed styles, live preview).
- **E2E suite** — 18 passed (9 specs × 2 browsers), including the
  offline-mode test: "offline === hosted" is a machine-checked regression test.
- **WASM-tier E2E coverage (B1)** -- every runtime in the `web/runtimes.js`
  `LOADERS` registry now has a smoke spec that asserts a *green* run, so a
  regression in a loader fails CI instead of shipping silently: TypeScript,
  Python, Ruby, PHP, WAT, and PostgreSQL in `e2e/runtimes.spec.js`; C in
  `e2e/c-smoke.spec.js`; C++ in `e2e/cpp-toolchain.spec.js`; JavaScript runs
  inline. The `e2e` job in `.github/workflows/ci.yml` vendors each runtime
  before the run.
- **CI pipeline** — ruff (pinned), corpus-staleness gate, harness drift gate, 3-OS polyglot matrix
  with honest ran/failed/skipped summaries, playground engine check,
  Playwright E2E, Trivy, CodeQL: all green. Dependabot loop proven.
- **Guard system** — `arch` and `platforms` guards verified in all directions;
  Windows UTF-8 output; per-plugin `*_windows` command overrides.
- **Deployment** — GitHub Pages → https://glifex.dev, custom domain + TLS,
  honest versioning (badge reports the rendered page's own embedded version;
  newer deploys surface as an explicit refresh prompt; `/version.json` is the
  machine-readable health check). Build and deploy are separate jobs, so
  re-running a failed deploy is safe. Site footer links Privacy and Licenses;
  SECURITY.md + prepared THIRD_PARTY_NOTICES.md in place.

## ⚠️ Still written but NOT executed

- **Postgres hosted DB engine** — SQLite path proven; Docker/psql path unrun
  (Docker IS present on Linux/Windows runners, so it's CI-verifiable).
- **Go real benchmarking** — `bench_test.go` templates exist; `go test -bench`
  has not been executed.
- ~~Dev Container~~ — **verified**: Codespaces build succeeded (Jul 2026) on a
  4-core/16 GB machine, delivering exactly the declared 12 toolchains incl.
  docker-in-docker. The 2-core/8 GB machine hangs at build (parallel toolchain
  compile exhausts 8 GB); `hostRequirements.cpus: 4` now pins the floor. `gh` was
  absent on first build; the `github-cli` feature now ships it prebuilt and the
  injected Codespaces token was verified to authenticate it (`gh api user`).
  Prebuilds remain worthwhile (first build is slow). Setup: docs/codespaces.md.
- **pre-commit hooks** — configured, not yet installed/run locally.

## ✅ C++ runtime (Bx-3b) — verified in production, in-browser

- **In-browser compile + link + run** via Binji's wasm-clang (Apache-2.0): single-process
  clang-8 `-cc1` + `wasm-ld`, no `posix_spawn`. Committed fork `web/cpp-shared.js` (one fix:
  `Memory.check()` refreshes on buffer-identity change, i.e. wasm memory growth). Driver
  `web/cpp-worker.js`; vendored `clang/lld/memfs/sysroot.tar` under `web/vendor/cpp`.
- **Single-threaded** (`--no-threads`) → no SharedArrayBuffer, so no cross-origin-isolation
  reload gate (unlike the C/Wasmer runtime).
- **json.hpp/solution.hpp** use a non-atomic `Rc<>` refcount (clang-8 can't codegen atomic
  `shared_ptr`) + `strtod`; compiled `-std=c++17 -O2` with the compiler-rt builtins archive
  linked (fixes `__lttf2`).
- **Cases via stdin** (`MemFS.setStdinStr`), not a memfs file — sidesteps Binji's memfs
  file-backing bug; harness reads `std::cin`, native CLI pipes the file in.
- **E2E**: problem 001 compiles+runs 7/7 in-browser (driver + through the UI, chromium);
  native g++ across ubuntu/macos/windows.

### Follow-up — Bx-3b-2: modern-LLVM toolchain rebuild (tracked, not started)
Rebuild clang/lld to wasm on LLVM 19/20 to drop the `Rc` shim and the `-std=c++17`
constraint, gaining C++20 + exceptions + atomic `shared_ptr` (and possibly retiring Binji's
custom memfs for a standard WASI FS). Runtime is manifest-driven (`web/vendor/cpp/manifest.json`),
so this is a toolchain swap, not a rewrite.

## Retro track: 6502 (Bx-4) + SM83 / Game Boy (Bx-5) -- live in production

Both ship on the same proven template: customasm.wasm assembles PLAIN mnemonics
in-browser (the loader prepends a vendored std ruledef + an origin bankdef), and a
first-party, sandbox-tested CPU core executes them. Result contract: inputs at a
fixed RAM address, 16-bit little-endian result, halt instruction stops the run.
Metric is instruction count (coarse) -- see TODO(cycle-accuracy) in the loaders.

- **6502**: entry $0600, n at $10, result $12/$13, BRK halts. Core: `web/retro/cpu6502.mjs`
  (documented opcodes; SED throws -- decimal mode fails loud, not silently wrong).
- **SM83**: entry $0100, n at $C000, result $C010/$C011, HALT stops. Core:
  `web/retro/cpuSm83.mjs` (full ruledef-emittable set incl. all CB-prefix ops + DAA).
  Vendored ruledef is PATCHED (upstream `ADD HL,r16` bug -- see docs/UPSTREAM-NOTES.md).
- 003 carries practice/clean/optimized for both; dropdown shows display names
  (`display` key in `languages/*.toml`, baked into the corpus as `displayNames`).
- Guards: `web/corpus-integrity.test.mjs` (declared+runnable language must be baked --
  catches build.mjs ext-map drops), data-driven dropdown e2e, plain-mnemonic smoke e2es.
- Next core (#3) needs a sourced/authored ruledef (crate only ships 6502 + sm83) and
  picks up the RETRO-CONTRACT work (docs/RETRO-CONTRACT.md). Tom Harte validation of
  both cores is deferred until offloaded compute exists (vector sets are millions of cases).

## Operational: fork + minutes diet + never-stale (July 2026)

- Development moved temporarily to the CommonEmailDotCom/glifex fork (free-tier
  Actions/Codespaces exhausted on the main account). Codespaces docs remain valid;
  current flow is local (Termux) + push. Site: commonemaildotcom.github.io/glifex/.
- CI diet: the 3-OS test matrix, security job, retro-smoke and codeql triggers are
  TEMP-disabled (grep `TEMP(free-tier)` to re-enable by deleting marked lines).
  Kept spine: lint -> corpus (staleness + integrity) -> playground -> e2e + pages.
- Vendor resilience: `actions/cache` on web/vendor (separate pages/ci keys -- the
  e2e flavor strips CodeMirror) + curl retries; deploys stop touching third-party
  CDNs after one good run (ends the get.wasmer.io / Binji 429 class).
- Never-stale: SW navigations + corpus fetch with cache:"no-cache" (the browser
  HTTP cache made "network-first" up to 10 min stale); update detection runs at
  boot / tab refocus / every 5 min and lights the header refresh button.

## Verify everything

```bash
python3 glifex.py doctor
for p in problems/*/;    do python3 glifex.py test    "$(basename $p)"; done
for p in problems-db/*/; do python3 glifex.py db test "$(basename $p)"; done
python3 glifex.py db bench 001
node web/build.mjs && python3 -m http.server -d web 8080
npx playwright test e2e/ --config e2e/playwright.config.js
curl -s https://glifex.dev/version.json     # live-deploy health check
```
