# Go — the gc toolchain, self-hosted in wasm (the spike record)

**Status: feasibility PROVEN, track not yet built.** Every number below is
measured — in CI (`chore/export-go-spike-*`, throwaway, never merged) and then
reproduced by hand in a real headless Chromium. Nothing here is reasoned.

Go was on the roadmap as "heavy + unpackaged, prove the path before committing",
with langbox as the fallback. Both framings were wrong in the same direction:
the roadmap's own steer — *the `gc` compiler is written in Go and Go targets
`wasip1`, so self-hosting is the path to check first* — was right, and the path
is not heavy. It is **lighter than Rust, which already shipped.**

---

## 1. The verdict

```
compile  exit=0   955ms   the real glifex harness, multi-file package
link     exit=0  1946ms   -> out.wasm 3,424,445 bytes
run      exit=0    55ms   7/7 passed
                          headless Chromium. No cmd/go. No os/exec. No COI.
```

**`cmd/compile` and `cmd/link` (Go 1.25.12, BSD-3-Clause), built for
`GOOS=wasip1 GOARCH=wasm`, compile and link Go in the browser** — hosted in
wasm, driven from JS, over a virtual FS.

The output is **byte-identical** across three unrelated WASI hosts —
`node:wasi`, wasmtime, and glifex's own bundled `browser_wasi_shim`
(`sha256 a114a8e6ecf15044…`, 3,424,445 bytes each time). The toolchain is
deterministic and the result is not an artefact of any one host.

## 2. The pipeline

```
editor .go
  -> compile.wasm  (cmd/compile, built for wasip1/wasm)   -> main.a
  -> link.wasm     (cmd/link,    built for wasip1/wasm)   -> out.wasm
  -> the page instantiates out.wasm                       -> [PASS] on stdout
```

JS is the build driver. There is no `go` command anywhere in the browser — see
§3, that is forced, not chosen.

Both halves run under the **same shim already vendored for Bx-6**, and the
harness's own stdout is captured the same way the Rust worker captures Miri's.
The glifex contract (`[PASS]` / `N/N passed` on stdout) needs no adaptation.

## 3. `cmd/go` is not part of the answer

The `go` command builds by **forking** `compile` and `link` as subprocesses.
`os/exec` does not work under `wasip1`. So `go build` cannot run in the browser,
and no amount of shim work changes that.

This is the design constraint that shapes everything else, and it is
load-bearing in three places:

- **JS orchestrates instead.** `compile.wasm` then `link.wasm`, as two separate
  WASI instances sharing one virtual FS. Cheap, because the FS is ours anyway.
- **std must be precomputed** (§5) — building it on demand is `cmd/go`'s job.
- **The build cache, module resolution, and `go.mod` are all out of scope.** The
  worker hands the compiler an explicit file list and an explicit `-importcfg`.
  For glifex that is *correct*, not a compromise: a kata is a fixed set of files
  with a fixed import closure.

## 4. Gate 1 — the toolchain builds itself for wasm

```
GOOS=wasip1 GOARCH=wasm go build -o compile.wasm cmd/compile   -> 41,890,089 bytes
GOOS=wasip1 GOARCH=wasm go build -o link.wasm    cmd/link      -> 11,084,671 bytes
```

First try, no patches, no fork. This was the gate that could have killed the
track and it did not even resist.

Two things that could have been problems and are not:

- **The linker needs no mmap.** Go's linker has a no-mmap output path and takes
  it on wasm without being asked. This is the single biggest structural
  difference from `rustc`, which Bx-6 abandoned because it needs an in-browser
  **linker**. Go's linker *is* the toolchain, written in Go, and it just
  compiles to wasm with everything else.
- **Host arch == target arch.** The compiler that runs on `wasm` also targets
  `wasm`, so there is no cross-compilation trick. `cmd/compile` reads `GOOS`/
  `GOARCH` from the environment **at runtime** and selects the target — the WASI
  host passes `GOOS=wasip1 GOARCH=wasm` in `env` and that is the whole
  configuration.

## 5. std export data — the part with no in-browser answer

Since Go 1.20 the distribution **does not ship prebuilt `.a` archives** for std.
`cmd/go` builds them on demand into the build cache. There is no `cmd/go` in the
browser, so the export data must be precomputed at vendor time:

```
GOOS=wasip1 GOARCH=wasm go list -deps -export \
  -f '{{if .Export}}packagefile {{.ImportPath}}={{.Export}}{{end}}' .
```

That emits `-importcfg` lines directly. Copy each archive out of the build cache
into the payload, rewrite the paths, hand the file to `compile` and `link`.

**Measured on the real harness, not a hello world: 64 packages, 24,231,794
bytes.** The closure was measured, per the Rust track's hardest-won lesson —
Bx-6's 23-rlib minimum was found empirically because reasoning about what std
"should" need was wrong every time. Measuring it on a toy would have produced a
number that was a lie: `hello.go` pulls `fmt`, but the glifex harness pulls
`encoding/json`, `os` and `reflect`, and `reflect` drags in most of the runtime.

**And that number is a floor, not the payload.** It is the *harness's* closure.
`sort` is not in it. Neither is `container/heap`, nor `math/rand` — so a kata
whose `practice.go` writes `import "sort"`, an entirely ordinary thing to write,
does not compile. The track must vendor every std package a user might plausibly
import: a policy (`tools/go-vendor-imports.txt`) plus a measurement.

| closure | packages | bytes |
|---|---|---|
| harness-only | 64 | 24,231,794 |
| **allowlist — shipped** | **103** | **30,279,904** |
| all of std | 339 | 123,402,568 |

The allowlist costs **+6MB over the floor** — the transitive closure had already
dragged most of the runtime in through `reflect` and `encoding/json` — and saves
**93MB against shipping std whole**. `tools/go-vendor.sh` builds it, and gates on
a kata that actually imports `sort` and `container/heap`: an allowlist nothing
compiles against is a guess with a filename.

Use **absolute guest paths** (`/pkg/fmt.a`) in the importcfg. Relative paths
work only if the compiler's cwd is what you think it is, and §6 is what happens
when it is not.

> The compiler genuinely reads this file rather than defaulting: fed a bogus
> path, it reports the bogus path back verbatim. Worth knowing, because a
> silently-ignored importcfg would look identical to a working one right up
> until the link fails.

## 6. The preopen shape — the dead end that cost a whole CI run

Spike run 1 died 0.24s into the decisive gate:

```
compile: -importcfg: open work/importcfg.txt: Bad file number
```

`Bad file number` is `EBADF`, and it is **not** a permissions or path-typo
problem. The cause:

- wasmtime's `--dir .` creates a preopen **named `"."`**.
- Go's `wasip1` runtime resolves relative paths against its cwd — taken from the
  `PWD` env var, defaulting to `/` — producing `/work/importcfg.txt`.
- It then looks for a preopen matching that path. `"."` never matches `"/…"`.

**Preopen the guest root.** `--dir .::/` for wasmtime; `preopens: { "/": root }`
for `node:wasi`; `new PreopenDirectory("/", tree)` for the shim. Then it works.

This cost a round trip because the spike guessed a preopen shape instead of
measuring one. The fix was found by pulling `compile.wasm` out of run 1's own
artifact and driving it locally until it reproduced — which is also why run 2's
artifact ships `pkg/`: **a spike artifact should contain everything needed to
re-drive the thing offline**, or the next question costs another CI run.

## 7. The shim — glifex already had it, and it already covers Go

`compile.wasm` imports **34** WASI calls; `link.wasm` imports **36**. glifex's
bundled shim provides **46**. **Zero missing** — checked statically, against the
module's own import table, before running anything:

```js
const wanted = WebAssembly.Module.imports(mod).filter(i => i.module.startsWith("wasi"));
const provided = new Set(Object.keys(new WASI([], [], []).wasiImport));
wanted.map(i => i.name).filter(n => !provided.has(n));   // []
```

Worth doing that way round: a missing call otherwise surfaces as an
instantiation failure that names nothing useful.

> **`@bjorn3/browser_wasi_shim` is not on npm under that name.** The spike tried
> and got `ERR_MODULE_NOT_FOUND`. glifex's copy is **vendored inside rubri** at
> `rustbuild/wasi/` and bundled into `web/rust-worker.js` by esbuild — which is
> how it got here, via Bx-6. A Go worker should bundle it from the same source
> the same way. Do not go looking for a registry package.

The bundled shim logs every `path_open` to the console. One Go compile emits
~70 lines of it. Harmless in a spike; not shippable.

## 8. Measured cost

Real headless Chromium, plain static server, cold:

```
vfs: 76 files, 24,251,477 bytes                          1719ms
WebAssembly.compile(compile.wasm)                         589ms
compile                                          exit=0   955ms
WebAssembly.compile(link.wasm)                            759ms
link                                             exit=0  1946ms
run out.wasm                                     exit=0    55ms
                                                  total  6122ms  -> 7/7 passed
```

Warm — modules already compiled, payload already fetched — is **compile+link
≈ 2.9s**. Rust/Miri is ~2s per run, so Go lands in the same class as a track
that already shipped.

Cross-host, same work:

| host | compile | link |
|---|---|---|
| `node:wasi` (CI) | 201ms | 381ms |
| wasmtime (CI) | 260ms | — |
| glifex's shim (node) | 3249ms | 1296ms |
| glifex's shim (Chromium) | 955ms | 1946ms |

The shim is ~3–16x slower than a native WASI host — it is a JS implementation of
the syscall layer, and the Go toolchain does far more file I/O than Miri does.
That gap is the shim's, not Go's, and it is already priced into the 2.9s above.

Payload, against the tracks it would sit beside:

| | Bx-12 Path A | Rust (shipped) | langbox |
|---|---|---|---|
| payload | **79.4MB** | 122MB | ~835MB |
| tax | ~1x | ~1000x (Miri) | ~300x |
| compile | ~1s | — | 5.9s (`gcc hello.c`) |

**No cross-origin isolation.** Confirmed in the browser: `crossOriginIsolated`
is `false`, `SharedArrayBuffer` is `undefined`, and it works anyway. Go's wasm
runtime is single-threaded and cooperatively schedules goroutines on one thread.
Go joins Rust and C# on the plain-server side of the COI split — **no COOP/COEP
header work, no `web/coi-server` involvement.**

## 9. Paths not taken

- **langbox (`docs/langbox.md`, ON HOLD)** — the roadmap's fallback, now moot.
  Its Go-specific objection was that Go compiles are one-shot, so there is no
  daemon to amortise startup against the way kotlinc's ~94%-startup finding
  allows. True, and irrelevant: there is nothing to amortise at ~1s. A ~400MB
  SDK on a ~400MB substrate at ~300x, against 79.4MB at ~1x.
- **yaegi** (`traefik/yaegi`, Apache-2.0) — the Miri-shaped "light" option: a
  pure-Go Go **interpreter**, so no linker, no export data. Built for `js/wasm`
  it is **40,297,733 bytes** — about half Path A. Rejected anyway, and *not* on
  size: it is an interpreter with its own stdlib bindings and its own generics
  story, which is exactly the "faithful over light" trade the roadmap said not
  to make. Bx-6 took the interpreter because `rustc` needed a linker it could
  not have. Go's linker works, so Go does not need the excuse. **Keep yaegi
  filed** — if Path A's payload ever becomes the blocker, this is the retreat,
  and its stdlib/generics coverage is the thing to measure then. This spike did
  not measure it.
- **TinyGo** — LLVM plus `wasm-ld` in the browser. That is precisely the problem
  Bx-6 walked away from. Not attempted, and there is no reason to.

## 10. Still open — what the track must answer

The spike proves the toolchain. It does not prove the track.

- **Nothing is measured on a phone**, as with every other compiled track. Stated
  plainly because an earlier draft of this file called it "the one that could
  still kill it", which was wrong twice over. Android is not a gate: STATUS.md
  verifies it for the *interpreted* Playground tier, and C, Rust and the asm
  tracks never claimed it and shipped regardless. And the comparison runs the
  other way — C ships a **106MB** `clang.webc` and *needs*
  `--js-flags=--max-old-space-size=3072` or headless Chromium hard-crashes on
  it, while Go's 79.4MB needs no flag at all (re-run without it: 7/7, 8473ms
  cold — slower, not broken). Go is lighter and less demanding than a track that
  already shipped. Worth measuring on a device eventually; not a blocker.
- **One problem, one variant.** 001 only, via the spike's own practice/clean/
  optimized stand-ins. The repo's real blind-practice files were not touched.
- **No error mapping.** Compile errors and panics report positions in the
  synthesised file. Rust needed `remapLines` for exactly this; Go will too, and
  Go's multi-file package makes it a *file*-and-line problem, not just a line
  one.
- **Metrics tier undecided.** Unlike Miri's virtual clock, Go under `wasip1` has
  a **real** clock — so Go is a wall-time tier, not a deterministic one. Heap is
  reachable via `runtime.ReadMemStats`. Stack probably is not.
- **The vendor step is unlike every other track's.** There is no release to
  download: the payload must be **built** at deploy time (`go build cmd/compile`
  + `go list -export` for std), with `actions/setup-go` and a pinned Go version.
  That is the arm64/riscv64 "built from pinned sources" pattern, not the
  Rust/C# "fetch someone's artifact" pattern. The cache key moves by itself —
  it hashes `tools/**` — so adding `tools/go-vendor.sh` busts the vendor cache
  for every language exactly once. And `web/vendor-sync.test.mjs` requires
  **three** pipelines to agree, not two: `pages.yml`, `ci.yml` and
  `export-vendor-bundle.yml`. Bx-10 wired the first two and silently forgot the
  third, which is why that test exists.
- **Shim console spam** (§7) must be silenced before it ships.
- **Larger programs untested.** Generics, `-c` concurrency, big std imports.

## 11. Reproducing

```
git checkout chore/export-go-spike-20260716-1758     # throwaway, never merged
```

The workflow is push-triggered and self-contained: `tools/go-spike/build.sh`
builds the toolchain and gathers export data; `tools/go-spike/drive-wasi.mjs`
runs the decisive gate under `node:wasi`. The `go-spike2-<run_id>` artifact
(~80MB, includes `pkg/`) is enough to re-drive the whole toolchain offline —
in node, or in a browser against `web/rust-worker.js`'s bundled shim.

The decisive probe, in the shape that picked VIXL and libriscv — **not** "can it
boot", but: *can `cmd/compile` and `cmd/link`, themselves built for wasm,
compile and link a real program that then runs and prints the right answer?*
It ported a fourth time.
