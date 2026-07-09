// Native JavaScript runtime for the playground: runs user JS source against
// test cases in-process (no WASM, zero install, works offline). Sibling of
// runtimes.js, which owns the vendored WASM runtimes (Python/Ruby/TS/Postgres).
// Pure: no DOM, no other globals -- Node-importable for CI.

// compileJavaScript separates COMPILE from MEASURE. This matters: the
// Complexity Lab calls the same source multiple times (a warm-up pass, then
// several measured reps) to sample wall-clock timing, and re-running
// `new Function(...)` on every call was creating a BRAND NEW, cold function
// object each time -- discarding V8's JIT tiering between calls entirely
// (confirmed root cause of the wall-tier DCE/noise known issue: the warm-up
// pass was warming a function object that got thrown away, and every
// "measured" rep started from the same cold state). compileJavaScript()
// compiles ONCE; the returned measure() reuses the SAME solve reference
// across as many calls as the caller wants, so V8's optimizer can actually
// do its job across the whole warm-up+reps sequence, not just within one
// adaptive-repeat loop.
function compileJavaScript(source) {
  try {
    const module = { exports: {} };
    // eslint-disable-next-line no-new-func
    new Function("module", "exports", source)(module, module.exports);
    const solve = typeof module.exports === "function" ? module.exports : module.exports.solve;
    if (typeof solve !== "function") throw new Error("no solve() exported");
    return { measure: (cases, opts) => measureJsCases(solve, cases, opts) };
  } catch (e) {
    return { error: `Compile error: ${e.message}` };
  }
}

// opts.skipAggregate: the Lab already has its own per-case tNs data and
// never reads nsPerCase, so it skips the second (unrelated, and expensive --
// up to 65536 * cases.length additional calls) aggregate benchmark below.
// The plain Run button's speed summary + progress-history recording DO use
// nsPerCase (see app.js), so the default (non-Lab) path keeps computing it.
function measureJsCases(solve, cases, opts) {
  const skipAggregate = !!(opts && opts.skipAggregate);
  const results = [];
  for (let i = 0; i < cases.length; i++) {
    try {
      const c0 = performance.now();
      let sink = solve(cases[i].input);
      const got = sink;
      let cdt = performance.now() - c0;
      // L1-percase: per-case wall sample for the Complexity Lab. Fast cases
      // sit under the ~0.1ms clock grain, so adaptively repeat (solve is
      // pure by the corpus contract) until the window is measurable.
      //
      // The repeat loop keeps `sink` (not just `got`) so every call's return
      // value is actually used afterward -- discarding it entirely let V8
      // dead-code-eliminate most of the repeated calls on cheap, side-
      // effect-free functions, another confirmed contributor to the
      // wall-tier noise. measureJsCases itself (a stable function reference,
      // never a legitimate solve() output) is the anti-DCE sentinel: the
      // comparison can never be true, but the engine can't prove that
      // statically, so it can't optimize the store away.
      if (cdt < 2) {
        let k = 1;
        while (cdt < 2 && k < 1048576) { k *= 2; const s0 = performance.now(); for (let q = 0; q < k; q++) { sink = solve(cases[i].input); } cdt = performance.now() - s0; }
        var tNs = cdt >= 1 ? (cdt * 1e6) / k : null;
      } else { tNs = cdt * 1e6; }
      if (sink === measureJsCases) console.log(sink); // unreachable; keeps `sink` observably used
      const ok = JSON.stringify(got) === JSON.stringify(cases[i].expected);
      results.push({ i, ok, got, expected: cases[i].expected, tNs });
    } catch (e) {
      results.push({ i, ok: false, error: e.message, expected: cases[i].expected });
    }
  }
  // ...then timing. performance.now() is coarsened to ~0.1ms, and fast solutions
  // finish all cases in microseconds -- so adaptively repeat the whole case set
  // until one sample fills a measurable window, then take a median of 3.
  let nsPerCase = 0;
  if (!skipAggregate && results.every((r) => r.ok) && cases.length) {
    let iters = 1;
    const sample = () => {
      const t0 = performance.now();
      for (let k = 0; k < iters; k++) for (const c of cases) solve(c.input);
      return performance.now() - t0;
    };
    let dt = sample();
    while (dt < 5 && iters < 65536) { iters *= 2; dt = sample(); }
    const samples = [dt, sample(), sample()].sort((a, b) => a - b);
    nsPerCase = (samples[1] * 1e6) / (iters * cases.length);
  }
  return { results, nsPerCase };
}

// Kept for the non-Lab callers (the plain Run button): a single compile +
// single measure, exactly the old behavior, nsPerCase included.
function runJavaScript(source, cases) {
  const c = compileJavaScript(source);
  if (c.error) return c;
  return c.measure(cases);
}

if (typeof window !== "undefined") window.GlifexJsRuntime = { runJavaScript, compileJavaScript };
if (typeof module !== "undefined") module.exports = { runJavaScript, compileJavaScript };
