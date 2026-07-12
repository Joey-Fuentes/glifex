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
    return { measure: (cases, opts) => measureJsCases(solve, cases, opts), measureSpace: (cases, opts) => measureJsSpace(solve, cases, opts) };
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
        // Min-of-5 at the now-stable k, not median: scheduling noise (GC
        // pauses, OS preemption, or -- confirmed the hard way, via a real
        // e2e CI failure -- contention from OTHER browser processes
        // competing for the same limited CPU under Playwright's default
        // parallelism) is ONE-SIDED -- it can only make a measurement
        // SLOWER than the true cost, never faster. That's exactly the
        // same reasoning Python's timeit, and most rigorous
        // microbenchmarking tooling, use: as long as at least ONE of N
        // repeated trials is "clean" (uninterrupted), the MINIMUM
        // observed time converges to the true value. A median or mean
        // gets dragged upward by ANY interference in ANY sample -- and
        // with 2+ bad samples out of 3 (confirmed happening under real,
        // multi-process CI contention), even the median stays corrupted.
        // Each pass is ~2ms by construction, so 4 extra passes cost
        // roughly 8ms per case -- still a small, bounded addition.
        const passAtK = () => { const s0 = performance.now(); for (let q = 0; q < k; q++) { sink = solve(cases[i].input); } return performance.now() - s0; };
        let best = Math.min(cdt, passAtK(), passAtK(), passAtK(), passAtK());
        // If even the best of 5 trials is still below the target window,
        // k genuinely isn't big enough on a fair sample -- the search's
        // own single-sample exit could itself have been inflated just
        // enough to cross 2ms early, at a smaller k than a clean
        // measurement would have needed. Keep doubling and re-measure
        // fresh (min-of-5 again) at each new k rather than trust a value
        // the search wouldn't have accepted going in.
        while (best < 2 && k < 1048576) {
          k *= 2;
          best = Math.min(passAtK(), passAtK(), passAtK(), passAtK(), passAtK());
        }
        cdt = best;
        var tNs = cdt >= 1 ? (cdt * 1e6) / k : null;
      } else {
        // Same one-sided-noise reasoning as above, lighter touch: this
        // branch is already the slowest case (>= 2ms on a SINGLE call,
        // no repeat needed) -- multiplying that cost by 5 would work
        // against L3's whole point of making larger n affordable to
        // test. One extra pass (min-of-2, not min-of-5) still catches
        // the single most likely failure mode -- the ONE existing
        // sample being the contaminated one -- without materially
        // increasing cost for what's already the most expensive
        // measurement in the ladder.
        const s1 = performance.now(); sink = solve(cases[i].input); const cdt2 = performance.now() - s1;
        tNs = Math.min(cdt, cdt2) * 1e6;
      }
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

// L4 (JS/TS space) -- a BEST-EFFORT, explicitly-approximate per-size heap
// proxy via performance.measureUserAgentSpecificMemory(). This is NOT the
// exact per-case workspace the retro tracks report; it is fundamentally
// coarser and must be presented as such (the UI carries a disclaimer):
//   - whole-agent: it measures the ENTIRE worker heap, not this solve()
//     call, so we report a before/after DELTA rather than an absolute;
//   - GC-dependent: the number depends on when garbage collection last ran;
//   - quantized/coarse: bucketed at a granularity meant for catching MB-
//     scale leaks, so small allocations sit under its noise floor;
//   - Chromium-only, cross-origin-isolated-only, and unavailable in headless
//     Chrome -- so it returns null wherever it can't run and NEVER throws,
//     which makes the whole feature degrade to "no space tab" cleanly.
// Per size: warm up once (so lazy/JIT allocation isn't attributed here),
// measure the heap immediately before and after ONE solve() with its result
// retained, and report the clamped delta. Deltas are measured fresh per size
// and the result released between sizes, so they don't accumulate. See
// docs/ROADMAP.md (L4) for the path toward a cleaner metric.
// Shared: one churn-forced memory sample. measureUserAgentSpecificMemory only
// resolves at the next GC (Chrome defers it up to ~60s); we PROVOKE that GC by
// churning short-lived garbage in small yielding bursts while the call is
// pending, collapsing it from ~60s to well under a second (verified live). The
// churn is released each iteration so it isn't counted -- only whatever the
// caller holds live is. Returns bytes, or null if the API is unavailable/slow.
async function churnForcedSample() {
  if (typeof performance === "undefined" || typeof performance.measureUserAgentSpecificMemory !== "function") return null;
  let t;
  try {
    const pending = performance.measureUserAgentSpecificMemory().then((x) => x, () => null);
    for (let round = 0; round < 6; round++) {
      for (let k = 0; k < 8; k++) { let junk = new Array(500000).fill(k); junk = null; }
      await new Promise((r) => setTimeout(r, 0));
    }
    const r = await Promise.race([pending, new Promise((res) => { t = setTimeout(() => res(null), 20000); })]);
    return (r && typeof r.bytes === "number") ? r.bytes : null;
  } catch (e) { return null; }
  finally { clearTimeout(t); }
}

// L4 (JS PEAK-space): measure a cooperating probe's high-water workspace. The
// probe (see web/lab-space-probes.mjs) is an async reference solution that
// `await sample()`s at its allocation peak while the scratch is still live --
// which is the only way to catch TRANSIENT workspace (a sort, a temp buffer)
// that's freed before a plain solve() returns. Per size: build the input
// (counted in the baseline so only the probe's own scratch shows), sample the
// baseline, run the probe (it samples at its peak), and report peak - baseline.
// Measured on the caller's larger `sizes` ladder (>=256KB) to clear the ~64KB
// resolution floor. Returns [{ n, bytes|null }] aligned to sizes, or null if the
// API can't run at all. Never throws.
async function measureSpaceProbe(probe, gen, sizes, opts) {
  opts = opts || {};
  if (typeof performance === "undefined" || typeof performance.measureUserAgentSpecificMemory !== "function") return null;
  if ((await churnForcedSample()) == null) return null;   // API present but not callable here
  const deadline = opts.deadline || (Date.now() + 240000);
  const out = [];
  for (const n of sizes) {
    if (Date.now() > deadline) { out.push({ n, bytes: null }); continue; }
    let input = null, baseline = null, peak = null;
    try {
      input = gen(n);                                    // input lives -> folded into baseline
      baseline = await churnForcedSample();
      const sample = async () => { peak = await churnForcedSample(); };
      await probe(input, sample);                        // probe samples at its peak
    } catch (e) { /* leave this size null */ }
    input = null;                                        // release before the next size
    out.push({ n, bytes: (baseline != null && peak != null) ? Math.max(0, peak - baseline) : null });
  }
  return out;
}

async function measureJsSpace(solve, cases, opts) {
  opts = opts || {};
  if (typeof performance === "undefined" || typeof performance.measureUserAgentSpecificMemory !== "function") return null;
  // measureUserAgentSpecificMemory only resolves at the next garbage collection,
  // which Chrome otherwise defers up to ~60s -- unusable for a before/after sweep.
  // We PROVOKE that GC by churning short-lived garbage in small yielding bursts
  // while the measurement is pending; empirically this collapses each call from
  // ~60s to well under a second (occasionally a few seconds). The churn arrays are
  // released each iteration, so they aren't counted at the GC -- only the retained
  // solve() result is -- which is why the measured growth stays proportional to
  // allocation (verified ~0.5x-linear across sizes). Still a whole-heap, GC-timed,
  // coarse proxy (hence the UI disclaimer), but the growth SHAPE the judge uses is
  // clean. One baseline + one measurement per size (result held), delta = growth.
  const deadline = opts.deadline || (Date.now() + 180000);
  const sample = async () => {
    let t;
    try {
      const pending = performance.measureUserAgentSpecificMemory().then((x) => x, () => null);
      for (let round = 0; round < 6; round++) {                     // churn -> force a GC
        for (let k = 0; k < 8; k++) { let junk = new Array(500000).fill(k); junk = null; }
        await new Promise((r) => setTimeout(r, 0));                 // yield so GC + the measurement can progress
      }
      const r = await Promise.race([pending, new Promise((res) => { t = setTimeout(() => res(null), 20000); })]);
      return (r && typeof r.bytes === "number") ? r.bytes : null;
    } catch (e) { return null; }
    finally { clearTimeout(t); }
  };
  const baseline = await sample();
  if (baseline == null) return null;
  const space = new Array(cases.length).fill(null);
  for (let i = 0; i < cases.length; i++) {
    if (Date.now() > deadline) break;      // budget spent -> keep what we have
    try {
      let held = solve(cases[i].input);    // retain the result across the measurement
      const m = await sample();
      if (m != null) space[i] = Math.max(0, m - baseline);
      held = null;                         // release before the next size
    } catch (e) { /* leave this size's space null */ }
  }
  return space;
}

// Kept for the non-Lab callers (the plain Run button): a single compile +
// single measure, exactly the old behavior, nsPerCase included.
function runJavaScript(source, cases) {
  const c = compileJavaScript(source);
  if (c.error) return c;
  return c.measure(cases);
}

if (typeof window !== "undefined") window.GlifexJsRuntime = { runJavaScript, compileJavaScript, measureSpaceProbe };
if (typeof module !== "undefined") module.exports = { runJavaScript, compileJavaScript, measureSpaceProbe };
