/*
 * Glifex Python worker. Loads Pyodide (via the vendored pyodide.js)
 * and runs solve() off the main thread.
 *
 * Same class of unbounded-hang risk as the other L3 migrations: a
 * genuine infinite loop in a user's Python solve() (e.g. `while
 * True: pass`) has no built-in step-count safeguard -- CPython
 * (compiled to WASM by Pyodide) is a real interpreter running at
 * whatever speed it runs at, no different in kind from PHP's or
 * Ruby's own WASM-compiled interpreters, both already confirmed to
 * hang unboundedly without worker isolation.
 *
 * Classic worker (importScripts), matching how vendor/python/
 * pyodide.js is already loaded on the main thread (a plain script,
 * not an ES module). Unlike wat-worker.js's WabtModule or
 * ts-worker.js's ts, Pyodide OFFICIALLY supports running inside a Web
 * Worker (a well-documented, widely-used pattern, unlike php-wasm's
 * webreflection library which was found NOT to have been written with
 * Workers in mind) -- lower risk here than that open question was,
 * though still worth confirming empirically rather than assumed.
 *
 * Message in : { id:'run', source, cases }
 * Message out: { id:'result', results, nsPerCase }
 *            | { id:'error', error }
 */

importScripts("vendor/python/pyodide.js");

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
      if (spaceOf) { try { const sp = spaceOf(callSolve, cases[i].input); if (sp != null) { if (typeof sp === "number") { if (sp >= 0) row.space = sp; } else { if (sp.heap != null && sp.heap >= 0) row.space = sp.heap; if (sp.stack != null && sp.stack >= 0) row.spaceStack = sp.stack; } } } catch (e) {} }
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

let pyPromise = null;
async function getPy() {
  if (pyPromise) return pyPromise;
  if (typeof loadPyodide !== "function") {
    throw new Error("vendor/python/pyodide.js did not expose loadPyodide in this worker (importScripts global-binding assumption may not hold here -- unverified, same open question as wat-worker.js's WabtModule, though Pyodide officially supports Workers so this is lower risk)");
  }
  pyPromise = loadPyodide({ indexURL: "vendor/python/" });
  return pyPromise;
}

// compile() copied+adapted verbatim from runtimes.js's loadPython().
async function compile(source) {
  const py = await getPy();
  try {
    py.runPython(source);
  } catch (e) {
    return { error: "Compile error: " + String(e.message || e) };
  }
  const solve = py.globals.get("solve");
  if (typeof solve !== "function") return { error: "no solve() defined" };
  const callSolve = (input) => {
    const r = solve(py.toPy(input));
    const v = r && typeof r.toJs === "function" ? r.toJs({ create_proxies: false }) : r;
    return v instanceof Map ? Object.fromEntries(v) : v;
  };
  // L4 (EXACT space): peak workspace via tracemalloc -- run solve under the
  // tracer and read the high-water. Exact, synchronous, no proxy, no resolution
  // floor, and it measures the user's ACTUAL code (not a reference). Defined
  // once here; the common caseLoop spaceOf hook calls it per case and attaches
  // the peak as `space`, which the existing (language-agnostic) space plumbing
  // renders exactly like the retro tracks.
  let measurePeak = null, measureStack = null;
  try {
    py.runPython(
      "import tracemalloc as __gx_tm\n" +
      "import sys as __gx_sys\n" +
      "def __gx_peak(arg):\n" +
      "    __gx_tm.start()\n" +
      "    try:\n" +
      "        solve(arg)\n" +
      "    finally:\n" +
      "        _c, _p = __gx_tm.get_traced_memory()\n" +
      "        __gx_tm.stop()\n" +
      "    return _p\n" +
      // Stack = max recursion DEPTH during solve, via a settrace counter (exact
      // class: O(1) iterative, O(n) linear recursion, O(log n) balanced). Measured
      // in a SEPARATE run from tracemalloc -- settrace itself allocates, so
      // combining them would pollute the heap number.
      "def __gx_stack(arg):\n" +
      "    _d = [0]; _m = [0]\n" +
      "    def _tr(frame, event, a):\n" +
      "        if event == 'call':\n" +
      "            _d[0] += 1\n" +
      "            if _d[0] > _m[0]: _m[0] = _d[0]\n" +
      "        elif event == 'return':\n" +
      "            if _d[0] > 0: _d[0] -= 1\n" +
      "        return _tr\n" +
      "    __gx_sys.settrace(_tr)\n" +
      "    try:\n" +
      "        solve(arg)\n" +
      "    finally:\n" +
      "        __gx_sys.settrace(None)\n" +
      "    return _m[0]\n"
    );
    measurePeak = py.globals.get("__gx_peak");
    measureStack = py.globals.get("__gx_stack");
  } catch (e) { measurePeak = null; measureStack = null; }
  const num = (r) => (typeof r === "number" ? r : Number(r));
  const spaceOf = measurePeak
    ? (_cs, input) => {
        const pyIn = py.toPy(input);
        const heap = num(measurePeak(pyIn));
        let stack = null;
        if (measureStack) { try { stack = num(measureStack(py.toPy(input))); } catch (e) { stack = null; } }
        return { heap, stack };
      }
    : null;
  return { measure: (cases, opts) => caseLoop(callSolve, cases, spaceOf ? { ...(opts || {}), spaceOf } : opts) };
}

self.onmessage = async (e) => {
  const d = e.data || {};
  if (d.id !== "run") return;
  try {
    const c = await compile(d.source);
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
