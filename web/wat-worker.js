/*
 * Glifex WAT (WebAssembly Text) worker. Compiles source via the
 * vendored wabt.js and runs the resulting module off the main thread.
 *
 * Why this matters more than it might first look like: unlike the
 * retro CPU emulators (which have a hard maxSteps instruction-count
 * ceiling built into their step loop), raw WebAssembly execution has
 * NO built-in bound at all -- it's native, compiled code running at
 * full speed. Directly confirmed (a hand-crafted minimal WASM module,
 * `(loop br 0)`, no wabt needed to prove this): calling an exported
 * function containing a genuine infinite loop hangs the calling
 * thread indefinitely, with no safeguard whatsoever. This is the same
 * class of unbounded-hang risk L3 originally fixed for JavaScript --
 * not a defense-in-depth measure the way the retro migration mostly
 * was (retro's maxSteps already made most hang scenarios fast and
 * bounded even on the main thread).
 *
 * Classic worker (importScripts), not a module worker -- vendor/wat/
 * index.js is loaded as a plain, non-module script (window.WabtModule
 * on the main thread), the same pattern js-lab-worker.js and
 * c-worker.js already use for their own vendored/sibling scripts.
 *
 * caseLoop() and eq() below are copied verbatim from web/runtimes.js
 * (not imported -- that file is a large, classic, non-module IIFE
 * script, not set up to be imported, and is shared by other
 * still-main-thread loaders (Python/Ruby/TypeScript) this change
 * deliberately does not touch). Same reasoning as retro-worker.js's
 * own copied-not-imported eq().
 *
 * Message in : { id:'run', source, cases }
 * Message out: { id:'result', results, nsPerCase }
 *            | { id:'error', error }
 */

importScripts("vendor/wat/index.js");

// bigIntSafe/eq copied verbatim from runtimes.js.
const bigIntSafe = (_, v) => (typeof v === "bigint" ? Number(v) : v);
const eq = (a, b) => {
  try {
    return JSON.stringify(a, bigIntSafe) === JSON.stringify(b, bigIntSafe);
  } catch {
    return false;
  }
};

// caseLoop copied verbatim from runtimes.js (see that file's own
// comments for the anti-DCE sentinel and adaptive-repeat reasoning --
// not re-explained here to avoid the two copies drifting out of sync
// in their prose while their logic must stay byte-identical).
function caseLoop(callSolve, cases, opts) {
  const skipAggregate = !!(opts && opts.skipAggregate);
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
      results.push({ i, ok: eq(got, cases[i].expected), got, expected: cases[i].expected, tNs });
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

let wabt = null;
async function getWabt() {
  if (wabt) return wabt;
  if (typeof WabtModule !== "function") {
    throw new Error("vendor/wat/index.js did not expose WabtModule in this worker (importScripts global-binding assumption may not hold here -- unverified, no vendored wabt.js available to test against directly)");
  }
  wabt = await WabtModule();
  return wabt;
}

// compile() copied+adapted verbatim from runtimes.js's loadWat(),
// same logic, same two calling conventions (pure scalar vs
// memory-marshaled array args) -- see that file's own comments for
// the fuller explanation of why each exists.
async function compile(source) {
  const w = await getWabt();
  let binary;
  try {
    const mod = w.parseWat("solve.wat", source);
    mod.resolveNames();
    mod.validate();
    binary = mod.toBinary({}).buffer;
    mod.destroy();
  } catch (e) {
    return { error: "WAT assembly error: " + String(e.message || e) };
  }
  let solve, instance;
  try {
    instance = new WebAssembly.Instance(new WebAssembly.Module(binary), {});
    solve = instance.exports.solve;
  } catch (e) {
    return { error: "WASM instantiate error: " + String(e.message || e) };
  }
  if (typeof solve !== "function") return { error: 'no "solve" export (numbers in, number out)' };
  const memory = instance.exports.memory;
  const callSolve = (input) => {
    const values = Object.values(input);
    let args = values;
    if (memory) {
      let offset = 0, usedMemory = false;
      const marshaled = [];
      for (const v of values) {
        if (Array.isArray(v)) {
          usedMemory = true;
          const view = new Int32Array(memory.buffer, offset, v.length);
          view.set(v);
          marshaled.push(offset, v.length);
          offset += v.length * 4;
        } else {
          marshaled.push(v);
        }
      }
      if (usedMemory) args = marshaled;
    }
    return solve(...args);
  };
  return { measure: (cases, opts) => caseLoop(callSolve, cases, opts) };
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
