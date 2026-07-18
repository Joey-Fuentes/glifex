# Diagnosis and Fixes for the teavm-javac In-Browser "Maximum Call Stack Size Exceeded" Stack Overflow

> **Corrected 2026-07-18 (Bx-8b).** Two things here are now wrong by implication.
>
> **(a) "Rebuild against current TeaVM (0.15.0)" is not a version bump.** TeaVM
> the library is at 0.15.0 -- that part is right. But `konsoletyper/teavm-javac`,
> which is what actually builds the playground compiler, pins **TeaVM 0.13.1** in
> its `gradle/libs.versions.toml` and has not moved since 2026-03-21. There is no
> 0.15.0 teavm-javac to rebuild against. Doing it means editing that pin
> ourselves, i.e. a **fork** -- newly *possible* now that Bx-8b builds from
> pinned source (`docs/teavm-javac-self-built.md`), but a real behaviour change
> on a track whose only guard is one smoke test, not a free win.
>
> **(b) The construct list is suspect.** Bx-8b compiled ten minimal probes --
> `HashMap`, `Arrays.sort`, `Arrays.asList`, `List.of`, recursion, streams,
> `@FunctionalInterface`, `StringBuilder`, `TreeMap` -- on both the old playground
> blob and the from-source build. **All ten compiled, on both.** Those are exactly
> the constructs blamed here and in `web/java-worker.js`'s user-facing error. So
> the ceiling is probably cumulative size/branchiness rather than those
> constructs. **The probes are minimal, so this is a lead, not a result** -- do
> not rewrite the error message on the strength of it. Measure first.

## TL;DR
- **This is a known, long-standing, and essentially *inherent* limitation of running javac in the browser via TeaVM, not a misconfiguration of your assets.** The "RangeError: Maximum call stack size exceeded" is javac's deep compile-time recursion exhausting the browser's small, fixed JavaScript call stack — a ceiling that exists in *both* the historical JavaScript build (GitHub issue konsoletyper/teavm-javac #3, open since Feb 2018) and, by the same mechanism, the current WasmGC build. There is no maintainer-documented "just flip this switch" fix.
- **The single highest-value mitigation you fully control is to run the compile where the JS stack is larger and/or avoid the constructs that deepen javac recursion.** TeaVM exposes **no runtime WasmGC "recursion depth / JS stack size" option** (`LoadOptions.stack` only sizes the *Emscripten C stack*, not the JS/Wasm call stack). The documented `maxTopLevelNames` option is JS-backend-only and addresses a *different* Chromium stack bug. So the practical levers are environment stack size, avoiding annotation-heavy/deeply-nested input, and rebuilding against current TeaVM (0.15.0, June 2026).
- **If you need robust, arbitrary-Java compilation in-browser today, CheerpJ (Leaning Technologies) already runs the real OpenJDK javac in the browser** (its JavaFiddle playground does exactly this) and is the pragmatic fallback; but for staying on TeaVM, rebuild teavm-javac from current TeaVM, run it where you can enlarge the stack, and keep test programs within the recursion ceiling.

## Key Findings

1. **The issue is documented and open.** GitHub issue *konsoletyper/teavm-javac #3, "Bridging to JavaScript results in a stack overflow,"* was opened by BrianGenisio on Feb 27, 2018 and remains open. [GitHub](https://github.com/konsoletyper/teavm-javac/issues/3) The reported crash is `Uncaught RangeError: Maximum call stack size exceeded` inside the generated compiler code, occurring during class loading — the reproducer crashes right after loading the annotation classes (`java/lang/annotation/Retention.class`, `RetentionPolicy.class`, and `Annotation.class`).

2. **The historical teavm-javac was a JavaScript (asm.js-style) build, and it *also* overflowed.** The stack trace in issue #3 references `classes.js` with a single frame (`T5d`) repeated many times — a classic deep-recursion signature in TeaVM-generated JavaScript. [github](https://github.com/konsoletyper/teavm-javac/issues/3) This is important: switching *away* from WasmGC to the classic JS backend does **not** inherently escape the problem, because both backends ultimately run javac's recursion on the browser's JS call stack.

3. **A second user independently reproduced it and fingered annotations.** Steve Hannah (`shannah`, a TeaVM sponsor) commented on issue #3 that he hit the same overflow with more complex input and an extended stdlib, always at the same point. His verbatim conclusion: "It seems to be the annotation that trips it up. If you remove the use of annotations, it will build properly." This matches your observation that `@SuppressWarnings` and similar constructs push recursion depth over the ceiling.

4. **TeaVM has no WasmGC "stack size / recursion depth" knob.** The WasmGC Loader API (`TeaVM.wasmGC.load(src, options)`) exposes `installImports`, `stackDeobfuscator`, `memory`, `stack`, `emscriptenModules`, `nodejs`, and `noAutoImports`. [Teavm](https://teavm.org/docs/wasm-gc-backend/loader.html) The `stack` field is explicitly "Size of the C stack reserved for Emscripten interop modules, in bytes. Defaults to 2 MiB … **Ignored when no emscriptenModules are used.**" It does not control the JS/Wasm call-stack depth that javac's recursion consumes. Build-time WasmGC options (`minHeapSize`, `maxHeapSize`, `minDirectBuffersSize`, `strict`) likewise do not raise the call-stack ceiling.

5. **The one maintainer-authored reference to a browser stack-overflow bug is `maxTopLevelNames`, and it is JS-backend-only.** TeaVM's Gradle docs state: "*maxTopLevelNames: Int (JS) – how many names to generate at top-level… The reason to limit the number of top-level declarations is the bug in Chromium-based browsers that throw stack overflow error.*" [Teavm](https://teavm.org/docs/tooling/gradle.html) This confirms the maintainer knows Chromium/V8 throws stack-overflow errors on TeaVM output, but this specific option is a *code-generation* workaround for the JS backend, not a runtime recursion-depth control for the WasmGC javac.

6. **WasmGC calls run on the V8 JS stack, which is fixed and small (and smaller in Workers).** Axel Rauschmayer's benchmark ("The maximum call stack size," 2ality.com) measured Chrome/V8 at exactly **10,402 recursive calls**, noting the depth "depends on two quantities: the size of the stack and the size of the stack frame" — so heavier frames (as in javac's recursion) hit the limit sooner. OpenReplay corroborates the ballpark ("Chrome might allow around 10,000–15,000 frames, while Firefox permits roughly 50,000… Node.js typically caps around 11,000 frames by default"). Critically, OpenReplay also states: "In Node.js, you can use the --stack-size flag to increase the limit, but this only delays the crash. **Browsers don't allow stack size changes.**" That is exactly why your `--stack-size=16000` experiment changed the behavior from a fast overflow to a long hang — consistent with the root cause being JS-call-stack exhaustion by javac's recursion, not a bug in your asset wiring.

7. **The maintainer has revived and shipped the browser-javac, and calls it a success — but has not publicly documented the recursion ceiling or a fix.** In TeaVM's 0.13 release notes Alexey Andreev (konsoletyper) writes: "the (successful) attempt to create Java-to-WebAssembly compiler right in the browser … You can see the result here: https://teavm.org/playground.html." [GitHub](https://github.com/konsoletyper/teavm/releases) In Discussion #1034 (May 2025) he describes the obstacles he actually tackled — modularization and reimplementing `java.nio.file` [GitHub](https://github.com/konsoletyper/teavm/discussions/1034) — not stack depth. **No maintainer statement was found that explicitly diagnoses the crash as JS-stack consumption or offers a documented fix**; the JS-stack mechanism is a well-supported technical inference, corroborated by the stack traces and your `--stack-size` experiment, rather than a maintainer quote.

8. **Current TeaVM is 0.15.0; the current playground is WasmGC-based.** Maven Central confirms `teavm-core`, `teavm-classlib`, `teavm-jso`, and `teavm-tooling` all at version 0.15.0 with "Last Release on Jun 15, 2026." The old non-GC WebAssembly and WASI backends were *removed*; WasmGC is now the sole Wasm backend and is "on par" with the JS backend except (historically) threading, which 0.13 closed via green-thread/coroutine support. [GitHub](https://github.com/konsoletyper/teavm/releases) The playground assets you list (`compiler.wasm`, `compiler.wasm-runtime.js`) are WasmGC. [GitHub](https://github.com/konsoletyper/teavm-javac)

## Details

### Why it overflows: the mechanism
javac is a heavily recursive compiler: parsing, attribution (type-checking), and especially annotation/symbol resolution descend recursively through the AST and symbol tables. On a real JVM this is bounded by the thread stack (tunable with `-Xss`). In the browser, TeaVM-generated code — whether JavaScript or WasmGC — executes javac's method calls as real function calls on the host engine's call stack. Browsers give web content a **fixed, comparatively small** JS call stack and **do not expose an API to enlarge it**. Web Workers typically get an even smaller default stack than the main thread. So a compilation that recurses several thousand frames deep (easily reached by annotation processing or moderately nested code, given V8's ~10,400-frame ceiling for lightweight frames and fewer for heavy ones) hits V8's limit and throws the JavaScript `RangeError: Maximum call stack size exceeded` *during* `compile()`.

Your own diagnostic is strong evidence: launching Chromium with `--js-flags=--stack-size=16000` stopped the fast overflow and instead produced a long hang. That is the signature of "the recursion now fits, but the work is enormous," confirming the ceiling is the JS stack, not a logic bug or a broken asset.

Two nuances matter:
- **The RangeError is a JavaScript error, not a `WebAssembly.RuntimeError`.** In the WasmGC build, deep Wasm call chains and js-string builtin interop consume the same V8 call stack, and V8 surfaces exhaustion as the JS `RangeError`. This is expected behavior of WasmGC-on-V8, not a TeaVM defect per se.
- **This is distinct from a Java `StackOverflowError` at runtime of the *compiled* program.** Here the overflow is inside the compiler while it is compiling — case (b) in your framing (the JS-engine call-stack limit being hit by deeply recursive generated code), not case (a) (a TeaVM-runtime StackOverflowError in generated code).

### Does switching to the classic JS backend help?
Not fundamentally. Issue #3's stack trace (`classes.js`, repeated `T5d` frames) is from the **JavaScript** build of teavm-javac, and it overflowed on trivially small input. Both backends run javac's recursion on the JS stack. There is one *secondary* lever unique to the JS backend — `maxTopLevelNames` — but it targets a different Chromium bug (too many top-level declarations), not javac's compile-time recursion depth. So do **not** expect "recompile teavm-javac with the JS backend" to remove the ceiling; at best it changes the constant factor. Note also that the JS backend is no longer where TeaVM's momentum is — WasmGC is now the primary Wasm target and the JS backend remains but is being kept "on par," not surpassed.

### What TeaVM configuration actually exists
- **Runtime (WasmGC Loader `LoadOptions`):** `installImports`, `stackDeobfuscator`, `memory` (`minSize`/`maxSize`/`shared`/`external`), `stack` (Emscripten C stack only — irrelevant unless you link Emscripten modules), `emscriptenModules`, `nodejs`, `noAutoImports`. **None raises the JS call-stack depth.**
- **Build-time (Gradle/Maven):** `minHeapSize`/`maxHeapSize` (Wasm/C linear heap, MB), `minDirectBuffersSize`, `strict` (default true for WasmGC — adds null/range checks and can slightly enlarge frames; turning it off may marginally help), `optimizationLevel` (FULL recommended for Wasm), `maxTopLevelNames` (JS only). **None is a documented recursion-depth control.**
- There is **no** `minimumStackSize`/`stackSize` TeaVM property that governs the JS/Wasm call stack for generated code.

### The current playground and version landscape
- Latest TeaVM: **0.15.0**, with the class library, `teavm-core`, plugins, etc. last published **June 15, 2026**.
- The current teavm.org playground runs a **WasmGC** javac (Alexey Andreev revived the project in 2025 and reports being able to compile javac 21). He frames it as a success, and it required reimplementing much of `java.nio.file`.
- 0.13 added WasmGC coroutine/green-thread support and Java 25 support; [GitHub](https://github.com/konsoletyper/teavm/releases) the legacy non-GC Wasm and WASI backends were removed as WasmGC surpassed them. [GitHub](https://github.com/konsoletyper/teavm/releases)
- I found **no release note or issue explicitly claiming a fix to JS-call-stack exhaustion / recursion depth** in the WasmGC backend. Improvements that *reduce* per-call overhead (native `java.lang.String` backed by JS strings in 0.10+, cleanup of technical frames in WasmGC deobfuscated stack traces) may lower the constant factor slightly but do not remove the ceiling.

### Alternatives that avoid the problem
- **CheerpJ (Leaning Technologies)** is the strongest alternative: a full WebAssembly OpenJDK JVM that JIT-compiles Java bytecode to JavaScript in-browser, running the *unmodified* OpenJDK. Crucially, **CheerpJ runs the real `javac` in the browser** — its JavaFiddle playground is a client-side Java editor/compiler built exactly this way, and it handles arbitrary Java robustly. Its scale is well beyond a toy: per Leaning Technologies, CheerpJ is "used in production by teams at NASA, Siemens, UBS, and many others," and its internal stress test is running IntelliJ IDEA — "an application comprising around 400MB of JAR files." Because CheerpJ implements a proper JVM with its own execution model (interpreter + JIT) rather than transpiling each method to a host function, it does not hit the teavm-javac JS-recursion ceiling in the same way. Java-version support: Java 8 in CheerpJ 3.0; **Java 11 shipped in CheerpJ 4.0 (April 2025)**; **Java 17 shipped as a preview in CheerpJ 4.1**, with stable Java 17 scheduled for CheerpJ 5.0 before the end of 2025; and **Java 21 planned for early 2026 with CheerpJ 6.0** (which will ship four separate OpenJDK builds for Java 8, 11, 17, and 21). **License caveat:** CheerpJ is closed-source, free for personal projects and technical evaluation under the CheerpJ Community License; commercial/enterprise uses may require a paid license. This is the key trade-off versus TeaVM's Apache 2.0.
- **DoppioJVM** (a JVM in JavaScript) historically ran javac in-browser but is largely unmaintained and slow; viable only as a proof of concept.
- Running javac server-side (or in a Node/WASI context where you *can* set `--stack-size`) sidesteps the browser stack limit entirely if a pure client-side constraint is not mandatory.

## Recommendations

Ranked by likelihood of success and effort:

1. **First, confirm and buy headroom via the execution environment (low effort, high value).**
   - If you run the compile in a **Web Worker**, be aware workers often get a *smaller* default stack. Test the main thread vs. worker; if a worker is required for UI responsiveness, expect a lower ceiling there.
   - For desktop/Electron or kiosk deployments you control, launch Chromium with `--js-flags="--stack-size=NNNN"` (you already saw this removes the fast overflow). This is **not** available for arbitrary public web users, so treat it as a controlled-environment fix only.
   - In Node.js/CI contexts, run with `--stack-size` to raise the ceiling.

2. **Reduce javac recursion depth in the input (immediate, zero-infra).** Since annotations are the empirically identified trigger (per shannah in issue #3: remove annotations and it builds), advise/limit users to avoid heavy annotation usage (`@SuppressWarnings`, deeply nested generics, very deep expression nesting) in the in-browser compiler. This is a workaround, not a cure, but directly addresses the reported trigger.

3. **Rebuild teavm-javac from source against current TeaVM (0.15.0), WasmGC, with tuned build flags (moderate effort).** Use `strict = false` for the WasmGC build (removes extra null/range checks, marginally lighter frames), `optimizationLevel = FULL`, and the current classlib (native JS-string representation lowers per-call cost). Benchmark whether previously-failing programs now compile. **Threshold to change course:** if realistic target programs still overflow after rebuilding *and* running with a larger stack, treat the TeaVM path as insufficient for arbitrary Java.

4. **File/track an upstream issue with a concrete reproducer against the current WasmGC playground.** Issue #3 predates WasmGC and has no maintainer response; a fresh, minimal reproducer on 0.15 (with the exact program size/annotation pattern that overflows) is the only way to get a maintainer diagnosis or a potential recursion-flattening fix. Reference the `--stack-size` behavior as evidence, and note that the mechanism is JS-call-stack exhaustion (a RangeError, not a Wasm trap).

5. **If robustness on arbitrary Java is a hard requirement, adopt CheerpJ for the compile step (fallback).** Use CheerpJ's approach (running real OpenJDK javac in-browser) — accepting the closed-source Community License terms — and optionally keep TeaVM for *running* compiled output. Switch benchmark: if you must compile arbitrary user Java (including annotation-heavy or large files) reliably today, CheerpJ is the lower-risk choice.

## Caveats
- **No maintainer quote confirms the exact root cause.** The JS-call-stack-exhaustion diagnosis is a strong, well-corroborated inference (from the `classes.js` recursion trace, the `RangeError` type, V8's ~10,400-frame fixed stack, and your `--stack-size` experiment), but Alexey Andreev has not publicly stated it in the sources found. Issue #3 has *no* maintainer reply. Treat the mechanism as high-confidence-but-inferred.
- **Issue #3's evidence is from the old JS backend (2018), not the current WasmGC build.** The *mechanism* transfers, but do not cite issue #3 as proof of current WasmGC behavior; validate with a current reproducer.
- **Browsers do not let web content resize the JS stack.** Any `--stack-size` / `--js-flags` remedy only works where you control the browser/Node launch, not for the general public web.
- **`LoadOptions.stack` is a red herring for this bug** — it sizes the Emscripten C stack and is ignored unless you link Emscripten modules.
- **Version/dates:** TeaVM 0.15.0 with artifacts dated June 15, 2026, and CheerpJ's Java-version roadmap (11 in 4.0, 17 preview in 4.1/stable in 5.0, 21 in 6.0) are drawn from vendor/registry pages and roadmaps and may shift; verify against the live sites before committing.
- I did not have access to the TeaVM Discord, where a more explicit maintainer statement on the javac recursion ceiling may exist.