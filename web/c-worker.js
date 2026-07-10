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
self.onmessage = async (e) => {
  const d = e.data || {};
  if (d.id !== "run") return;
  let out = "";
  try {
    const { init, Wasmer, Directory } = await import("./vendor/c/index.mjs");
    await init();   // fresh SDK init every call -- see file header
    const webc = new Uint8Array(await (await fetch("vendor/c/clang.webc")).arrayBuffer());
    const clang = await Wasmer.fromFile(webc);

    const L = d.lang || {};
    const sup = L.support || {};
    // One Directory mounted at "/": test_cases.json at the root and sources
    // under /c, run with cwd /c so the harness's "../test_cases.json"
    // resolves to /test_cases.json whether or not cwd is honored.
    const dir = new Directory();
    await dir.createDir("/c");
    await dir.writeFile("/test_cases.json", JSON.stringify(d.cases));
    await dir.writeFile("/c/practice.c", d.source || "");
    await dir.writeFile("/c/clean.c", L.clean || "");
    await dir.writeFile("/c/optimized.c", L.optimized || "");
    await dir.writeFile("/c/harness.c", sup["harness.c"] || "");
    await dir.writeFile("/c/json.h", sup["json.h"] || "");
    await dir.writeFile("/c/solution.h", sup["solution.h"] || "");

    const t0 = performance.now();
    const MP = "/project";   // named mount (root-mount is not honored)
    const comp = await clang.entrypoint.run({
      args: ["-O2", "-std=c11", MP + "/c/practice.c", MP + "/c/clean.c", MP + "/c/optimized.c",
             MP + "/c/harness.c", "-o", MP + "/c/out.wasm"],
      mount: { [MP]: dir },
    });
    const cres = await comp.wait();
    if (!cres.ok) {
      self.postMessage({ id: "error", error: "compile error", output: String(cres.stderr || "").trim().slice(0, 800) });
      return;
    }

    const wasm = await dir.readFile("/c/out.wasm");
    const prog = await Wasmer.fromFile(wasm);
    const rres = await (await prog.entrypoint.run({
      args: ["practice", "--metrics"], mount: { [MP]: dir }, cwd: MP + "/c",   // L1-c-args
    })).wait();
    const dt = performance.now() - t0;

    out = String(rres.stdout || "");
    self.postMessage({ id: "result", output: out, dt });
  } catch (err) {
    self.postMessage({ id: "error", error: String((err && err.stack) || err), output: out });
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
  self.postMessage({ id: "error", error: "worker crashed (uncaught): " + String((e && e.message) || e), output: "" });
};
