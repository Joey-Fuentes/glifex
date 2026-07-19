# Adding a language

Written after doing it twice back to back — **arm64** (Bx-10) and **RISC-V
RV64GC** (Bx-10b) — and reading how the eleven tracks before them were built.
Everything here is a thing that actually happened, not a thing that might.

The headline: **the code is the easy part.** Both tracks lost far more time to
half-wired plumbing than to emulators or assemblers. The guards below exist
because each one caught a real bug, usually mine, usually after it shipped.

---

## 1. First, decide the shape

| shape | means | examples |
|---|---|---|
| **Interpreter-in-wasm** | vendor a prebuilt runtime, feed it source | Python (Pyodide), Ruby, PHP, Postgres |
| **Compiler-in-wasm** | compile in a worker, then run the output | Java (teavm-javac), C (clang.webc), C# (Roslyn), Rust (Miri) |
| **Emulator** | assemble to machine code, simulate a CPU | x86-64 (Blink), arm64 (VIXL), riscv64 (libriscv), 6502/sm83/i8080 |

For an **emulator** track the decisive question — the one that picked VIXL over
arm-sandbox and libriscv over Spike — is:

> **Can I set registers, jump to a symbol, single-step to `ret`, and read the
> result?**

Not "can it boot Linux". A candidate that only runs whole ELFs with syscalls
needs an ELF loader *and* a syscall harness: a different, much larger project.

**Read the candidate's headers before believing anything about it.** Bx-10's desk
research recommended a library whose header it had never opened and was wrong
three times over about a hardware requirement. Bx-10b's first probe searched for
`set_XPR`/`get_XPR` — invented names — got ABSENT, and proved nothing. *Grep the
real source at a recorded commit.*

**Prefer proven to promising.** libriscv already had a wasm example in-tree;
nobody had ever built VIXL to wasm. That single fact was worth more than every
other comparison.

---

## 2. The PR sequence

Both tracks converged on the same six. Each is independently mergeable and each
leaves the tree green.

| PR | contents | why separate |
|---|---|---|
| **0. Spike** | `chore/export-*` throwaway branch, never merged | CI has network; your sandbox may not |
| **1. Docs** | `docs/<thing>.md` + ROADMAP entry | so PR2+ has a reference and the findings don't die in a chat log |
| **2. Vendor** | `tools/<lang>-toolchain/*` + the step in **three** workflows | nothing consumes it yet; it can land alone |
| **3. Runtime** | worker + core + `runtimes.js` loader | the engine, with no content |
| **4. Corpus** | `problems/*/<lang>/*` × 4 variants + manifests + registry | the content |
| **5. Lab + e2e** | units, smoke spec, ceiling row | the proof |

**Document before building.** PR1 sounds like bureaucracy and isn't: PR2–5 are
written *against* it, and the alternative is re-deriving the same facts. Bx-10
lost five rounds re-deriving a build recipe that was sitting in the upstream
project's own script the whole time.

---

## 3. The file map

Every file that must change, in dependency order. **Missing any one of these
fails silently** — that's why the guards in §4 exist.

### 3a. The registry — `languages/<lang>.toml`

```toml
name = "asm-riscv64"
display = "RISC-V assembly (RV64GC)"    # feeds the corpus -- see the trap below
extension = "s"
practice_file = "practice.s"
family = "assembly"
arch = "riscv64"
platforms = ["linux"]                    # only what actually exists
scaffold = false
detect = "gcc --version"
install_hint = "..."
test_cmd = "gcc -std=c11 -O2 -o .glifex_bin harness.c *.s && ./.glifex_bin {variant}"
run_cmd  = "..."
tool_version = "gcc 14"
```

This drives the **CLI**, and `glifex verify` rejects any manifest declaring a
language that isn't registered. **It is not only a CLI concern**: `web/build.mjs`
reads the `display` key into the corpus's `displayNames`, so adding a plugin
makes the git-tracked `web/problems.generated.json` **stale** and CI fails.
Rebake in the same commit.

*(`asm-arm64.toml` has no `display` key, so arm64 renders as its raw id in the
dropdown. Pre-existing; worth a one-line fix.)*

### 3b. `web/build.mjs` — the extension map

```js
const ext = { python: "py", ..., "asm-arm64": "s", "asm-riscv64": "s" }[lang];
if (!ext) continue;          // <-- omit your language and it is DROPPED, silently
```

**Both** arm64 and riscv64 hit this. It cannot appear in the dropdown, no error,
no warning. `corpus-integrity.test.mjs` catches it *only* once a manifest
declares the language.

### 3c. The corpus — `problems/<id>/<lang>/`

- `practice.<ext>` — a stub. Must fail the real cases.
- `clean.<ext>` — the straightforward correct solution
- `optimized.<ext>` — see the trap in §5 about *slopes*
- `brute-force.<ext>` — the baseline the others improve on
- `harness.c` + `json.h` — for assembly tracks, usually **byte-identical** to a
  sibling arch's. Copy them; don't rewrite.

The **first `.globl`** in each file is what `driveProblem` dispatches on. Wrong
name = silent failure.

### 3d. `problems/<id>/manifest.toml`

```toml
asm-riscv64 = { variants = ["practice", "brute-force", "clean", "optimized"] }

[complexity.asm-riscv64.brute-force]
time = "O(n^2)"
space = "O(1)"
notes = "..."
```

Remove any `[exclusions]` entry for your language — that flag was a deliberate
decision by someone, and shipping the track is what earns removing it.

### 3e. The runtime — `web/<lang>-{core.mjs,worker.js}` + `runtimes.js`

```js
async function loadAsmRiscv64() {
  if (!(await vendored("asm-riscv64"))) return null;   // clean null when unvendored
  ...
}
const LOADERS = { ..., "asm-riscv64": loadAsmRiscv64 };   // register it, or it is unreachable
```

The core returns per-case `{ ok, got, expected, insns, cycles, peakStack, ret }`
plus an aggregate `{ results, instructions, spaceBytes, codeBytes }`.

### 3f. Vendoring — `tools/<lang>-toolchain/` + **three** workflows

`pins.env` (every pin in one file), `build-*.sh`, and a `verify-*.mjs` that
**runs something in the built artifact**. The step goes in `pages.yml`, `ci.yml`
**and `export-vendor-bundle.yml`** — `vendor-sync.test.mjs` will force the third.

The cache key is a content hash of the pinned inputs (`web/fetch-runtimes.mjs`,
`tools/**`, `web/runtime-hashes.json`, `web/csharp-runtime/*.cs` / `*.csproj`), so it
**self-versions**. Adding `tools/<lang>-toolchain/` moves the key on its own,
there are no `restore-keys`, and a miss is a real miss -- nothing is restored, so
no step early-exits on `.vendor-complete`.

Keep the new runtime's pins in its `pins.env` (or the other hashed files above),
never inline in a workflow -- an inline pin is not in the key and drifts silently.
If a rebuild ever needs forcing, an input is missing from the key: that is a CI
bug and the fix is the key, not a counter. See Invariant 10 in
`docs/architecture.md`.

### 3g. The Lab — usually nothing

`buildPlan` resolves `sizes[tier + "ByLang"][lang] || sizes[tier] || sizes.wall`,
and the tier is decided **at runtime** — `lab.js` picks `det` when results carry
`cycles`. So a single-stepped track becomes det-tier the moment it lands and
**inherits `sizes.det` automatically**. Only add a `detByLang` entry if your
track needs a *narrower* ladder than the default.

### 3h. `e2e/<lang>-smoke.spec.js`

Use `require("./coi-fixtures")`, like every other asm track. Your runtime may not
*need* isolation — but the live site **is** isolated and reloads once to get
there. A plain-server pass proves something no user experiences.

Paste the shipped `clean` reference, not the practice stub, or an empty solution
can trivially "pass".

---

## 4. The guards, and what each is telling you

Run them locally; they are fast and they are the accumulated scar tissue.

| guard | catches |
|---|---|
| `web/corpus-integrity.test.mjs` | a language declared + runnable but **not baked** — you forgot `build.mjs`'s ext map |
| `web/vendor-sync.test.mjs` | a runtime vendored in some pipelines but not all three |
| `web/lab-ladder.test.mjs` | a problem with no `det` ladder — a det track would inherit the **wall** ladder |
| `python3 glifex.py verify <p> --static` | a manifest declaring an unregistered language |
| `git diff -I '"generatedAt"' web/problems.generated.json` | a stale corpus |
| `e2e/lab-ladder-ceiling.spec.js` | a track that **cannot reach the top rung of its own ladder** |

That last one found a **pre-existing Bx-7 bug within minutes of existing**:
`asm-x86_64`'s 002 blows its 30 s worker budget at n=512, its own declared
ceiling. Nothing had ever run a track at its ladder ceiling before.

---

## 5. Traps, ordered by what they cost

**1. Absent config is not neutral.** No `sizes.det` on 001/002 meant arm64
inherited the *wall* ladder to n=32768 and Analyze reported "the solution is
incorrect" **on the live site**. The default is the most aggressive setting
available. Fixed structurally: 001/002 now define `det`, so the next track
inherits something sane.

**2. Optimising a constant at the cost of a slope.** riscv64's first 001
`optimized` traded a fixed ~1000-instruction sweep for ~6 instructions *per
character*. It won at n=32 and **lost by n=256** — it grew *faster* than `clean`.
A growth lab is the worst possible place for that. The honest version ties
`clean` on the worst family (an early exit cannot help an input with no early
exit in it) and wins ~35% on the family where the Lab's lower bound lives.

**3. Do not inherit another arch's assumptions.**
- **Comment characters differ.** RISC-V's `as` uses `#`; aarch64 uses `//`.
  *Every* kata failed on this once.
- **`insns != bytes/4` is not universal.** aarch64 is fixed-width; RV64GC
  compresses **automatically** (plain `add a0,a0,a1 / ret` → two 2-byte
  instructions); s390x is 2/4/6-byte variable-length.
- **Instruction sets differ in embarrassing ways.** RV64G has no `clz` (it is
  Zbb). A naive MSB search made fast-doubling **3.6× slower than the iterative
  version**.
- **Relocation must be re-measured.** `adrp` and `auipc` both happened to
  relocate freely. That is two data points, not a law.

**4. Upstream's defaults are for upstream's workload.** libriscv's wasm example
sets `RISCV_ENCOMPASSING_ARENA_BITS=28` — a **256 MB** arena — because it runs
LuaJIT. Katas need ~2.5 MB, and two live arenas OOM the heap. It also ships
`RISCV_EXT_C=OFF`, which **rejects a compressed ELF at load** — fatal, since
`-march=rv64gc` compresses by default. VIXL's guest stack defaults to **8 KB**
because it was built to run JIT'd fragments; native gives 8 MB, so the gap is an
*invisible* cliff — the same `.s` passes on the CLI and traps in the browser.

**5. A blown budget must ERROR, not return a wrong answer.** arm64 shipped
`MAX_STEPS` exhaustion as `ret:false` plus a stale output buffer, so a truncated
run read as *"your algorithm is incorrect"*. Plausible output is the worst
failure shape there is.

**6. Retargeting a script by pattern-substitution substitutes only the patterns
you thought of.** Retargeting arm64's `build-binutils.sh` to riscv64 left a
shared `$HOME/bu` build directory (autotools caches `target_alias` and refuses)
*and* a `chmod +x "$OUT"/aarch64-*.elf` glob that matched nothing. Two round
trips, same root cause. Derive names from a single `TARGET_TRIPLE` so there is no
pattern left to survive.

**7. A guard that cannot fail is not a guard — and one that fires on a correct
artifact is worse than none.** Every self-inflicted false alarm in both tracks
was a **string count or substring used as a decision gate**: `file(1)`'s prose, a
target triple standing in for a libc, a probe assuming a symbol sits at `.text`'s
start, a count that included the line it had just added, a match that hit a
*comment quoting the old code*. **Run every guard against real content, both
ways, before shipping it.**

---

## 6. What a track actually costs — riscv64, honestly

**Free, inherited:** Blink (already vendored, already proven at running a guest
toolchain), the musl binutils recipe (one triple changed → 1.94 MB), the
`pins.env` self-bumping vendor pattern, `vendor-sync`, and the Lab ladder.

**The real work:** the emulator. Everything else is plumbing.

**Where the time actually went:** four CI rounds died on *my* build scaffolding —
a generated header, a missing `-fexceptions` (a throw dies as `table index is out
of bounds`, naming a table instead of an exception), a relative `add_subdirectory`
broken by copying the directory, a renamed `.wasm` the `.mjs` could no longer
find. libriscv never put a foot wrong.

**What ended it:** installing emsdk on a real box and building it by hand once.
Minutes, after four round trips. That hit the same wall from the other side —
emsdk's clang and its bundled node are **glibc**, the box was **musl**
(`apk add gcompat`, and point `NODE_JS` at the system node).

> **The pattern, across both tracks:** every expensive mistake was reasoning
> where reading would have worked, and every cheap fix was reading the upstream
> source, running the known-good control first, or testing a guard against real
> bytes. The tooling was usually already there.
