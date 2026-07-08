# Glifex

Practice coding problems **blind**, in **many languages**, against **one shared set of test cases** — then benchmark your solutions with each language's real profiling tools. There's also a **database track** for inherently-SQL problems, tested against a throwaway Postgres instance. One command runs everything, on Linux, macOS, and Windows, straight from VS Code.

> **Ships with:** Python · JavaScript · TypeScript · Go · Java · Ruby · C# · C++ · C · Rust · PHP · Dart · Zig
> **Assembly family:** x86-64 · ARM64 · WebAssembly Text (numeric problems, added per-problem)
> **Plugins included (bring the toolchain):** Kotlin · Swift
> **Plus a database track:** PostgreSQL
> **Adding another language is a single plugin file** — see [Extending Glifex](#extending-glifex).
> **License:** MIT · **Requires:** only the toolchains for the languages *you* actually use

---

## Table of contents

- [Why Glifex](#why-glifex)
- [Quickstart (60 seconds)](#quickstart-60-seconds)
- [Getting the toolchains](#getting-the-toolchains)
- [The core contract](#the-core-contract)
- [The database track](#the-database-track)
- [Directory layout](#directory-layout)
- [Using Glifex](#using-glifex)
- [The double-blind workflow](#the-double-blind-workflow)
- [Adding a problem](#adding-a-problem)
- [Extending Glifex](#extending-glifex)
- [Benchmarking](#benchmarking)
- [Using Glifex with an AI assistant](#using-glifex-with-an-ai-assistant)
- [FAQ & design notes](#faq--design-notes)
- [License](#license)

---

## Why Glifex

Most algorithm-practice setups force a trade-off: one language done well, or many languages with copy-pasted test data and no consistency. Glifex is built around goals that usually fight each other:

1. **True polyglot support.** The same problem, implemented natively in each runtime — no transpilation tricks. Each language runs on its own toolchain.
2. **Blind practice.** Reference solutions live in the repo but are hidden from your editor until you ask for them, so you can attempt a problem cold and only then compare.
3. **One source of truth for tests.** Inputs and expected outputs are written **once** per problem and consumed identically by every language.
4. **Open-ended by design.** The set of languages isn't hardcoded. Each is a self-describing plugin, so adding one is a config file, not a code change.
5. **A database track.** Some problems are inherently about SQL — indexing, joins, query planning. Those get their own contract and run against a disposable Postgres instance.
6. **Clean, AI- and CI-friendly files.** Implementation files contain only the solution — no I/O or test boilerplate — so they drop cleanly into an AI context window or a CI pipeline.

Glifex achieves these without the usual contradictions by separating two concerns naive setups conflate: *hiding answers from the human* (an editor concern) and *isolating compilation* (a toolchain concern). See [design notes](#faq--design-notes).

---

## Quickstart (60 seconds)

Pick whichever path fits. All end at the same place: a green run.

### Path A — GitHub Codespaces (zero install)

Click **Code → Codespaces → Create codespace** and choose a **4-core (16 GB) machine or larger** — the 2-core box can't build the container ([why](docs/codespaces.md)). Every toolchain, plus `gh` (pre-authenticated), is preinstalled. Then:

```bash
python3 glifex.py test 001-anagram-detection python
```

### Path B — Clone + VS Code (recommended local)

```bash
git clone https://github.com/Joey-Fuentes/glifex.git
cd glifex
```

Open in VS Code and press **Ctrl/Cmd + Shift + B** → pick a language from the dropdown. (Install that language's toolchain first — see [below](#getting-the-toolchains).)

### Path C — Command line

```bash
python3 glifex.py test 001-anagram-detection python   # correctness (your practice file)
python3 glifex.py doctor                               # which toolchains do I have?
```

You do **not** need every language. Glifex detects what's installed and skips the rest with a notice, so a Python-only user is never blocked.

---

## Getting the toolchains

You don't need to write (or read) a separate install guide per language per OS. There are three paths; use the first that fits.

### 1. `mise` — one tool, all platforms (recommended)

Every runtime version is pinned in `.tool-versions` at the repo root. Install them all in one command (macOS, Linux, or Windows via WSL2):

```bash
curl https://mise.run | sh   # one-time: install mise itself
mise install                 # reads .tool-versions, installs everything
npm install -g typescript    # TypeScript is an npm package, not a runtime
```

The pins track current LTS/stable: Node.js 24 (Active LTS), Java 25 (LTS), .NET 10 (LTS).

### 2. Dev Container / Codespaces — guaranteed environment

With Docker (or Codespaces), **Reopen in Container** gives every contributor a byte-identical Linux environment with all toolchains present — and Docker-in-Docker for the database track. This is the only path that *guarantees* rather than *reports*, and it's the smoothest on Windows.

Full setup, machine-size requirements, and the `gh` PR flow: [docs/codespaces.md](docs/codespaces.md).

### 3. Native package managers — last resort

| Language     | macOS (Homebrew)              | Linux (Debian/Ubuntu apt)      | Windows (winget)                                  |
|--------------|-------------------------------|--------------------------------|---------------------------------------------------|
| Python       | `brew install python@3.13`    | `apt install python3`          | `winget install Python.Python.3.13`               |
| Node + TS    | `brew install node`           | `apt install nodejs npm`       | `winget install OpenJS.NodeJS.LTS`                |
| Go           | `brew install go`             | `apt install golang`           | `winget install GoLang.Go`                        |
| Ruby         | `brew install ruby`           | `apt install ruby-full`        | `winget install RubyInstallerTeam.Ruby.3.4`       |
| Java         | `brew install temurin`        | `apt install temurin-25-jdk`   | `winget install EclipseAdoptium.Temurin.25.JDK`   |
| C# / .NET    | `brew install dotnet`         | `apt install dotnet-sdk-10.0`  | `winget install Microsoft.DotNet.SDK.10`          |

> Package names vary across distributions (Fedora uses `dnf`, Arch `pacman`). `mise` sidesteps all of that — which is why it's the primary path.

### A note for Windows users

Native Windows is the hardest environment for polyglot setups (Ruby native gems especially, and the database track wants Docker). **Use WSL2.** Install [WSL2](https://learn.microsoft.com/windows/wsl/install), then follow the **Linux** column and the `mise` steps; VS Code's WSL remote makes it seamless. Native Windows via winget works, but WSL2 is the path we support and test.

### Always finish with `doctor`

```bash
python3 glifex.py doctor
```

Prints a ✓/✗ matrix of every registered toolchain with install hints for anything missing. (The Dev Container runs this on creation, so a bad environment fails at build time, not on your first run.)

---

## The core contract

Every implementation, in every language, exposes **one function** taking a single input object and returning the answer. It never touches files, arguments, or timing — the harness owns all of that.

**Python** (`practice.py`):
```python
def solve(case):
    return sorted(case["s"]) == sorted(case["t"])
```

**Go** (`practice.go`):
```go
func practice(c map[string]any) any {
    return sortStr(c["s"].(string)) == sortStr(c["t"].(string))
}
```

Inputs match the `input` object in `test_cases.json`, the single source of truth for a problem:

```json
[
  { "input": { "s": "clinteastwood", "t": "oldwestaction" }, "expected": true },
  { "input": { "s": "hello",         "t": "world"         }, "expected": false }
]
```

A per-language **harness** (generated from the language plugin, never hand-edited) reads that JSON, loops the cases, calls your function, diffs against `expected`, and reports pass/fail plus a coarse timing.

---

## The database track

Some problems are inherently about the database, not an algorithm — "which users placed no orders," "rank products by revenue," "make this query use an index." These don't have a `solve(input)` shape, so they live in a **separate track** with their own contract, while sharing the CLI and the blind-practice workflow.

A database problem gives you a schema and seed data and asks for a query:

```
problems-db/
└── 001-users-with-no-orders/
    ├── problem.md          # the task
    ├── schema.sql          # CREATE TABLE ...
    ├── seed.sql            # INSERT ... (fixture data)
    ├── expected.json       # the correct result set
    ├── practice.sql        # you write your query here (blind)
    └── .solutions/         # clean.sql, optimized.sql (hidden until revealed)
```

**Tested inline against a throwaway database.** Running a DB problem spins up a disposable Postgres, applies `schema.sql` + `seed.sql`, runs your `practice.sql`, compares the rows to `expected.json`, and tears the database down. Nothing persists; every run is identical. The default uses Docker (a throwaway `postgres` container); a Docker-free fallback uses a temporary local cluster.

**Benchmarking is `EXPLAIN ANALYZE`, not nanoseconds.** For SQL, the useful signal is the query plan — planning vs execution time, sequential scan vs index scan, estimated vs actual rows. `glifex bench` on a DB problem shows the plan difference between your query and the optimized reference, which maps directly onto the "did you add the right index?" lesson.

> Row ordering: SQL result sets are unordered unless you `ORDER BY`. Each problem declares in `problem.md` whether order matters; the harness compares accordingly.

---

## Directory layout

Problem *content* lives together (good for humans and for AI globbing one problem across languages); *toolchain configuration* is centralized so you don't drown in per-problem project files; *languages* are a plugin registry so the set is open-ended.

```
glifex/
├── glifex.py                    # the cross-platform runner
├── web/                         # docs + offline in-browser playground (static)
├── STATUS.md                    # honest build report: verified vs written-unverified
├── languages/                   # the language plugin registry
│   ├── python.toml              # one self-describing file per language
│   ├── go.toml
│   └── ...                      # add a file here to add a language
├── AGENTS.md                    # the contract, for AI assistants
├── go.mod                       # ONE Go module covers every go/ directory
├── .tool-versions               # pinned runtime versions (used by mise)
├── .devcontainer/               # Dev Container / Codespaces definition
├── .vscode/                     # tasks (run/test pickers), settings, launch, extensions
├── problems/                    # the algorithm track
│   └── 001-anagram-detection/
│       ├── problem.md
│       ├── test_cases.json      # single source of truth
│       ├── python/     { harness.py, practice.py, clean.py, optimized.py }
│       ├── go/         { main.go, practice.go, clean.go, optimized.go }
│       └── ...                  # one folder per language
└── problems-db/                 # the database track
    └── 001-users-with-no-orders/
        ├── problem.md
        ├── schema.sql
        ├── seed.sql
        ├── expected.json
        ├── practice.sql
        └── .solutions/
```

---

## Using Glifex

Everything runs through one interface — the same commands whether you're a human or an AI assistant. (Alias `glifex` to `gx` if you like; you'll type it a lot.)

```bash
python3 glifex.py <command> <problem> [language] [variant]
```

| Command   | What it does                                                                 |
|-----------|------------------------------------------------------------------------------|
| `test`    | Run correctness for a problem in one (or all installed) languages            |
| `run`     | Execute a single variant and print its output                                |
| `bench`   | Benchmark a variant with that language's real profiling tool                 |
| `new`     | Scaffold a new algorithm problem across all registered languages            |
| `new-db`  | Scaffold a new database problem (schema / seed / expected stubs)             |
| `reveal`  | Open a hidden reference solution in a split editor                           |
| `doctor`  | Print the ✓/✗ toolchain matrix with install hints                            |

Examples:

```bash
python3 glifex.py test   001-anagram-detection python           # your practice.py vs the cases
python3 glifex.py test   001-anagram-detection                  # every installed language
python3 glifex.py bench  001-anagram-detection go optimized     # profile it properly
python3 glifex.py test   001-users-with-no-orders db            # DB problem, ephemeral Postgres
python3 glifex.py new    002-two-sum                            # new algorithm problem
python3 glifex.py new-db 002-monthly-revenue                    # new database problem
python3 glifex.py reveal 001-anagram-detection python clean     # peek at the reference
```

### VS Code front door

`.vscode/tasks.json` turns the CLI into dropdown pickers: press **Ctrl/Cmd + Shift + B**, choose problem and language, and it runs — no typing paths. Per-OS overrides handle the `python` vs `python3` split automatically, so the same task works everywhere.

---

## The double-blind workflow

This is what makes Glifex a practice tool rather than an answer key.

1. **Attempt cold.** Open `practice.<ext>` and implement your solution. Reference solutions (`clean.*`, `optimized.*`) are hidden from the explorer via `files.exclude`, so you won't stumble onto them.
2. **Verify.** Run `glifex test <problem> <language>` until it's green.
3. **Compare.** Now run `glifex reveal <problem> <language> clean` (or `optimized`) to open the reference in a split tab, side by side with yours.

Answers are hidden by **filename**, not by living in a folder the compiler chokes on — so Java and C# builds don't break. You simply don't *see* them until you ask.

---

## Adding a problem

```bash
python3 glifex.py new 002-two-sum        # algorithm problem, all registered languages
python3 glifex.py new-db 002-revenue     # database problem
```

For an algorithm problem: write `problem.md`, fill `test_cases.json` with `{ "input": {...}, "expected": ... }` entries, then implement `solve()` in whichever `practice.*` files you want. Harnesses are generated from each language's plugin, so they never drift.

---

## Extending Glifex

The set of languages is **not hardcoded**. Each language is a self-describing plugin in `languages/`, and the runner, `doctor`, the scaffolder, and the VS Code pickers all read that directory. Adding a language is a config file plus a harness template — no runner changes.

A plugin looks like this:

```toml
# languages/rust.toml
name           = "rust"
extension      = "rs"
practice_file  = "practice.rs"
detect         = "rustc --version"    # what `doctor` probes
compile        = "cargo build --quiet"   # optional; omit for interpreted languages
run            = "cargo run --quiet"      # how the harness executes
bench          = "cargo bench"            # the real benchmark tool
harness_template = "harness.rs"           # the generated per-problem harness
tool_version   = "rust 1.85"              # feeds .tool-versions
```

Drop in the `.toml` and its harness template, and everything else picks it up automatically. **C++, Kotlin, and Swift** are planned on exactly this mechanism (C++ exercises the optional `compile` stage; Swift is first-class on Linux/macOS/WSL and second-class on native Windows). See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full harness contract.

> **A plugin gets you the CLI tier, not the playground tier.** A `languages/*.toml` makes a language run *natively* under `glifex test` on whatever machine has its toolchain. Running that language **in the browser** is a separate, heavier piece of work: a WASM runtime must be built or vendored and wired into `web/runtimes.js` (see [`docs/browser-runtimes.md`](docs/browser-runtimes.md)). Until that exists, a newly added language is fully supported in the CLI and simply **CLI-only in the playground** -- disclosed honestly in the UI, never faked.

---

## Benchmarking

`glifex test` gives a fast correctness loop with coarse timing. For real numbers, `glifex bench` delegates to each language's purpose-built tool — because naive timing loops produce confidently wrong results from JIT warmup, dead-code elimination, and constant folding:

| Language      | Benchmark tool          |
|---------------|-------------------------|
| Python        | `pytest-benchmark`      |
| JavaScript/TS | `tinybench`             |
| Go            | `go test -bench`        |
| Java          | JMH                     |
| C#            | BenchmarkDotNet         |
| Ruby          | `benchmark-ips`         |
| C++           | Google Benchmark (planned; coarse in-harness now) |
| PostgreSQL    | `glifex db bench` — EXPLAIN plan diff (works today) |

`glifex db bench 001` works today: it diffs the query plans of your practice query
vs the references, flagging full scans vs index searches — the lesson that matters in SQL.

**Important caveat:** comparing *nanoseconds across languages* is not meaningful — at that granularity you're measuring the runtime (GC, JIT tier, string representation), not the algorithm. The valid comparison is **within a language** — e.g. `brute_force` vs `optimized` in the same runtime. That's exactly what these tools are built for.

---

## Using Glifex with an AI assistant

Glifex is designed to be AI-native. Because implementation files are pure solution code with zero harness noise, they fit cleanly into a context window, and any assistant can translate a solution across languages by pattern.

The repo ships an [`AGENTS.md`](AGENTS.md) at the root — read by Claude, Cursor, Copilot, and similar tools — stating the rules explicitly: implement your solution in `practice.<ext>`; inputs match `test_cases.json`; verify with `glifex test`; and never open `clean.*` / `optimized.*` unless asked.

---

## Web playground

`web/` is a static docs + practice site (the basis for glifex.dev) that runs
**fully offline**. JavaScript executes natively in the browser with zero setup;
other languages use WASM runtimes vendored once via `node web/fetch-runtimes.mjs`.
It reads the same `problems/` corpus as the CLI, so it can't drift.

```bash
node web/build.mjs
python3 -m http.server -d web 8080   # → http://localhost:8080
```

**Browser support.** Any current evergreen browser works: Chrome/Edge, Firefox,
and Safari, on desktop and on Android (verified on Android Chrome). The baseline
requirement is WebAssembly -- JavaScript problems run with zero downloads, and the
other in-browser runtimes (Python, Ruby, TypeScript, PHP, WAT, PostgreSQL, C, C++)
lazy-load a vendored WASM runtime on first use. One runtime, the **C** toolchain,
additionally needs `SharedArrayBuffer` and therefore cross-origin isolation; the
page enables it via a service worker and does a one-time reload the first time you
pick C (C++ needs neither). After a runtime's first use it is cached, so the
playground keeps working **offline** -- offline behaves identically to hosted, and
that equivalence is a machine-checked E2E test.

See [`STATUS.md`](STATUS.md) for exactly what's verified vs written-pending-local-check,
and [`docs/LAUNCH.md`](docs/LAUNCH.md) for the full step-by-step launch & verification walkthrough.
The sequenced plan lives in [`docs/ROADMAP.md`](docs/ROADMAP.md).



## The frontend track

Some problems are inherently visual — layout, markup structure, CSS behavior.
These live in `problems-fe/` and are **playground-native**: the browser is the
runtime, so they need nothing vendored and work fully offline. You write
HTML/CSS in the editor with a **live preview** beside it; correctness is a set
of **declarative DOM and computed-style assertions** (`assertions.json`) —
"exactly three `.card` children", "`display: flex`", "gap ≥ 8px". Assertions,
not pixel-diffing: deterministic across browsers, no font/antialiasing flake.
The same `assertions.json` is evaluated by the same engine in the playground
and in the Playwright E2E suite, so browser and CI can never disagree.

## The assembly family

`asm-x86_64`, `asm-arm64`, and `wat` (WebAssembly Text) are registry plugins
with two special properties, both declared in their `.toml`:

- **`arch`** — assembly only runs on matching hardware. `glifex doctor` and
  `test` skip with a clear "needs x86_64 hardware" notice instead of failing.
- **`scaffold = false`** — the universal JSON contract doesn't fit a register
  ABI, so each assembly problem hand-writes a small C shim (or JS host for WAT)
  that marshals JSON to a narrow signature like
  `int solve(const char *s, const char *t)`. gcc assembles `.s` files natively,
  so no extra toolchain is needed. WAT is numeric-only (core wasm has no
  strings) and is hosted by Node.

## Planned: the retro track

A future track for **Z80, 6502 (NES), and SM83 (Game Boy)** assembly. The
harness model inverts: assemble, execute in an emulated *CPU core* (no PPU or
graphics needed for algorithm practice) for N cycles, then read the result from
an agreed memory address. Lightweight CPU cores exist in both Python and JS, so
it could eventually run in the playground too. Deliberately deferred until the
emulator-harness pattern is designed properly — tracked as a future feature.

## Contributing problems

New algorithm problems require the **floor**: Python, JavaScript, C, and C++
with passing references and blank practice stubs, plus a `manifest.toml`
declaring languages, exclusions (with reasons), and worst-case complexity.
`glifex verify <problem>` runs the exact gate CI enforces. Everything above
the floor — more languages, more variants — is a welcome incremental PR.
Full policy: [docs/contribution-policy.md](docs/contribution-policy.md).

## CI & quality gates

Every push runs: lint (Ruff/Biome) → corpus-staleness check → the **polyglot
matrix** (every problem, every language, on Linux/macOS/Windows) → playground
engine test → Playwright E2E **including an offline-mode test** → CodeQL SAST +
Trivy (dependencies & secrets). Dependabot keeps actions and packages updated,
and pre-commit hooks (Ruff + gitleaks) catch problems before they reach a public
history. See `.github/workflows/` and [`STATUS.md`](STATUS.md).

## FAQ & design notes

**Do I need every language installed?**
No. Install only what you'll use; Glifex skips missing toolchains with a notice. `glifex doctor` shows what you have.

**Is it limited to a fixed number of languages?**
No — that's the point of the plugin registry. The languages above ship out of the box; adding another is a single `languages/<name>.toml` plus a harness template.

**Why hide answers by filename instead of in a `.solutions/` folder?**
For compiled languages, dot-folders aren't invisible to the *compiler*. C#'s MSBuild globs `**/*.cs` (including dot-dirs), and Java can't use `.solutions` as a package name — so both would pull hidden answers into the build and collide. Hiding by filename via `files.exclude` keeps the human blind while letting every toolchain compile normally. (The database track has no compiler, so it uses a `.solutions/` folder.)

**Why is the database track separate from the language registry?**
A SQL problem needs a running database and has a query contract, not a `solve(input)` one. It's a different execution model, so it gets its own harness and problem shape — while sharing the CLI and blind-practice UX.

**Is there any place the "written once" promise costs something?**
Yes: Java has no JSON parser in its standard library, so its harness vendors a small parser to keep the repo dependency-free. It lives entirely inside the generated harness you never edit.

---

## License

[MIT](LICENSE) © 2026 Joe Fuentes
