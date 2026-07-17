# Dart — dart2js, self-hosted to JavaScript (the spike record)

**Status: feasibility PROVEN, track not yet built.** Every number below is
measured — in CI (`chore/export-dart-spike-*`, throwaway, never merged), then
reproduced by hand against real headless Chromium. Nothing here is reasoned.

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

## 4. The one real bug — and the one-line fix

An unpatched `gx_web.js` **never compiles anything**. It dies on every compile:

```
A member with disambiguated name '_isJSObject' was not found in
top-level of library 'dart:js_interop'
```

### Root cause

`js_::_isJSObject`'s `Name.library` points at **`dart:_rti`**, not
`dart:js_interop`. So `pkg/kernel/lib/library_index.dart:329` silently drops it:

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

Instrumenting the emitted JS at that guard:

```
==== members SKIPPED by the private-name guard: 1 ====
  _isJSObject
      name.library   = rti
      parent.library = library dart:js_interop
```

**Exactly one member of the whole component**, and it is the one
`pkg/_js_interop_checks/.../shared_interop_transformer.dart` needs — a class
that resolves ~20 members **eagerly in its constructor, unguarded**, so one
missing member kills the whole transformer.

It bites *that* member because `_isJSObject` is the **only** one in that table
with a same-named **private twin in another library**: `rti::_isJSObject`, which
the reader sees first. Every member that resolves is unique by text across the
component.

The member is genuinely present — `pkg/kernel/bin/dump.dart` on the dill:

```
80108: library from "dart:js_interop" as js_ {
80825:   static method _isJSObject(core::Object? any) → core::bool
80828:   static method _isNullableJSObject(core::Object? any) → core::bool
80829:     return any == null || js_::_isJSObject(any{core::Object});
```

It is there, and its sibling's compiled body still calls it. **The member exists;
the lookup is wrong.**

Closed by contradiction: the **VM** compiles the same kata from the **same dill
bytes** and succeeds — and the transformer resolves `_isJSObject` eagerly and
unguarded, so on the VM that member *is* in the index, so on the VM
`Name.library` *must* be `dart:js_interop`. Same input, two answers.

> **dart2js, compiled by dart2js, misattributes a private name to a same-named
> private name from an earlier library.** Worth reporting upstream. There is no
> dart2js self-host test in `tools/bots/test_matrix.json` — only a DDC one.

### The fix

```diff
- if (member.name.isPrivate && member.name.library != library)
+ if (member.name.isPrivate && member.enclosingLibrary != library)
```

Ask the member **where it is declared**, not what its `Name` claims.
`_isJSObject` *is* declared in `dart:js_interop` — the dill says so — and
`Name.library` is precisely the thing dart2js gets wrong.

One line, in a pinned SDK checkout, applied **before `dart compile js`**. It
patches the **compiler, not the dill** — the same discipline this repo already
applies to riscv64 (built from pinned sources at deploy) and to binutils/emsdk
(pinned by hash). **Zero members dropped component-wide**, so it loosens nothing.

Dropping the guard entirely also works but keeps nine members kernel meant to
exclude. Narrow beats broad.

---

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
