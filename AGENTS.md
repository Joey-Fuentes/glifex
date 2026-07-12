# AGENTS.md — working in this repo as an AI assistant

Rules for Claude, Cursor, Copilot, and similar tools operating on Glifex.

## The contract

- **Algorithm problems**: implement a single function in `practice.<ext>`.
  - Python: `def solve(case): ...`
  - JavaScript: `module.exports = function solve(c) { ... }`
  - TypeScript: `export function solve(c: any) { ... }`
  - Go: `func practice(c map[string]any) any { ... }`
  - Ruby: `def solve(c) ... end`
  - Java: `class Practice implements Solution { public Object solve(Map<String,Object> c) ... }`
  - C#: `class Practice : ISolution { public object Solve(Dictionary<string,object> c) ... }`
- Inputs match the `input` object in the problem's `test_cases.json`. The harness
  handles all I/O, parsing, and comparison — **do not** read files or print in the
  solution file.
- **Database problems**: write SQL in `practice.sql` against the given `schema.sql`
  / `seed.sql`; the expected result set is `expected.json`.

## How to verify your work

```bash
python3 glifex.py test <problem> <language>     # algorithm
python3 glifex.py db test <problem>             # database (SQLite)
```

Do not claim a solution works until `glifex test` passes for it.

## Blind-practice etiquette

- **Do not open or read `clean.*`, `optimized.*`, or `.solutions/` unless the user
  explicitly asks.** They are hidden on purpose so the user can practice cold.
- If asked to compare, use `glifex reveal <problem> <language> <variant>`.

## Adding things

- New problem: `glifex new <id>` (algorithm) or `glifex new-db <id>` (database).
- New language: add `languages/<name>.toml` + a harness template. Never hardcode
  language names in `glifex.py` — the registry is the source of truth.

## Before you start a change: confirm you have the current remote state

An agent's own local copy of this repo — however it was obtained (a prior
clone, an uploaded snapshot, a cached checkout) — is a **point-in-time
snapshot**, not a live view of `main`. Most agents have no direct, live
network access to verify this for themselves. Assuming a local snapshot is
still current, without saying so, is exactly how a real regression happened
here: five related PRs (worker-isolation fixes for TypeScript, Ruby, PHP,
Python, Postgres — "L3" in the git history) were prepared from a shared,
increasingly-stale starting point and merged within about an hour of each
other. Each merge silently reverted whichever fix had landed in the gap since
that particular change was staged — not by anyone editing it back, but because
the change being applied still contained the file's *old* content everywhere
it hadn't touched. Four of the five fixes were undone this way, and it wasn't
noticed until much later. Full incident, verified against git history commit
by commit: `docs/architecture.md`, Decision 10.

Before preparing a change -- especially one of several related changes
touching the same file, or any change following a recent merge -- an agent
must explicitly say it does not have live access to the remote and ask for
the current state (a fresh pull, export, or upload) rather than silently
proceeding on a snapshot that may already be stale. This applies even if the
snapshot is recent, and even more so when a batch of related changes is being
prepared together: re-confirm the current state before *each* one, not once
at the start of the batch.

## Honesty

- If a language's toolchain isn't installed, say so (`glifex doctor`) rather than
  guessing at output.
- Cross-language nanosecond benchmarks are not meaningful; compare within a language.
- See `STATUS.md` for what is verified vs written-but-unverified.
