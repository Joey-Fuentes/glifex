# Project status — honest build report

Updated after launch day: full CI matrix green on Linux, macOS, and Windows;
E2E suite green in real browsers; site live at https://glifex.dev with
build-time versioning. This ledger records what is **proven by execution**
versus what remains written-but-unrun.

## ✅ Verified by execution

### Languages (15 of 18 registered)

| Language    | Linux | macOS (ARM64) | Windows | Notes |
|-------------|:-----:|:-----:|:-------:|-------|
| Python      | ✅ | ✅ | ✅ | |
| JavaScript  | ✅ | ✅ | ✅ | also runs natively in the playground |
| TypeScript  | ✅ | ✅ | ✅ | explicit-filename compile (no glob; cmd.exe-safe) |
| Go          | ✅ | ✅ | ✅ | root `go.mod` provides module context |
| Java        | ✅ | ✅ | ✅ | vendored minimal JSON parser |
| Ruby        | ✅ | ✅ | ✅ | passed native Windows first try |
| C#          | ✅ | ✅ | ✅ | harness compares JSON-to-JSON |
| C++         | ✅ | ✅ | ✅ | gcc-is-clang on macOS confirmed fine |
| C           | ✅ | ✅ | ✅ | `_POSIX_C_SOURCE 200809L` (Apple libc hides snprintf under 199309L) |
| Rust        | ✅ | ✅ | ✅ | dependency-free vendored JSON parser |
| PHP         | ✅ | ✅ | ✅ | |
| Dart        | ✅ | ✅ | ✅ | |
| Zig         | ✅ | ⏭ env | ✅ | macOS runners: zig 0.14.0 can't locate libSystem at link time — **runner environment, not code**; platform-skipped until fixed |
| asm-x86_64  | ✅ | ⏭ arch | ⏭ ABI | SysV ABI (rdi/rsi); Windows x64 uses rcx/rdx — platform-scoped by design |
| asm-arm64   | ⏭ arch | ✅ | ⏭ ABI | hand-written AArch64, first-ever run passed 4/4 on Apple Silicon |

⏭ = deliberate, guard-enforced skip (arch/platform/environment), shown honestly in logs.

### Tracks & infrastructure

- **Database track** — `db test` (ephemeral SQLite) and `db bench`
  (`EXPLAIN` query-plan diff) green locally and in CI on all three OSes.
- **Frontend track** — assertion engine unit-verified in Node AND verified in
  real Chromium + Firefox via E2E (computed styles, live preview).
- **E2E suite** — 18 passed (9 specs × 2 browsers), **including the
  offline-mode test**: the core "offline === hosted" promise is now a
  machine-checked regression test.
- **CI pipeline** — lint (ruff), corpus-staleness gate, 3-OS polyglot matrix,
  playground engine check, Playwright E2E, Trivy, CodeQL: all green.
  Dependabot loop confirmed working (opened and validated action bumps).
- **Runner guard system** — `arch` and `platforms` guards verified in all
  directions (x86_64↔ARM64, linux/darwin/windows), plus Windows UTF-8 output
  and per-plugin `*_windows` command overrides.
- **Deployment** — GitHub Pages → https://glifex.dev with custom domain, TLS,
  and build-time version stamping (`/version.json` + header badge);
  service worker is stale-while-revalidate so deploys reach returning visitors
  while the offline guarantee holds.

## ⚠️ Still written but NOT executed

- **Kotlin & Swift** — plugins + harness templates exist; no problem
  implementations and no toolchain has ever run them. Scaffold and verify.
- **WAT** (WebAssembly Text) — plugin + hand-written two-sum exist, but
  `wabt`/`wat2wasm` has never been installed anywhere it ran. Verify with:
  `apt install wabt && python3 glifex.py test 002 wat`.
- **Playground WASM tier** — `web/fetch-runtimes.mjs` and the runtime loaders
  in `web/runtimes.js` (Pyodide, ruby.wasm, in-browser TS, PGlite). Expect
  version/API drift on first contact. **Do not deploy vendored runtimes
  without adding THIRD_PARTY_NOTICES.md** (license obligation).
- **Postgres hosted DB engine** — SQLite path is proven; the Docker/psql
  Postgres path has not run.
- **Go real benchmarking** — `bench_test.go` templates exist;
  `go test -bench .` has not been executed.
- **Dev Container** — first Codespaces build stalled unresolved; the container
  definition remains unconfirmed. Consider Codespaces prebuilds.
- **pre-commit hooks** — configured, not yet installed/run (`pre-commit
  autoupdate && pre-commit install`).

## Recommended follow-ups (not blockers)

- Pin ruff in CI (`pip install ruff==0.15.20`) so new rule releases can't
  redden the gate unprompted.
- Stale UI copy: the playground's "CLI-only" message names only four
  languages; there are now nine. Batch with docs cleanup (README's phantom
  root `package.json`/`tsconfig.json` mention, LAUNCH.md triage-table result).

## Verify everything

```bash
python3 glifex.py doctor
for p in problems/*/;    do python3 glifex.py test    "$(basename $p)"; done
for p in problems-db/*/; do python3 glifex.py db test "$(basename $p)"; done
python3 glifex.py db bench 001
node web/build.mjs && python3 -m http.server -d web 8080
npx playwright test e2e/ --config e2e/playwright.config.js
curl https://glifex.dev/version.json     # live-deploy health check
```
