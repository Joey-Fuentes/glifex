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

## ✅ Complexity Lab (L1) — verified in production

Empirical growth-rate falsifier for the algorithm track, browser-side face of
C3: seeded input families at growing sizes, correctness-gated against the
JS clean oracle, judged by consecutive growth ratios (constants cancel;
absolute cross-language speed never enters a verdict). Deterministic
(cycle-counted) tracks get tight tolerance and exact verdicts; wall-clock
tiers get medians, loose tolerance, and an honest "Inconclusive" below
timing resolution rather than a forced guess. Engine battery
(`web/lab-engine.test.mjs`) is 86/86 in CI; e2e coverage in
`e2e/lab.spec.js` (Chromium) -- JavaScript only; see the coverage-gap
note in `docs/ROADMAP.md`'s L1 entry.

- **Per-variant declared complexity bounds (#28).** Declared O/Omega bounds
  moved from one per-problem value to per-language, per-variant
  (`[complexity.LANG.VARIANT]` manifest sections) — brute-force, clean, and
  optimized can each declare a genuinely different bound instead of sharing
  one. `web/build.mjs` resolves declared bounds with a `"default"` fallback;
  `web/lab-engine.mjs`'s `matchKnownVariants()` does empirical-first
  matching against a strict "consistent" set (a faster-than-declared result
  does NOT count as matching a looser bound — only a tight fit does).
- **Two judging modes**, both e2e-covered (`e2e/lab.spec.js`, "revealed" /
  "empirical-match" specs):
  - *Revealed*: with a specific reference solution open, the Lab tests the
    code against THAT variant's own declared bound and reports a direct
    verdict ("Upper bound O(n): consistent/REFUTED").
  - *Empirical-match* (the default, no-reveal state most users hit Analyze
    from): measures growth first, then reports which known variant(s), if
    any, the empirical growth matches — a genuinely different code path
    from "revealed", not a fallback dressed up to look the same.
- **Brute-force as a first-class variant type (#26).** Added
  project-wide alongside clean/optimized: reference-panel button, curated
  002 (Two Sum) WAT trio — `brute-force.wat` (O(n²) nested loop),
  `clean.wat` (fused lookup+insert hash map, Joe's design), `optimized.wat`
  (generation-counter reset, ~15-20% faster) — each with its own declared
  bound via the per-variant system above.
- **Stale-cache fix (#29).** `lab-engine.mjs`/`lab-config.mjs` (dynamically
  imported ES modules, unlike every other script which is a plain
  `<script src>` tag) were the only assets `web/stamp.mjs`'s cache-busting
  regex never matched (`.mjs` fell through a `.js`/`.css`-only pattern) —
  visitors could keep getting pre-deploy Lab code indefinitely via the
  service worker's stale-while-revalidate caching, live-site-confirmed as
  `E.matchKnownVariants is not a function` for anyone whose browser cached
  the old file. Fixed the regex AND `lab.js`'s dynamic import call sites
  (which the regex fix alone doesn't reach, being hardcoded strings in
  application source, not `index.html`/`sw.js`).
- **C runtime: overlapping-call lock + single-use Wasmer instance (#30,
  #31, #32).** Reported as C hanging on repeated Analyze/Run, cascading to
  "every language broken until a hard refresh." Root-caused in two layers:
  (a) Run and Analyze had no mutual-exclusion guard against overlapping
  calls into the same cached runtime object — fixed with a shared lock
  (`state.runtimeBusy` + `withRuntimeLock`, `web/app.js`) both entry points
  now go through (#30). (b) Independently, and confirmed necessary by
  testing — not assumed — the compiled `clang` Wasmer/WASIX module was
  being reused across calls; Wasmer's `entrypoint.run()` behaves like a
  single-use process invocation, so any second call on the same instance
  hangs (`RuntimeError: unreachable` inside `wasmer_js_bg.wasm`, uncaught,
  which is why it presented as a silent hang rather than a catchable
  error). An in-place fix (#31, fresh `clang` instance per call, same
  session) was confirmed insufficient by direct testing. The actual fix
  (#32): every C run spawns a genuinely fresh Worker (`web/c-worker.js`)
  with the SDK fully re-imported and re-initialized, terminated
  afterward — matching an independent developer's confirmed fix for the
  identical symptom on this exact SDK doing similar in-browser clang/LLVM
  work (cited in the PR). This eliminated the cascading failure.
  - **Known issue, likely root-caused and fixed (pending live
    confirmation):** direct measurement found a severe memory
    amplification bug in the shared C JSON parser -- every string parsed
    allocated a buffer sized to the entire remaining unparsed JSON, not
    just that string, and those allocations are never freed. 112x
    amplification measured on a realistic payload (44MB for 394KB of
    input) before the fix, 1.0x after. The original correlation below
    (not seen on 001, seen on 002) is now understood differently: 001
    (Anagram Detection, fixed-size character-count scan) simply wasn't
    large enough to trigger the same underlying problem until the
    Complexity Lab's ladder was extended -- at the new, larger sizes it
    reproduces on both problems, consistently rather than
    intermittently, which is what actually pointed at a deterministic
    memory bug instead of random SDK flakiness. Full detail:
    `docs/ROADMAP.md`'s Bx-3 entry.
  - **Known issue, not yet resolved (#33), separate from the above:**
    the underlying Wasmer SDK still crashes intermittently even with a
    fresh Worker per call -- correlated with input complexity, not
    random: not observed on 001 (Anagram Detection, fixed-size
    character-count scan), observed occasionally on 002 (Two Sum,
    array/hash-map-based). No longer cascades; a failed run doesn't affect
    other runs or languages. Diagnostic breadcrumb logging (source/case
    size + execution-stage tracking, in both the worker and its caller)
    is in place to correlate future occurrences; deliberately not masked
    with automatic retry. Full detail: `docs/ROADMAP.md`'s Bx-3 entry.

## ✅ Complexity Lab (L3) — worker migration, verified in production

Every runtime the Lab (and the plain Run button) can drive now executes off
the main thread: JavaScript, TypeScript, Python, Ruby, PHP, WAT, Postgres,
the retro CPU trio, C, and C++ -- a fresh worker spawned per call, not one
reused across a session. This closes a real hang-exposure class: a single
stuck call (runaway user code, or a genuine bug) used to be able to poison
every subsequent call for the rest of the session, not just that one. C
already had this (see the C runtime section above); C++ did not until this
work, and hit the identical symptom for an unrelated reason -- a hand-rolled
hash table in `optimized.cpp` with a fixed capacity infinite-looped once
Analyze's larger sizes fed it more unique keys than it had room for, and the
reused-worker bug turned that one bad call into "C++ stops responding for
the rest of the session." Confirmed directly, not assumed: built a
genuinely adversarial input (32768 unique values, no valid answer, forcing
full processing) and measured the old code hang under a hard timeout before
confirming the fix completes in milliseconds on the identical input.

The Complexity Lab's size ladder extended from 5 points (up to n=1024) to 10
(up to n=32768), grounded in a real, observed timing measurement rather
than a guess: the original 4-point ladder took ~20s end to end on C; since
every size point is already batched into a single compile-and-run call (not
one compile per point), the fixed compile cost doesn't multiply with ladder
length, so the full 10-point ladder was estimated at ~40s total --
comfortably inside the 2-minute outer runtime-lock timeout. `maxSizes` is
per-language (`web/lab-config.mjs`'s `LANG_OVERRIDES`) -- compiled languages
are capped at all 10 points; PHP stays capped at 4, unrelated to this work.

## ✅ Complexity Lab (L4) — space complexity, verified in production

The Lab now measures a per-size SPACE metric alongside time for every executable
track, judged by the same falsifier doctrine (refute, never confirm) against the
corpus's declared per-variant `space` class. A conditional Space tab renders where a
signal exists -- a heap/workspace line plus, where relevant, a dashed recursion-depth
(stack) line -- each with a disclaimer stating exactly what was measured and how far
to trust it.

Per-track method and fidelity:

- **Retro (asm-6502 / SM83 / i8080)** — exact. Per-cell RAM high-water (distinct bytes
  written outside the program image) + code bytes. Hard verdicts.
- **WAT** — exact. Linear-memory zero-scan high-water.
- **Python** — exact. Heap via `tracemalloc` peak; stack via `settrace` max depth.
- **C++ (binji)** — approximate PEAK. Global `operator new`/`delete` are interposed to
  track a live/peak byte counter (every STL allocation + `make_rc` routes through it),
  read as a peak-delta bracketed around the solve; stack via a bounded poison-scan. A
  true concurrent peak, immune to the allocator's placement and to dead-code
  elimination. Excludes raw `malloc`/`alloca` (which the stack line covers separately).
- **C (WASIX clang)** — approximate PEAK. The worker `clang -include`'s a prelude that
  interposes `malloc`/`calloc`/`realloc`/`free` across every translation unit (wasm
  build only); same peak-delta + poison-scan as C++.
- **JavaScript / TypeScript** — approximate peak. `performance.measureUserAgentSpecificMemory()`
  sampled at the allocation high-water, unlocked by the cross-origin-isolation change
  (the same COI wall as the L1 clock). A whole-heap, GC-timed, ~64 KB-quantized proxy:
  it measures the revealed reference solution's peak, labelled a hint, not a proof.
- **Ruby / PHP** — approximate VOLUME. Allocation volume during the solve
  (`total_allocated_objects` / snapshot diff) — an upper bound on peak, not a true peak.

Every non-exact track is flagged `spaceApprox` with a `spaceApproxKind` (`peak` for
C/C++, otherwise the volume default), so the render says precisely what it measured.
Gating: the C/C++ instrumentation is wasm-build-only (`#ifdef __wasm__` plus a
worker-only `-include`), so the native `g++`/`gcc` reference verify (`glifex verify`)
compiles the pristine harness and is unaffected.

Still display-only (declared class shown, not measured): **C#, Go, Java** — no
in-browser execution path to instrument.

## ✅ Tracks & infrastructure

- **Worked-example policy reversed.** 001 (Anagram Detection) and 002
  (Two Sum) no longer ship `practice` solved -- every problem now ships a
  blank, fail-first stub uniformly, across every declared language for
  each (17 for 001, 16 for 002). Real worked examples deferred to a
  future phase, not dropped; see `docs/contribution-policy.md`. Full
  correctness re-verified per language after the change, not assumed.
- **CI/CD pipeline gating.** A required check that could be silently
  satisfied by being skipped, and a deploy trigger with no awareness of
  CI's result, both let a broken solution reach production once. Both
  fixed and verified by deliberately breaking each gate on a real PR and
  confirming it correctly refused, not just by reasoning about the YAML.
  Full incident account: [docs/ci-cd.md](docs/ci-cd.md).
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
  native g++ across ubuntu/macos/windows. **Coverage gap:** 001 only -- 002
  (the only problem with a brute-force variant, and the only one where
  `optimized.cpp` does anything non-trivial) has zero C++ e2e coverage.
- **Four real bugs found and fixed testing live, none caught by e2e**
  (see the coverage gap above and `docs/ROADMAP.md`'s L1-e2e-analyze-js-only-gap):
  (1) `optimized.cpp`'s hand-rolled hash table used `thread_local` storage,
  which this `--no-threads` target's backend cannot lower at all -- crashed
  clang's backend on every 002 attempt regardless of practice's content,
  since `optimized.cpp` is always compiled alongside whatever's in the
  editor. (2) Binji's `App.run()` rejects on any non-zero process exit, but
  the harness's own convention (exit 1 = "some cases failed," a normal
  outcome) was being misreported as a scary compile/runtime error for every
  C++ problem, not just 001/002. (3) The reference panel never renamed a
  revealed variant's function to `practice` before display/copy -- unlike C,
  which already has `stripCRename()` for its own version of this problem --
  so copying a revealed clean/optimized/brute-force solution into practice's
  editor, the natural way to verify a reference actually works, failed to
  compile. (4) `loadCpp()` reused one worker across an entire session
  instead of spawning fresh per call (see the L3 section above) --
  identical to a bug C already had and fixed.

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

## Operational: minutes diet + never-stale (July 2026)

- Development is at Joey-Fuentes/glifex; the site is https://glifex.dev.
  Codespaces docs remain valid; current flow is local (Termux) + push.
- CI: the 3-OS test matrix, security (Trivy), and codeql are RE-ENABLED and
  now REQUIRED -- all three are in `ci-status-gate`'s `needs:`, so a failure in
  any blocks merge (codeql was moved from its own workflow into a `ci.yml` job
  so the gate could depend on it). Still TEMP-disabled: `retro-smoke` (and
  `retro-exhaustive`, manual by design). Spine: lint -> corpus (staleness +
  integrity) -> (matrix, security, codeql, playground -> e2e) -> gate + pages.
- Vendor resilience: `actions/cache` on web/vendor (separate pages/ci keys -- the
  e2e flavor strips CodeMirror) + curl retries; deploys stop touching third-party
  CDNs after one good run (ends the get.wasmer.io / Binji 429 class).
- Never-stale: SW navigations + corpus fetch with cache:"no-cache" (the browser
  HTTP cache made "network-first" up to 10 min stale); update detection runs at
  boot / tab refocus / every 5 min and lights the header refresh button.
- Retro core #3: Intel 8080 (web/retro/cpu8080.mjs) -- first CYCLE-EXACT track.
  T-state-accurate (incl. conditional CALL 17/11, RET 11/5), validated against
  the CP/M diagnostic ROMs incl. the exhaustive 8080EXM: 23,803,381,171 cycles,
  every CRC matching real Intel silicon (fixtures + GPLv3 sources vendored at
  web/retro/test-roms/8080/, stripped from the Pages artifact). Plan pivot,
  decision of record: Tom Harte SingleStepTests DO NOT EXIST for the 8080 (the
  org covers z80/sm83/65x02/x86 etc., not 8080) -- CP/M ROM suite is the
  community-standard validation instead; Harte remains the path for 6502/sm83.
  UI: deterministic cycles + reference time @ 2.000 MHz + space metrics (code
  bytes / workspace bytes = distinct RAM written outside the program image).
  RETRO-CONTRACT paid at n=3: loaders factored to makeRetroLoader(config)
  (runtimes.js, -80 lines of duplication) + fit-verifier (program/I-O collision
  = assembly-time error). CI: unit battery + fast three (sub-second) in the
  spine; retro-exhaustive.yml is workflow_dispatch by design (permanent, not a
  free-tier diet item) -- run after any cpu8080.mjs change, ~1.5-4 min.

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
