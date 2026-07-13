const GX_PRELUDE = "#ifndef _POSIX_C_SOURCE\n#define _POSIX_C_SOURCE 200809L\n#endif\n/* Glifex L4 C space tracker -- clang -include'd into every TU in the WASM build\n   ONLY (the native gcc reference build never sees this). Interposes the allocator\n   across all translation units so harness.c can measure a solve's peak concurrent\n   heap. Counters are DEFINED once, in harness.c. All headers json.h/solution.h need\n   are pulled in here BEFORE the macros, so no later system include is macro-mangled. */\n#include <ctype.h>\n#include <math.h>\n#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n#include <time.h>\nextern long __gx_live, __gx_peak;\nstatic inline void *__gx_malloc(size_t n){ unsigned char *p=(unsigned char*)malloc(n+16); if(!p)return 0; *(size_t*)p=n; __gx_live+=(long)n; if(__gx_live>__gx_peak)__gx_peak=__gx_live; return p+16; }\nstatic inline void __gx_free(void *q){ if(!q)return; unsigned char *p=(unsigned char*)q-16; __gx_live-=(long)*(size_t*)p; free(p); }\nstatic inline void *__gx_calloc(size_t a,size_t b){ size_t n=a*b; void *q=__gx_malloc(n); if(q) memset(q,0,n); return q; }\nstatic inline void *__gx_realloc(void *q,size_t n){ if(!q)return __gx_malloc(n); unsigned char *p=(unsigned char*)q-16; size_t old=*(size_t*)p; void *r=__gx_malloc(n); if(r) memcpy(r,q,old<n?old:n); __gx_free(q); return r; }\n#define malloc __gx_malloc\n#define calloc __gx_calloc\n#define realloc __gx_realloc\n#define free __gx_free\n";
/*
 * Glifex C runtime driver -- wraps @wasmer/sdk (WASIX clang, compiled to
 * WASM) to compile + run our harness in a worker.
 *
 * UNLIKE cpp-worker.js's persistent-api pattern (one Worker, reused
 * across every call, with its compiled toolchain cached across calls),
 * web/runtimes.js spawns a genuinely FRESH Worker running THIS script
 * for every single C run, and terminates it afterward. Confirmed
 * necessary, not just theorized: an earlier fix tried re-instantiating
 * just the compiled clang module fresh per call, WITHIN the same
 * long-lived worker/session -- confirmed insufficient (still hung on a
 * second, fully sequential run; browser console showed an uncaught
 * "RuntimeError: unreachable" inside wasmer_js_bg.wasm, escaping as a
 * silent hang rather than a catchable rejection, since it happened
 * inside that shared context rather than propagating a rejected
 * Promise). An independent developer building a similar in-browser
 * clang/LLVM tool on this exact SDK documented the identical "generic
 * Unreachable error after launching more than a couple programs"
 * symptom, and their confirmed fix required a genuinely fresh execution
 * context -- a new Worker with the SDK completely re-imported and
 * re-initialized -- for every single run, not just fresh module
 * instances within a shared one.
 * (https://lights0123.com/blog/2025/01/07/hip-script/)
 *
 * That fix landed and materially helped: the cascading "everything
 * breaks until hard refresh" failure is gone -- other runs/languages
 * keep working after a crash, and re-running the SAME C attempt often
 * succeeds. But it did NOT eliminate the underlying flakiness itself:
 * intermittent failures still occur (an uncaught "unreachable" trap, or
 * unrelated-looking clang/lld linker failures), now correctly isolated
 * to a single run instead of poisoning everything after it. Observed
 * correlation, not yet root-caused: not seen on 001 (Anagram Detection,
 * a fixed-size character-count scan); seen intermittently on 002 (Two
 * Sum, array/hash-map-based -- materially more memory and data
 * movement). See docs/ROADMAP.md's Bx-3 known-issue note.
 *
 * Separately: every C source file (practice.c, clean.c, optimized.c)
 * now defines a function named "solve" -- the same convention every
 * OTHER language in this Lab already uses (Python/Rust/WAT: literally
 * always "solve"; Java/C#: a class per variant, but always a "solve"/
 * "Solve" method via a shared interface). C used to be the outlier,
 * requiring differently-named functions per variant (practice/clean/
 * optimized) purely because C has neither classes nor namespaces to
 * lean on the way those other languages do -- which meant copying a
 * revealed solution into the editor to experiment with it (offered
 * directly by the reference panel's own "copy" button) reliably failed
 * with a cryptic "duplicate symbol" linker error, since the copied
 * function's name collided with the separately-compiled reference file
 * defining the exact same name. clean.c and optimized.c now carry a
 * leading `#define solve __glifex_ref_<variant>` line that renames
 * their OWN symbol away from the bare name at compile time -- baked
 * into the committed file itself (not injected here at runtime),
 * because the CLI's test_cmd (languages/c.toml) is a plain `gcc ...
 * *.c` glob with no pre-processing stage, so the rename has to work
 * without any JS-side help for that path too. web/app.js's
 * showReference() strips that leading line before display, so what the
 * reference panel shows -- and what its copy button copies -- is clean,
 * plain "solve"-named code that can be pasted into the practice editor
 * and just work. Validated for real: reproduced the original collision
 * with a native compiler, applied this exact fix, confirmed the
 * collision is gone, and confirmed the full pipeline via `glifex test`/
 * `glifex verify` (both problems, all three variants, including
 * --metrics) -- not just structural review.
 *
 * The `stage` breadcrumb below exists specifically to test the
 * remaining, separate Wasmer-flakiness correlation further: every
 * console line and every error report includes both the current stage
 * AND the source/case sizes, so a future occurrence shows not just "it
 * crashed" but "it crashed while compiling, with N bytes of source and
 * M test cases" -- letting a pattern emerge from real occurrences
 * instead of guessing from one data point. Wasmer's own
 * initializeLogger("debug") (see
 * https://docs.wasmer.io/sdk/wasmer-js/tutorials/run/) is available as
 * a deeper diagnostic layer if this needs another pass -- deliberately
 * not enabled by default here since it's considerably more verbose;
 * left as a documented option rather than always-on noise.
 *
 * Message in : { id:'run', source, cases, lang }
 * Message out: { id:'result', output, dt } | { id:'error', error, output }
 *
 * dt (ms) is measured HERE, bracketing only the compile+run region --
 * matches the pre-worker implementation exactly. Deliberately excludes
 * this worker's own spawn/SDK-init/webc-fetch overhead, which would
 * otherwise leak into every timing and badly distort the Complexity
 * Lab's growth-rate measurements for C (nsPerCase = dt * 1e6 /
 * cases.length -- any roughly-constant per-call overhead in dt would
 * disproportionately inflate small case counts).
 */
let stage = "not started";   // worker-global (not local to onmessage) so onerror can report it too
let out = "";   // worker-global too, same reasoning -- see self.onerror below

// Recognizes one specific, common, and previously-cryptic failure: the
// harness always compiles practice.c + clean.c + optimized.c together as
// one program, and each is required to define a top-level function named
// after its own file (practice/clean/optimized -- see harness.c's forward
// declarations). If the practice editor's OWN code also defines a function
// with one of those names -- the natural result of copying a revealed
// solution in to experiment with it via the reference panel's "copy"
// button, which copies verbatim, name included -- wasm-ld correctly
// refuses with "duplicate symbol", but that message gives no hint of why
// or what to do about it. Confirmed via a real repro: the default
// practice.c stub (named `practice`) compiles fine; the same code renamed
// to `clean` (matching a copied reference solution) reliably fails this
// exact way.
function friendlyCompileError(stderr) {
  const s = String(stderr || "");
  // Missing "solve": the harness's contract (see solution.h) is that
  // your code defines exactly one function named "solve" -- the same
  // convention every language in this Lab uses (Python, Rust, WAT, and
  // Java/C# via a shared interface method all do the same). Regex
  // covers both GNU ld's `undefined reference to \`solve'` (confirmed
  // via a real native compile) and wasm-ld's "undefined symbol: X"
  // convention (confirmed from this project's own duplicate-symbol
  // wording, which follows that same style) -- untested against the
  // real WASIX wasm-ld directly (no vendored toolchain in this sandbox),
  // so this second form is inferred from a consistent naming pattern,
  // not independently confirmed the way the GNU ld form is.
  if (/undefined (reference to [`']solve[`']|symbol:\s*solve\b)/.test(s)) {
    return 'Your code needs a function named "solve" -- the harness looks for exactly that name, matching every language in this Lab. Check that it\'s defined and spelled correctly.';
  }
  // Duplicate "solve": should no longer be reachable via the normal
  // "copied a revealed solution in" path this whole fix targets --
  // clean.c/optimized.c now rename their OWN "solve" away at compile
  // time (see the #define at the top of each), so only your code's
  // "solve" should remain unrenamed in the final link. Kept as a
  // fallback in case your own code defines "solve" more than once for
  // some unrelated reason.
  if (/duplicate symbol:\s*solve\b/.test(s)) {
    return 'Your code defines "solve" more than once. Each variant should have exactly one solve() function.';
  }
  return "compile error";
}

self.onmessage = async (e) => {
  const d = e.data || {};
  if (d.id !== "run") return;
  const L = d.lang || {};
  const sup = L.support || {};
  const srcSize = (d.source || "").length;
  const totalSrcSize = srcSize + (L.clean || "").length + (L.optimized || "").length + (sup["harness.c"] || "").length;
  const caseCount = (d.cases || []).length;
  const ctx = `practice.c=${srcSize}b all-sources=${totalSrcSize}b cases=${caseCount}`;
  console.log(`[glifex-c-worker] starting -- ${ctx}`);

  out = "";   // reset for this call (module-level so self.onerror can read it too)
  try {
    stage = "importing SDK";
    const { init, Wasmer, Directory } = await import("./vendor/c/index.mjs");
    stage = "init()";
    await init();   // fresh SDK init every call -- see file header
    stage = "fetching clang.webc";
    const webc = new Uint8Array(await (await fetch("vendor/c/clang.webc")).arrayBuffer());
    stage = "instantiating clang";
    const clang = await Wasmer.fromFile(webc);

    // One Directory mounted at "/": test_cases.json at the root and sources
    // under /c, run with cwd /c so the harness's "../test_cases.json"
    // resolves to /test_cases.json whether or not cwd is honored.
    stage = "writing files";
    const dir = new Directory();
    await dir.createDir("/c");
    await dir.writeFile("/test_cases.json", JSON.stringify(d.cases));
    await dir.writeFile("/c/practice.c", d.source || "");
    await dir.writeFile("/c/clean.c", L.clean || "");
    await dir.writeFile("/c/optimized.c", L.optimized || "");
    await dir.writeFile("/c/harness.c", sup["harness.c"] || "");
    await dir.writeFile("/c/gx_prelude.h", GX_PRELUDE);   // L4-c-space
    await dir.writeFile("/c/json.h", sup["json.h"] || "");
    await dir.writeFile("/c/solution.h", sup["solution.h"] || "");

    const t0 = performance.now();
    const MP = "/project";   // named mount (root-mount is not honored)
    stage = "compiling";
    console.log(`[glifex-c-worker] ${stage} -- ${ctx}`);
    const comp = await clang.entrypoint.run({
      args: ["-O2", "-std=c11", "-include", MP + "/c/gx_prelude.h", MP + "/c/practice.c", MP + "/c/clean.c", MP + "/c/optimized.c",
             MP + "/c/harness.c", "-o", MP + "/c/out.wasm"],
      mount: { [MP]: dir },
    });
    const cres = await comp.wait();
    if (!cres.ok) {
      const friendly = friendlyCompileError(cres.stderr);
      console.warn(`[glifex-c-worker] compile FAILED -- ${ctx} -- stderr: ${String(cres.stderr || "").trim().slice(0, 300)}`);
      self.postMessage({ id: "error", error: friendly, output: String(cres.stderr || "").trim().slice(0, 800) });
      return;
    }

    stage = "compiled ok, reading out.wasm";
    const wasm = await dir.readFile("/c/out.wasm");
    stage = "instantiating compiled program";
    const prog = await Wasmer.fromFile(wasm);
    stage = "executing";
    console.log(`[glifex-c-worker] ${stage} -- ${ctx} out.wasm=${wasm.byteLength}b`);
    const runInst = await prog.entrypoint.run({
      args: ["practice", "--metrics"], mount: { [MP]: dir }, cwd: MP + "/c",   // L1-c-args
    });
    // Pipe stdout into `out` as it's produced, not only once .wait()
    // resolves -- confirmed a real, supported pattern (not just
    // theorized): Wasmer's own official examples pipe Instance.stdout
    // this exact way (e.g. their wasmer.sh in-browser terminal,
    // github.com/wasmerio/wasmer-js/.../examples/wasmer.sh/index.ts).
    // If the trap is severe enough to escape even this try/catch
    // (landing in self.onerror below instead -- see its own comment),
    // `out` still has whatever was written before the crash, instead
    // of self.onerror's previous hardcoded empty output. .catch(()=>{})
    // here: if the pipe itself errors for some unrelated reason, `out`
    // still keeps whatever arrived before that -- a logging path
    // failing shouldn't crash the actual run.
    const decoder = new TextDecoder();
    const pipeDone = runInst.stdout.pipeTo(new WritableStream({
      write(chunk) { out += decoder.decode(chunk, { stream: true }); },
    })).catch(() => {});
    await runInst.wait();
    await pipeDone;   // make sure every already-produced chunk actually reached `out` before we read it
    const dt = performance.now() - t0;
    stage = "done";
    console.log(`[glifex-c-worker] ${stage} -- ${ctx} dt=${Math.round(dt)}ms`);

    self.postMessage({ id: "result", output: out, dt });
  } catch (err) {
    console.error(`[glifex-c-worker] CRASHED at stage "${stage}" -- ${ctx} -- ${(err && err.stack) || err}`);
    self.postMessage({ id: "error", error: `[at "${stage}"] ` + String((err && err.stack) || err), output: out });
  }
};

self.onerror = (e) => {
  // Defense in depth: an uncaught WASM trap (e.g. the "unreachable" this
  // whole worker-per-run design exists to work around, should it
  // somehow still occur for some other reason) fires here rather than
  // propagating as a rejected Promise -- without this handler, the
  // caller's postMessage-based Promise would simply never settle,
  // exactly the original "hangs silently" symptom this fix targets.
  // Reporting an error here still isn't as good as it never happening,
  // but it turns a silent hang into a visible, catchable failure.
  // `stage` (module-global, set by onmessage above) is included so an
  // occurrence caught HERE -- meaning it escaped even the try/catch
  // above, i.e. likely came from Wasmer's own internal async/worker
  // machinery rather than directly from the awaited call -- still says
  // roughly where in the sequence it happened. `out` (also module-
  // global) is included too: it's populated incrementally via a
  // stdout pipe started before .wait() is ever called (see onmessage
  // above), so even a crash severe enough to land HERE still carries
  // whatever the harness managed to print -- e.g. its last
  // "[CASE-BEGIN] case N" breadcrumb -- instead of nothing at all.
  console.error(`[glifex-c-worker] UNCAUGHT at stage "${stage}": ${(e && e.message) || e}`);
  self.postMessage({ id: "error", error: `worker crashed (uncaught) at stage "${stage}": ` + String((e && e.message) || e), output: out });
};
