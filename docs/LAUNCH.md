# Glifex Launch Walkthrough

**Status: launched.** Glifex is live at https://glifex.dev from
Joey-Fuentes/glifex. This walkthrough is retained because Phases 2–3 double
as the settings and first-CI verification runbook for any future re-setup.

The complete, ordered path from zip file to verified project: initial commit,
first CI run, and a test of every feature. Work top to bottom; each phase ends
with a checkpoint. Expected time: ~30 min for Phases 0–3, then toolchain- and
appetite-dependent.

Legend: ✅ = verified during the build (should just work) · ⚠️ = written but
unverified (first run is the real test — expect possible small fixes).

---

## Phase 0 — Before anything touches GitHub

### 0.1 Unzip and look around

```bash
unzip glifex.zip && cd glifex
cat STATUS.md        # the honest map of what's proven vs pending
```

### 0.2 Name clearance (do this BEFORE the repo is public)

- [ ] `https://github.com/search?q=glifex` — no significant collision
- [ ] `https://pypi.org/project/glifex` — should 404
- [ ] `https://www.npmjs.com/package/glifex` — should 404
- [ ] USPTO TESS search for "glifex" in software classes (9, 42)
- [ ] Optional: register `glifex.dev` (the `.com` is a parked placeholder)

If any of these fail, renaming now is a find-replace of `glifex` + renaming
`glifex.py`. After people clone, it isn't.

### 0.3 Quick local sanity (5 minutes, on whatever toolchains you have)

```bash
python3 glifex.py doctor                 # ✓/✗ matrix of your machine
python3 glifex.py test 001               # anagram — installed langs run, rest skip
python3 glifex.py test 002               # two-sum
python3 glifex.py db test 001            # database track (SQLite, zero setup)
python3 glifex.py db bench 001           # EXPLAIN plan diff
node web/build.mjs                        # corpus bakes without error
```

- [ ] Every installed language shows PASS; missing ones say "skipping", never error
- [ ] `db bench` shows `SEARCH ... USING COVERING INDEX` lines

**Checkpoint:** the verified core works on your machine. Don't chase the
unverified languages yet — CI does that for you in Phase 3.

---

## Phase 1 — Initial commit

### 1.1 Create the GitHub repo

On GitHub: **New repository** → owner `Joey-Fuentes`, name `glifex`, public,
and **do NOT add** a README, license, or .gitignore (the zip supplies all
three; GitHub's templates would conflict on first push).

### 1.2 Commit and push

```bash
cd glifex
git init
git add .
git status                # sanity: no vendor/, node_modules/, .tsbuild/, __pycache__/
git commit -m "Glifex: initial commit — 18 languages, 3 tracks, CI, playground"
git branch -M main
git remote add origin https://github.com/Joey-Fuentes/glifex.git
git push -u origin main
```

- [ ] `git status` before commit shows only source files (the .gitignore is doing its job)
- [ ] Push succeeds; repo renders README on GitHub with the license badge detected

---

## Phase 2 — GitHub settings (things files can't do)

All under repo **Settings**:

- [ ] **Code security → Secret scanning + Push protection**: enable both
- [ ] **Code security → Dependabot**: enable alerts + security updates
      (the `.github/dependabot.yml` version-update config is already in the repo)
- [ ] **Branches → Add rule for `main`**: require status checks before merge
      -- specifically **`ci-status-gate`** (a single job in `ci.yml` that
      depends on every other job and explicitly fails unless all of them
      genuinely succeeded), not `e2e` or any individual leg. A skipped
      required check satisfies branch protection the same as a passed one --
      requiring an individual job whose own `needs:` can skip it under
      failure is a real trap, not a hypothetical one: see
      [docs/ci-cd.md](ci-cd.md) for the incident this caused and why
      `ci-status-gate` exists. Also require linear history, and set
      **squash merge** as the only merge method (Settings → General →
      Pull Requests)
- [ ] Optional: install **CodeRabbit** from the Marketplace — but leave it
      **advisory**; do not add it to required checks
- [ ] Optional: Settings → Pages, if you want the playground served from
      GitHub Pages before glifex.dev exists

---

## Phase 3 — First CI run (this is the big verification event)

The push in 1.2 already triggered **Actions**. This run is the first real test
of everything marked ⚠️: Go, Ruby, Java, C#, Rust, PHP, Dart, Zig harnesses;
the 3-OS matrix; Playwright including the offline test.

### 3.1 Watch the run

Actions tab → the `CI` workflow. Job order: `lint` + `corpus` → `matrix`
(ubuntu/macos/windows in parallel) → `playground` → `e2e` → `security`,
plus `CodeQL` as its own workflow.

### 3.2 Triage guide — expected first-run outcomes

| Job | Expectation | If it fails |
|---|---|---|
| lint | ⚠️ first run found real issues (unused imports, format) — the triage loop below is normal | `pip install ruff && ruff check glifex.py` locally, fix, push |
| corpus | ✅ should pass | run `node web/build.mjs`, commit the regenerated JSON |
| matrix / ubuntu | ⚠️ the 7 unproven languages' first execution | failures are per-language and local to that language's harness or plugin `.toml` — fix one at a time; nothing else is blocked |
| matrix / macos | ⚠️ same + `gcc` is clang here (C/C++/asm should still work) | asm-x86_64 will skip on Apple Silicon runners — correct behavior, not a failure |
| matrix / windows | ⚠️ the hardest leg | Ruby native gems and gcc availability are the usual suspects; a per-language skip is acceptable for v0.1 — note it, don't block on it |
| playground | ✅ should pass | mirrors the local engine test |
| e2e | ⚠️ Playwright's first run | check the uploaded `playwright-traces` artifact; `webServer` uses `python3` — Windows runners aren't used for e2e so this is fine |
| security (Trivy) | ✅ should pass (repo is dependency-free) | read the finding; it's usually a pinned action version |
| CodeQL | ✅ should pass | findings appear under Security tab, non-blocking |

### 3.3 The fix loop

```bash
# per-language fixes are contained: edit the harness template AND the copies
# in problems/*/<lang>/, or edit languages/<lang>.toml, then:
python3 glifex.py test 001 <lang>     # if you have the toolchain locally
git add -A && git commit -m "fix(<lang>): <what>" && git push
```

- [ ] All matrix legs green (or documented per-language skips)
- [ ] Update `STATUS.md`: move newly-proven languages from ⚠️ to ✅
- [ ] Now add the CI check names to branch protection (Phase 2)
- [ ] Tag it: `git tag v0.1.0 && git push --tags`

**Checkpoint:** the polyglot promise is machine-verified on three OSes.

---

## Phase 4 — Local feature tour (test every CLI feature)

With whatever toolchains you have (install more via `mise install` from
`.tool-versions`, or open the Dev Container for everything):

```bash
# The core loop
python3 glifex.py test 001 python                # ✅ one language
python3 glifex.py test 001                        # ✅ all installed
python3 glifex.py test 001 python optimized       # ✅ reference variant
python3 glifex.py run 001 javascript clean        # ✅ run without summary
python3 glifex.py reveal 001 python optimized     # ✅ show hidden reference

# Benchmarking
python3 glifex.py bench 001 cpp optimized         # ✅ coarse in-harness (~87ns)
python3 glifex.py bench 001 c practice            # ✅ vs optimized: see the 3× gap
cd problems/001-anagram-detection/go && go test -bench . && cd -   # ⚠️ real Go bench

# Database track
python3 glifex.py db test 001                     # ✅ ephemeral SQLite
python3 glifex.py db test 001 optimized           # ✅ reference query
python3 glifex.py db bench 001                    # ✅ plan diff w/ index analysis

# Assembly family (x86_64 machine)
python3 glifex.py test 001 asm-x86_64             # ✅ real assembly, ~66ns
python3 glifex.py test 001 asm-arm64              # ✅ skips w/ arch notice (on x86)
# On an ARM64 machine (Apple Silicon/RPi): asm-arm64 runs, asm-x86_64 skips  ⚠️
cd problems/002-two-sum/wat && wat2wasm practice.wat -o .glifex.wasm && node harness.mjs && cd -   # ⚠️ needs wabt

# Scaffolding (then delete the experiments)
python3 glifex.py new 003-test-scaffold           # ✅ 15 languages + stubs
python3 glifex.py new-db 002-test-scaffold        # ✅ schema/seed/expected stubs
rm -rf problems/003-test-scaffold problems-db/002-test-scaffold
```

- [ ] Every command above behaves as annotated
- [ ] Blind-practice check: open the repo in VS Code — `clean.*`/`optimized.*`
      are invisible in the explorer, but `Ctrl/Cmd+P` can still open them

---

## Phase 5 — VS Code integration

- [ ] Open the folder in VS Code → accept the recommended-extensions prompt
- [ ] `Ctrl/Cmd+Shift+B` → "Glifex: Test (pick language)" → dropdown works,
      task runs in the terminal
- [ ] Run task "Glifex: Database bench (query plans)"
- [ ] Run task "Glifex: Doctor"
- [ ] Debug panel → "Debug: glifex test 001 python" → breakpoint in
      `glifex.py` hits
- [ ] Optional: "Reopen in Container" (needs Docker) — all toolchains appear;
      `postCreate` runs doctor automatically ⚠️ first container build is slow

---

## Phase 6 — Playground: local, offline, and WASM tiers

### 6.1 Tier 0 — works right now, no downloads ✅

```bash
node web/build.mjs
python3 -m http.server -d web 8080    # → http://localhost:8080
```

- [ ] Problem list shows 4 problems across 3 track badges (algo/db/frontend)
- [ ] JavaScript on anagram: Run → 4/4 green
- [ ] Break the code deliberately → failures flagged with expected/got
- [ ] Reveal → optimized reference appears read-only in the editor
- [ ] **Frontend track**: pick "Card" problem → live preview updates as you
      type → Run evaluates 5 assertions → paste the clean solution
      (`problems-fe/001-card-layout/.solutions/clean.html`) → 5/5 ✅
- [ ] **Offline check**: DevTools → Network → "Offline" → everything above
      still works (service worker + zero runtime fetches)
- [ ] `file://` check: open `web/index.html` directly from disk — also works

### 6.2 Tier 1 — vendor the WASM runtimes ⚠️

```bash
node web/fetch-runtimes.mjs     # one-time network fetch into web/vendor/
```

Then reload the playground and test:

- [ ] TypeScript on anagram runs in-browser (vendored compiler)
- [ ] Python on anagram runs (Pyodide — first load is slow; that's normal)
- [ ] Ruby on anagram runs (ruby.wasm)
- [ ] Database problem runs on in-browser Postgres (PGlite)
- [ ] After first load of each: go offline again — they still run

**Expect API drift here** — Pyodide/ruby.wasm/PGlite move fast, and this glue
could not be executed during the build. Fixes will be contained to
`web/runtimes.js` loader functions and possibly URLs in `fetch-runtimes.mjs`.

---

## Phase 7 — E2E suite locally (including the offline guarantee)

```bash
npm init -y && npm install -D @playwright/test
npx playwright install chromium firefox
node web/build.mjs
npx playwright test e2e/ --config e2e/playwright.config.js
```

- [ ] 9 tests pass: 6 playground (incl. **the offline-mode test**) + 3 frontend
      (real computed-style assertions, live preview) ⚠️
- [ ] On failure: `npx playwright show-trace test-results/.../trace.zip`

---

## Phase 8 — Developer hygiene

```bash
pip install pre-commit
pre-commit autoupdate            # bump hook pins to current
pre-commit install
pre-commit run --all-files       # ruff + gitleaks + hygiene hooks ⚠️
git add -A && git commit -m "chore: pre-commit baseline"
```

- [ ] Commit a fake secret on a branch (e.g. `AWS_KEY=AKIA...` in a scratch
      file) → gitleaks blocks the commit → delete the scratch file. That's
      your secrets safety net proven.

---

## Phase 9 — Declare it launched

- [ ] `STATUS.md` updated to reflect everything CI + you have now proven
- [ ] All CI legs green (or per-language skips documented)
- [ ] Tag `v1.0.0` when the 3-OS matrix + E2E are green:
      `git tag v1.0.0 && git push --tags`
- [ ] Point `glifex.dev` at the static `web/` build (Coolify: static service,
      build step `node web/build.mjs`, publish dir `web/`) — Phase F
- [ ] Announce, add problems (`glifex new` / `new-db`), and when the corpus is
      growing comfortably: design session for the **retro track** (Z80/6502/SM83)

---

## Quick-reference: everything in one block

```bash
python3 glifex.py doctor                          # toolchain matrix
python3 glifex.py test <problem> [lang] [variant] # correctness
python3 glifex.py run <problem> <lang> [variant]  # execute
python3 glifex.py bench <problem> <lang> [variant]# coarse timing
python3 glifex.py db test <problem> [variant]     # SQL correctness (SQLite)
python3 glifex.py db bench <problem>              # query-plan diff
python3 glifex.py new <problem>                   # scaffold (15 languages)
python3 glifex.py new-db <problem>                # scaffold DB problem
python3 glifex.py reveal <problem> <lang> [var]   # show hidden reference
node web/build.mjs                                # bake playground corpus
node web/fetch-runtimes.mjs                       # vendor WASM runtimes (once)
python3 -m http.server -d web 8080                # serve playground
npx playwright test e2e/ --config e2e/playwright.config.js   # E2E
```
