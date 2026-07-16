# Contributing to Glifex

## Adding a problem

```bash
python3 glifex.py new 003-my-problem      # algorithm, scaffolds every language
python3 glifex.py new-db 002-my-query     # database problem
```

Then: write `problem.md`, fill `test_cases.json` (algorithm) or
`schema.sql`/`seed.sql`/`expected.json` (database), and implement `practice.*`.
Verify with `glifex test` / `glifex db test`.

## Adding a language (the whole point of the plugin registry)

The set of languages is **not** hardcoded. Add one without touching `glifex.py`:

1. Create `languages/<name>.toml`:
   ```toml
   name = "rust"
   extension = "rs"
   practice_file = "practice.rs"
   detect = "rustc --version"          # what `doctor` probes
   install_hint = "…"
   compile_cmd = "cargo build --quiet"  # optional; omit for interpreted languages
   test_cmd = "cargo run --quiet -- {variant}"
   bench_cmd = "cargo bench"            # optional
   harness_template = "main.rs"
   tool_version = "rust 1.85"           # feeds .tool-versions
   stub = "fn {variant}() { unimplemented!() }"   # {variant}/{Variant} substituted per file
   support_files = []                   # extra files to copy (e.g. an interface/parser)
   ```
2. Add `languages/templates/<harness>` — reads `../test_cases.json`, dispatches on
   the variant argument, diffs against `expected`, exits non-zero on failure.
3. `glifex doctor` and `glifex new` pick it up automatically.

That is the whole story **for the CLI**. Making the language also *run in the
browser* — vendored runtime, worker, corpus, Lab wiring, e2e — is a much larger
job with its own sequence and its own traps. It has been done thirteen times now;
the accumulated map, checklist and failure modes are in
**`docs/adding-a-language.md`**. Read it before starting, not after.

### The harness contract

A harness must: read `../test_cases.json`; select the variant from `argv[1]`
(default `practice`); call the solution on each `input`; compare to `expected`;
print `N/M passed`; exit `0` on all-pass, non-zero otherwise. Compiled languages
put `practice`/`clean`/`optimized` as distinct symbols in one compile unit and
dispatch by name (switch or reflection) — never multiple `main`s.

## Generated files never drift

Harnesses and support files come from `languages/templates/`. **Don't hand-edit a
harness inside a problem** — change the template and re-scaffold, so all problems
stay identical.

## Line endings & style

`.editorconfig` and `.gitattributes` enforce LF and per-language indentation. Keep
solution files free of I/O and test boilerplate.

## Before a PR

- `glifex test <problem>` green for every language you touched.
- `node web/build.mjs` if you changed problems (keeps the playground in sync).
- Update `STATUS.md` if you verified a previously-unverified language.

## CI expectations

PRs must pass: lint, the corpus-staleness check (`node web/build.mjs` output
committed), the polyglot matrix, and security scans. The AI reviewer (if
installed) is advisory — human maintainers merge. Squash-merge keeps history linear.

## Contributing a problem — the checklist

1. `python3 glifex.py new NNN-name`, delete language dirs you won't support.
2. Implement the **floor**: Python, JavaScript, C, C++ — `clean` + `optimized`
   passing, `practice` left as the blank stub. More languages welcome.
3. Write `manifest.toml` (copy 002's as a template): declare every language
   and variant, give every absent language an `[exclusions]` reason
   (`help-wanted` vs `not-applicable`), fill `[complexity]` (worst-case
   time+space, whitelist notation).
4. `python3 glifex.py verify NNN` — the exact gate CI runs. Fix until green.
5. `node web/build.mjs` and commit the regenerated corpus.
6. PR. CI re-verifies with all 18 toolchains; reviewers check complexity
   claims and blank stubs. Full policy: docs/contribution-policy.md.
