// Native JavaScript runtime for the playground: runs user JS source against
// test cases in-process (no WASM, zero install, works offline). Sibling of
// runtimes.js, which owns the vendored WASM runtimes (Python/Ruby/TS/Postgres).
// Pure: no DOM, no other globals — Node-importable for CI.

function runJavaScript(source, cases) {
  let solve;
  try {
    const module = { exports: {} };
    // eslint-disable-next-line no-new-func
    new Function("module", "exports", source)(module, module.exports);
    solve = typeof module.exports === "function" ? module.exports : module.exports.solve;
    if (typeof solve !== "function") throw new Error("no solve() exported");
  } catch (e) {
    return { error: `Compile error: ${e.message}` };
  }
  // Correctness pass (recorded once)…
  const results = [];
  for (let i = 0; i < cases.length; i++) {
    try {
      const got = solve(cases[i].input);
      const ok = JSON.stringify(got) === JSON.stringify(cases[i].expected);
      results.push({ i, ok, got, expected: cases[i].expected });
    } catch (e) {
      results.push({ i, ok: false, error: e.message, expected: cases[i].expected });
    }
  }
  // …then timing. performance.now() is coarsened to ~0.1ms, and fast solutions
  // finish all cases in microseconds — so adaptively repeat the whole case set
  // until one sample fills a measurable window, then take a median of 3.
  let nsPerCase = 0;
  if (results.every((r) => r.ok) && cases.length) {
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

if (typeof window !== "undefined") window.GlifexJsRuntime = { runJavaScript };
if (typeof module !== "undefined") module.exports = { runJavaScript };
