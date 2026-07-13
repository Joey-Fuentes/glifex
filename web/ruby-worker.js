/*
 * Glifex Ruby worker. Loads ruby.wasm (via the vendored
 * browser.umd.js + ruby+stdlib.wasm) and runs solve() off the main
 * thread.
 *
 * Same class of unbounded-hang risk as JavaScript/TypeScript/WAT: a
 * genuine infinite loop in a user's Ruby solve() (e.g. `while true;
 * end`) has no built-in step-count safeguard -- it's an interpreter
 * running at whatever speed it runs at, no different in kind from
 * WASM's own lack of a bound. Not independently re-verified for Ruby
 * specifically (no vendored ruby.wasm available in this sandbox to
 * test against) -- the underlying claim (an unbounded interpreter
 * loop hangs its calling thread) is the same one already confirmed
 * for WAT's raw WebAssembly execution, and Ruby's own VM is itself
 * compiled to WebAssembly, so the same absence of an instruction-count
 * ceiling applies for the same underlying reason.
 *
 * Classic worker (the default -- no `{ type: "module" }` needed):
 * unlike retro-worker.js (which needs a module worker specifically
 * because it uses `import()` to load the ES-module CPU cores), this
 * loader uses only fetch(), new Function(), and
 * WebAssembly.compileStreaming() -- none of which are ES-module-
 * specific, all standard in any Worker context. ruby+stdlib.wasm is
 * loaded via WebAssembly.compileStreaming(fetch(...)).
 * browser.umd.js is loaded via fetch()+new Function() (a deliberate,
 * explicit UMD-capture pattern the ORIGINAL main-thread loader already
 * used -- see its own comment, copied below verbatim -- specifically
 * to avoid relying on any global object at all, "no global-name
 * roulette"). That means, unlike wat-worker.js's WabtModule or
 * ts-worker.js's ts (both loaded via importScripts, relying on the
 * vendored script binding a name onto the global object), there is NO
 * analogous "does the global-exposure assumption hold in a Worker"
 * open question here: this loader was already written to sidestep
 * exactly that class of uncertainty, on the main thread, for unrelated
 * reasons (Android global-name flakiness) -- and that same explicit-
 * capture approach carries over to a Worker context unchanged,
 * verified by inspection, not by assumption.
 *
 * Message in : { id:'run', source, cases }
 * Message out: { id:'result', results, nsPerCase }
 *            | { id:'error', error }
 */

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

// vm setup copied verbatim from runtimes.js's loadRuby() -- see that
// file's own comment for the "no global-name roulette" reasoning.
// Loaded ONCE, cached, and reused across every subsequent 'run'
// message (the same lazy-load-once-then-cache pattern
// retro-worker.js's loadForCfg() uses).
let vmPromise = null;
async function getVm() {
  if (vmPromise) return vmPromise;
  vmPromise = (async () => {
    const src = await (await fetch("vendor/ruby/browser.umd.js", { cache: "no-cache" })).text();
    const exportsObj = {};
    new Function("exports", "module", src)(exportsObj, { exports: exportsObj });
    const { DefaultRubyVM } = exportsObj;
    if (!DefaultRubyVM) throw new Error("ruby umd evaluated but exported no DefaultRubyVM");
    const res = await fetch("vendor/ruby/ruby+stdlib.wasm");
    const mod = await WebAssembly.compileStreaming(res);
    const { vm } = await DefaultRubyVM(mod);
    return vm;
  })();
  return vmPromise;
}

// compile() copied+adapted verbatim from runtimes.js's loadRuby().
async function compile(source) {
  const vm = await getVm();
  try {
    vm.eval(source);
  } catch (e) {
    return { error: "Compile error: " + String(e.message || e) };
  }
  const callSolve = (input) => {
    const r = vm.eval(`require "json"; JSON.generate(solve(JSON.parse(%q(${JSON.stringify(input)}))))`);
    return JSON.parse(r.toString());
  };
  // L4 space. Ruby has no built-in peak-workspace counter, so heap is GC allocation
  // VOLUME during solve (GC.stat total_allocated_bytes delta) -- an exact count but
  // an upper bound on peak, hence flagged approximate. Stack is EXACT: max recursion
  // depth via set_trace_func. Measured in separate runs (the tracer allocates, which
  // would inflate the heap count). Helpers defined once; called per case by the hook.
  let rbSpaceOk = false;
  try {
    vm.eval([
      'require "json"',
      'def __gx_heap(a)',
      '  b = (GC.stat[:total_allocated_objects] || 0)',
      '  solve(a)',
      '  (GC.stat[:total_allocated_objects] || 0) - b',
      'end',
      'def __gx_stack(a)',
      '  d = 0; m = 0',
      '  set_trace_func(proc { |ev, *| if ev == "call"; d += 1; m = d if d > m; elsif ev == "return"; d -= 1 if d > 0; end })',
      '  begin; solve(a); ensure; set_trace_func(nil); end',
      '  m',
      'end',
    ].join("\n"));
    rbSpaceOk = true;
  } catch (e) { rbSpaceOk = false; }
  const spaceOf = rbSpaceOk
    ? (_cs, input) => {
        try {
          const arg = `JSON.parse(%q(${JSON.stringify(input)}))`;
          const h = Number(vm.eval(`__gx_heap(${arg})`).toString());
          const s = Number(vm.eval(`__gx_stack(${arg})`).toString());
          return { heap: Number.isFinite(h) ? h : null, stack: Number.isFinite(s) ? s : null };
        } catch (e) { return null; }
      }
    : null;
  return { measure: (cases, opts) => caseLoop(callSolve, cases, spaceOf ? { ...(opts || {}), spaceOf } : opts), spaceApprox: true };
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
