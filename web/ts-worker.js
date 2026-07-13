/*
 * Glifex TypeScript worker. Transpiles source via the vendored
 * typescript.js and runs the resulting JS off the main thread.
 *
 * Same class of hang risk as plain JavaScript (already fixed by L3's
 * earlier JS work) -- once transpiled, this is just `new Function(...)`
 * executing ordinary JS, no different from js-runtime.js's own
 * compileJavaScript(). Not tested separately here for that reason: the
 * hang mechanism itself (an unbounded JS loop) is the same one already
 * proven to hang synchronously and proven fixed by a worker for JS.
 * What's specific to this migration is the transpile step and the
 * worker plumbing around it.
 *
 * Classic worker (importScripts), not a module worker -- vendor/
 * typescript/typescript.js is loaded as a plain, non-module script
 * (window.ts on the main thread), the same pattern js-lab-worker.js
 * and wat-worker.js use for their own vendored/sibling scripts.
 *
 * caseLoop() and eq() below are copied verbatim from web/runtimes.js
 * (not imported -- that file is a large, classic, non-module IIFE
 * script, not set up to be imported, and is shared by other
 * still-main-thread loaders (Python/Ruby/PHP) this change deliberately
 * does not touch).
 *
 * Message in : { id:'run', source, cases }
 * Message out: { id:'result', results, nsPerCase }
 *            | { id:'error', error }
 */

importScripts("vendor/typescript/typescript.js");

// bigIntSafe/eq copied verbatim from runtimes.js.
const bigIntSafe = (_, v) => (typeof v === "bigint" ? Number(v) : v);
const eq = (a, b) => {
  try {
    return JSON.stringify(a, bigIntSafe) === JSON.stringify(b, bigIntSafe);
  } catch {
    return false;
  }
};

// caseLoop copied verbatim from runtimes.js.
function caseLoop(callSolve, cases, opts) {
  const skipAggregate = !!(opts && opts.skipAggregate);
  const spaceOf = opts && opts.spaceOf;   // common hook: optional native peak-workspace measurer (e.g. Python tracemalloc); attaches `space` per case
  const results = [];
  const t0 = performance.now();
  for (let i = 0; i < cases.length; i++) {
    try {
      const c0 = performance.now();
      let sink = callSolve(cases[i].input);
      const got = sink;
      let cdt = performance.now() - c0;
      let tNs;
      if (cdt < 2) {
        let k = 1;
        while (cdt < 2 && k < 1048576) { k *= 2; const s0 = performance.now(); for (let q = 0; q < k; q++) { sink = callSolve(cases[i].input); } cdt = performance.now() - s0; }
        tNs = cdt >= 1 ? (cdt * 1e6) / k : null;
      } else { tNs = cdt * 1e6; }
      if (sink === caseLoop) console.log(sink); // unreachable; keeps `sink` observably used
      const row = { i, ok: eq(got, cases[i].expected), got, expected: cases[i].expected, tNs };
      if (spaceOf) { try { const sp = spaceOf(callSolve, cases[i].input); if (sp != null && sp >= 0) row.space = sp; } catch (e) {} }
      results.push(row);
    } catch (e) {
      results.push({ i, ok: false, error: String(e.message || e), expected: cases[i].expected });
    }
  }
  let nsPerCase = cases.length ? ((performance.now() - t0) * 1e6) / cases.length : 0;
  if (!skipAggregate && nsPerCase === 0 && results.every((r) => r.ok) && cases.length) {
    let iters = 2, dt = 0;
    while (dt < 5 && iters <= 4096) {
      const s = performance.now();
      for (let k = 0; k < iters; k++) for (const c of cases) { try { callSolve(c.input); } catch {} }
      dt = performance.now() - s;
      if (dt < 5) iters *= 2;
    }
    if (dt > 0) nsPerCase = (dt * 1e6) / (iters * cases.length);
  }
  return { results, nsPerCase };
}

// compile() copied+adapted verbatim from runtimes.js's loadTypeScript().
function compile(source) {
  if (typeof ts === "undefined") {
    return { error: "vendor/typescript/typescript.js did not expose ts in this worker (importScripts global-binding assumption may not hold here -- unverified, same open question as wat-worker.js's WabtModule)" };
  }
  let js;
  try {
    js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
  } catch (e) {
    return { error: "TS transpile error: " + String(e.message || e) };
  }
  const mod = { exports: {} };
  try {
    new Function("module", "exports", js)(mod, mod.exports);
  } catch (e) {
    return { error: "Compile error: " + String(e.message || e) };
  }
  const solve = mod.exports.solve || mod.exports;
  if (typeof solve !== "function") return { error: "no solve() exported" };
  return { measure: (cases, opts) => caseLoop(solve, cases, opts) };
}

self.onmessage = (e) => {
  const d = e.data || {};
  if (d.id !== "run") return;
  try {
    const c = compile(d.source);
    if (c.error) { self.postMessage({ id: "error", error: c.error }); return; }
    const out = c.measure(d.cases);
    self.postMessage({ id: "result", ...out });
  } catch (err) {
    self.postMessage({ id: "error", error: String((err && err.message) || err) });
  }
};

self.onerror = (e) => {
  self.postMessage({ id: "error", error: "worker crashed (uncaught): " + String((e && e.message) || e) });
};
