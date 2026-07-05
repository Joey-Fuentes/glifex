# Project status — honest build report

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

## ✅ Tracks & infrastructure

- **Database track** — `db test` (ephemeral SQLite) and `db bench`
  (`EXPLAIN` query-plan diff) green on all three OSes.
- **Frontend track** — assertion engine unit-verified in Node AND verified in
  real Chromium + Firefox via E2E (computed styles, live preview).
- **E2E suite** — 18 passed (9 specs × 2 browsers), including the
  offline-mode test: "offline === hosted" is a machine-checked regression test.
- **CI pipeline** — ruff (pinned), corpus-staleness gate, 3-OS polyglot matrix
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

- **Playground WASM tier** — `web/fetch-runtimes.mjs` and the loaders in
  `web/runtimes.js` (Pyodide, ruby.wasm, in-browser TS, PGlite). Expect
  version/API drift on first contact. Amend THIRD_PARTY_NOTICES.md with exact
  versions in the same commit that first vendors them.
- **Postgres hosted DB engine** — SQLite path proven; Docker/psql path unrun
  (Docker IS present on Linux/Windows runners, so it's CI-verifiable).
- **Go real benchmarking** — `bench_test.go` templates exist; `go test -bench`
  has not been executed.
- **Dev Container** — first Codespaces build stalled unresolved; definition
  unconfirmed. Consider Codespaces prebuilds.
- **pre-commit hooks** — configured, not yet installed/run locally.

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
