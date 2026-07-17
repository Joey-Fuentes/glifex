# Dart — dart2js, self-hosted to JavaScript (the spike record)

**Status: feasibility PROVEN, track not yet built.** Every number below is
measured — in CI (`chore/export-dart-spike-*`, throwaway, never merged), then
reproduced by hand against real headless Chromium. Nothing here is reasoned.

> **Corrected 2026-07-18.** §4 previously named the wrong bug and the wrong fix,
> and claimed a workaround "loosened nothing" when it changed `LibraryIndex`
> semantics on every platform. The real defect is a 32-bit cache key in
> `package:kernel`'s dill reader; it is kernel's, not dart2js's. See §4 and
> `docs/UPSTREAM-NOTES.md` items 4-7.

Dart was on the roadmap as *"likely the easiest remaining track, not the
hardest"*, on the strength of `try.dartlang.org` (2013) having compiled Dart to
JS in the browser by running dart2js on itself. **That steer was right.** The
supporting argument was wrong in almost every particular, and the corrections
are recorded in §8 — they are the useful part.

---

## 1. The verdict

```
compile   ok=true   ~4.4s    dart2js, AS JAVASCRIPT, in a real Chromium page
                             fetch()ed its platform inputs, compiled Dart
                             source to JS with no filesystem and no server
run       ok        [KATA] gx ok solve(10)=55
                             the JS it emitted, executed on the page
```

**dart2js (Dart SDK 3.12.2, BSD-3-Clause), compiled to JavaScript by dart2js,
runs in the browser and compiles Dart correctly** — driven through the SDK's own
embeddable compiler API, over an in-memory provider, with `dart:io` linked but
never called.

The output is **byte-identical to the Dart VM running the same compiler over the
same inputs**:

| | VM | browser |
|---|---|---|
| Resolved elements | 622 | **622** |
| Inferred types | 10538 | **10538** |
| Compiled methods | 275 | **275** |
| `out.js` | 107,044 chars | **107,044 chars** |

Not approximately the VM's answer. Exactly it.

---

## 2. The route — the embeddable API, not the CLI

`pkg/compiler/lib/compiler_api.dart` (280 lines) imports only `dart:async` and
`dart:typed_data`. It is the surface `try.dartlang.org` used and it is still
there:

```dart
Future<Input<Uint8List>> readFromUri(Uri uri, {InputKind inputKind = InputKind.utf8});
OutputSink createOutputSink(String name, String extension, OutputType type);
void report(Message? code, Uri? uri, int? begin, int? end, String text, Diagnostic kind);
Future<CompilationResult> compile(CompilerOptions, CompilerInput, CompilerDiagnostics, CompilerOutput);
```

Everything the compiler reads and writes goes through those interfaces. Serve
them from memory and there is no filesystem in the compile path.

**The CLI entrypoint cannot self-host, and the reason is not `dart:io`:**

```
dart compile js pkg/compiler/lib/src/dart2js.dart
  Error: Dart library 'dart:ffi' is not available on this platform.
  compiler/src/dart2js.dart => src/io/mapped_file.dart => package:mmap => dart:ffi
```

`dart:ffi` is a **hard front-end rejection on the import graph**, before tree
shaking — reachability is irrelevant. And it is confined: `dart:ffi` enters
`pkg/compiler` through exactly **one** file (`src/io/mapped_file.dart`) imported
by exactly **one** file (`src/dart2js.dart`, the CLI). Nothing else in
`pkg/compiler` touches `package:mmap`.

So the CLI failing while the embeddable entrypoint compiles is **structure, not
luck**: the `dart:ffi` dependency sits in the host adapter layer, on the CLI's
side of the line — exactly where `dart:io` does.

### `dart:io` compiles. It throws when *called*.

The single most useful thing the spikes established, and it inverts the
roadmap's premise:

```
dart compile js uses_io.dart      ->  Compiled 10,315,766 bytes to 152,259 chars JS
node uses_io.js                   ->  Unsupported operation: _Namespace
```

dart2js **compiles** `dart:io` and emits code that throws only when the
filesystem is actually touched. There is no compile-time rejection. So the job
was never to strip `dart:io` out of the compiler's closure — only to never call
it. That is what the embeddable API is for, and it is why the compiler
self-hosts at all.

Confirmed by census: `pkg/compiler` is **4 of 278 files** on `dart:io`, and they
are the CLI entrypoint plus the two `dart:io`-backed providers
(`source_file_provider.dart`, `util/output_util.dart`) — the host adapter layer,
which an embedder replaces by definition.

---

## 3. What the browser is handed

```
gx_web.js               16,219,752 raw    2,369,933 gz    the compiler itself
dart2js_platform.dill   10,292,168 raw    3,284,296 gz    the platform, as bytes
libraries.json              22,874 raw        2,135 gz
                        ----------         ---------
                        26,534,794 raw    5,656,364 gz     = 25.3 MB / 5.4 MB
```

Two `fetch()`es and a JS file. The page fills two globals — `gxGetDill`,
`gxGetLibrariesSpec` — and the compiler reads its world from them.

The complete input set the compiler asks for, observed rather than predicted
(the provider logs every `readFromUri`):

```
org-dartlang-sdk:///platform/dart2js_platform.dill  [binary]
org-dartlang-sdk:///sdk/lib/libraries.json          [binary]
org-dartlang-sdk:///sdk/lib/libraries.json          [utf8]
org-dartlang-gx:///.dart_tool/package_config.json   [binary]
org-dartlang-gx:///main.dart                        [binary]
```

Seven reads, five distinct Uris. All opaque schemes — they are map keys, never
paths. `package_config.json` is synthesised empty (a kata has no `package:`
imports, so an empty config is honest rather than a fudge).

**The entry is a flag, not a positional.** `CompilerOptions.parse(<String>[entry])`
silently leaves `compilationTarget` at `Uri.base.resolve('out.dill')`, putting
dart2js in read-a-kernel mode. The SDK's own harness
(`src/util/memory_compiler.dart:181`) does it correctly:

```dart
options = [...options, '${Flags.entryUri}=$entryPoint'];
```

**Inputs must be real `SourceFile`s.** `utf8` inputs get *cast* to `SourceFile`;
a hand-rolled `Input` implementation is rejected at runtime. Use
`StringSourceFile` / `Utf8BytesSourceFile` / `Binary` from
`pkg/compiler/lib/src/io/source_file.dart` — which is one of the 274 files in
`pkg/compiler` that do **not** import `dart:io`, so it is safe on the browser
path.

**`..environment` must be set.** It defaults to `const {}`; `deriveOptions`
writes to it; a const map is unmodifiable.

---

## 4. The one real bug — and the fix

An unpatched `gx_web.js` **never compiles anything** on SDK 3.12.2. It dies on
every compile:

```
A member with disambiguated name '_isJSObject' was not found in
top-level of library 'dart:js_interop'
```

### Root cause — a 32-bit cache key in kernel's dill reader

"Kernel" here is **Dart's intermediate representation** — the typed AST every
Dart backend consumes, and what a `.dill` file contains. `package:kernel`
defines it and (de)serialises it. The bug is in the reader.

`pkg/kernel/lib/binary/ast_from_binary.dart`, `BinaryBuilder.readName` (line
1213 at tag 3.12.2, 1261 on main — the code is byte-identical, only the line
moved):

```dart
if (isPrivate) {
  libraryReferenceIndex = readUInt30();
  // Check cache using the upper bits for the library reference.
  nameCacheIndex = stringReference | ((libraryReferenceIndex) << 30);
} else {
  nameCacheIndex = stringReference;
}

final Name? cached = _nameCache[nameCacheIndex];
if (cached != null) {
  return cached;          // <- hands back the OTHER library's Name
}
```

`_nameCache` is a `Map<int, Name?>`, not a `List` — the key never needed to be a
packed int. The packing exists only to get one int out of two.

**Both bitwise operators are 32-bit on web targets.** `x << 30` keeps only the
low two bits of `x`, and `|` truncates to int32, so the key retains
`libraryReferenceIndex & 3`. **Two libraries congruent mod 4 collide**, and the
cache returns the `Name` built for whichever was **read first**.

Measured on the real `dart2js_platform.dill`, for `_isJSObject`:

| | strIdx | libIdx | libIdx & 3 | key (VM, 64-bit) | key (web, 32-bit) |
|---|---|---|---|---|---|
| `dart:_rti` | 5036 | 9035 | 3 | 9701257384876 | -1073736788 |
| `dart:js_interop` | 5036 | 37275 | 3 | 40023726494636 | **-1073736788** |

Distinct on the VM. Identical on the web. `dart:_rti` is read first, so
`dart:js_interop`'s `_isJSObject` is handed the `_rti` object. Proven by
`identical()`, not by hash: under dart2js the two `Name`s are **the same
object**; on the VM they are two.

**This is kernel's bug, not dart2js's.** dart2js is faithful — it compiled a
64-bit assumption to correct 32-bit web semantics. Latent since `e3d4fbec80c`
(2022-11-01, *"[kernel] Deduplicate Names when loading dill"*) — a real,
well-measured optimisation, ~100 MB saved loading a large app, in code that had
only ever run on the VM.

### Where it surfaces

`pkg/kernel/lib/library_index.dart:329` silently drops any private member whose
`Name.library` is not the library being indexed:

```dart
void _addMember(Member member, String memberIndexName) {
  if (member.name.isPrivate && member.name.library != library) {
    // Members whose name is private to other libraries cannot currently
    // be found with the LibraryIndex class.
    return;                                  // silent. no error, no log.
  }
  _members![memberIndexName] = member;
}
```

`pkg/_js_interop_checks` then resolves ~40 members **eagerly and unguarded** —
across `shared_interop_transformer.dart`, `js_util_optimizer.dart` and
`js_interop_checks.dart` — so one wrong `Name` takes down the whole transformer,
with an error 20 members away from the cause.

**Scale:** component-wide, the guard skips **2987** members under dart2js on
3.12.2 against the VM's **90**. `_isJSObject` is simply the one that got looked
up. A same-text twin is *necessary* — the key starts from `stringReference`, and
the string table stores each text once — but the discriminator is the mod-4
congruence, not the twin.

### The fix — four edits, no arithmetic

All in `pkg/kernel/lib/binary/ast_from_binary.dart`. Anchors byte-exact and
unique at both 3.12.2 and main:

```diff
-  late Map<int, Name?> _nameCache;
+  late Map<(int, int), Name?> _nameCache;

-    final int nameCacheIndex;
+    final (int, int) nameCacheIndex;

-      nameCacheIndex = stringReference | ((libraryReferenceIndex) << 30);
+      nameCacheIndex = (stringReference, libraryReferenceIndex);

-      nameCacheIndex = stringReference;
+      nameCacheIndex = (stringReference, 0);
```

Records give structural equality and `hashCode`, exact on every platform, with no
arithmetic at all. `(stringReference, 0)` cannot collide with a private key:
privacy is decided by the **text** (`text[0] == '_'`), and the string table
stores each text once, so a given `stringReference` is *always* private or
*always* public.

The fourth anchor is a prefix hazard — `nameCacheIndex = stringReference`
**without** the semicolon also matches the packed line. With it, unique. Assert
count == 1 on every edit; a silently-missed anchor leaves the packed key in place
and the run "proves" a fix that was never applied.

**Do not "fix" this with multiplication.** `stringReference * 1073741824 +
libraryReferenceIndex` looks web-safe and passes at these sizes, but both are
UInt30 — at declared ranges the product needs **60 bits**, past 2^53, and it
fails **silently by rounding**.

Measured end to end with these four edits and `library_index.dart` left pristine:
**622 elements, 10538 types, 275 methods, 107,044 chars, `solve(10)=55`**, browser
gate passed in 4.4s. Identical to the VM, and identical to what the workaround
produced — without changing `LibraryIndex` semantics.

### The workaround that was wrong

An earlier version of this document recorded a one-line change to
`library_index.dart:329`, comparing `member.enclosingLibrary` instead of
`member.name.library`. Self-host compiled, so it was written up as proven. It was
not.

The VM legitimately drops **90** real cross-library private names — e.g.
`_closeGap owner=dart:html name.library=dart:collection` — and the guard is
*supposed* to skip those. The workaround takes 90 to 0. It **overshoots, on every
platform including the VM**, changing `LibraryIndex` semantics for everyone.

The measurement that hid it: "0 dropped", read as good. The meaningful comparison
was against the **VM's skip set**, which was never taken. The happy path,
declared as victory — the same error this series spent twenty rounds calling out.

### The main-channel trap

**Unpatched dart2js does not crash on main** (3.14.0-edge). All 41 eager members
resolve — and **1651 members are still misattributed** against the VM's 91.
Different dill, different library indices, different mod-4 parities, different
victims. Nothing was fixed; the dice landed differently.

So **"just upgrade the SDK" is not a fix.** It is a lottery ticket, redrawn every
time a dill is regenerated. A compiler running with 1,560 wrong `Name`s is a
silent-miscompilation risk, where a crash is at least honest.

**If Bx-13a pins main and skips the patch, it will appear to work.** That is the
worst available outcome, and it is the single most important line in this
document.

## 5. Measured cost

| | |
|---|---|
| wire, gzipped | **5.4 MB** (compiler 2.37 + dill 3.28 + spec 0.002) |
| browser compile | **4.4 s** (Chromium, incl. the 10 MB fetch) |
| VM compile, same work | 3.3 s |
| build: dart2js compiles itself | 47 s |

For scale, glifex already vendors: wat 1.3M, php 10M, python 12M, ruby 30M,
csharp 39M, rust 122M. **At ~5.4 MB gzipped Dart is cheaper than most of the
shipped tracks.**

---

## 6. Paths not taken

**dart2wasm.** Worse on every axis. `WasmCompilerOptions` carries `wasmOptPath`
and `maxActiveWasmOptProcesses` — it **shells out to a `wasm-opt` subprocess**,
which is unshimmable in a browser. It is also 6-of-62 files on `dart:io`
including `compiler_options.dart` and `io_util.dart`. And dart2js output runs
natively as JS, with no WasmGC dependency.

**The VM, via emscripten.** `modulovalue/dart-live` proves this works and is an
excellent reference: the real Dart VM built with emcc for `linux_simarm` —
wasm32 is a 32-bit host and you cannot JIT in wasm, so the VM's own **ARM32
simulator** executes what its JIT emits — plus the CFE compiled with dart2wasm.
Pinned at SDK `3.13.0-edge.41d347b7747424d5cdc9839bb0c65f75f9088b79`.

Measured from the artifact (its README's table is stale — `dart_il.wasm` is
18.4 MB, not the 9.7 MB claimed): **36.5 MB raw / 11.2 MB gzipped.**

Not vendorable as-is: **no LICENSE file**, and no build inputs (*"Build inputs
and patches live in a separate working tree"*). It also suppresses the kernel
version check (`for (let i = 8; i < 18; i++) k[i] = 0x30` writes the
skip-check sentinel over the SDK hash), so its CFE and VM are not verified to
agree.

The dart2js route is **half the wire**, needs no VM, no emcc, no gclient and no
embedder, and runs at native JS speed rather than through a simulated ARM. Its
one advantage — a simulator gives deterministic instruction counts, which is
exactly the Lab's det unit — is real but not worth 3x the cost and an
unlicensed 18 MB blob.

**Which DartPad is not.** The roadmap says DartPad *"went server-side"*, which is
why Bx-13 was ever filed as hard. It did not stay there: the SDK now ships
`pkg/dartpad_worker` (54 files; `dev_compiler`, a `resource_provider` virtual
filesystem, a MessagePort JSON-RPC channel) and `pkg/dartpad` (its browser-side
client, with a `/web/worker.wasm`). It is DDC-based. **It does not exist at tag
3.12.2** — it landed on main after the release branch was cut, so a resolvable
tree and DartPad's worker cannot currently be had at the same version.

---

## 7. Reproducing

The spike exports everything needed to drive this off-CI — `gx_web.js.gz`,
`dart2js_platform.dill.gz`, `libraries.json`, the drivers, a README:

```bash
gunzip gx_web.js.gz dart2js_platform.dill.gz
node drive-web.cjs gx_web.js dart2js_platform.dill libraries.json   # node
node drive-browser.cjs <dir> 8099                                   # real Chromium
```

`gx_web.js` **is** the Dart compiler as JavaScript. It needs node and two data
files — not a Dart SDK, not a network.

**Under node, define `globalThis.self` first.** dart2js targets the browser and
reaches its global through `self`; bare node CommonJS has none, so its async
scheduler never initialises and the first `await` never resumes — sync code
runs, then silence. **A browser needs no shim: `self` *is* the global.** Node
was the awkward host, not the browser.

---

## 8. Where the spike was wrong

The roadmap's steer — *dart2js is written in Dart, so self-hosting is the path to
check first* — was right. Everything supporting it needed correcting:

| roadmap said | actually |
|---|---|
| "the blocker shrinks to a `dart:io` shim" | `dart:io` compiles fine and throws only when called. The blocker was `dart:ffi`, in the CLI's host adapter layer, and one kernel bug. |
| "or dart2wasm, the modern equivalent" | dart2wasm shells out to `wasm-opt`. Not equivalent; not viable. |
| "DartPad went server-side" | It came back client-side. Also irrelevant: a third party had the whole VM in a browser. |
| "today's compiler is bigger and leans harder on `dart:io`" | 2.37 MB gzipped, and `dart:io` is 4/278 files, all in the layer an embedder replaces. |

### And what the spikes cost

Twenty-one CI rounds. **Most failures were the spike's own scaffolding, not
Dart** — `git sparse-checkout` takes directories only; a `| head -25` SIGPIPE'd
`dart pub get` to death *while it was working*; SDK source at `main` compiled
with a `stable` compiler. The tooling lessons that actually paid:

- **Run the control first.** Every hypothesis reasoned to in this series was
  wrong; every two-second control was right. Twenty lines of Dart with an
  `await` in it settled a stall that had eaten four rounds.
- **Print the reference; do not summarise it.** `memory_compiler.dart:181` — the
  `Flags.entryUri` line — was dumped verbatim in spike 4 and read in spike 10.
  Six rounds sat between them.
- **Log what was asked for, not what failed.** The provider's request log named
  every fault in the series. `MISSING org-dartlang-gx:///.dart_tool/package_config.json`
  is a fix; "compile failed" is not.
- **Export the artifact.** Once `gx_web.js` left CI, questions that had cost a
  round each were answered in seconds. It should have been exported at round 2.
- **Errors mask errors.** `front_end/src/base/crash.dart:94` builds an
  `HttpClient` to phone a crash server at `127.0.0.1:59410`; in JS its
  constructor throws `Platform.version` one line before the `try` that would
  have rethrown the original. Three rounds were spent chasing the reporter
  instead of the crash. **front_end's crash reporter is browser-hostile** — a
  browser track has to reckon with it, by an upstream fix or by never crashing.
