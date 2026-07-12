// Complexity Lab engine battery (L1, shared-overhead-corrected classifier).
// Plain node script, zero deps:
//   node web/lab-engine.test.mjs
// Covers: fit recovery, falsifier verdicts each direction, Theta
// composition, the trivial-Omega(1) rule, and the generator invariants the
// verdicts depend on (seed determinism; two-sum planted-pair uniqueness;
// anagram adversarial family really is anagrams).
import { CLASSES, classById, fitClass, classifyGrowth, judge, matchKnownVariants, median, isReliable, mulberry32, hashSeed } from "./lab-engine.mjs";
import { PROBLEMS, buildPlan, TIERS } from "./lab-config.mjs";

let n = 0;
const ok = (cond, msg) => { n++; if (!cond) { console.error("FAIL:", msg); process.exit(1); } };

// --- fitting -----------------------------------------------------------
{
  const ns = [8, 16, 32, 64, 128, 256, 512, 1024];
  const ys = ns.map((x) => 120 + 46 * x);
  const fit = fitClass(classById("O(n)").f, ns, ys);
  ok(Math.abs(fit.a - 46) < 1e-6 && Math.abs(fit.b - 120) < 1e-6, "exact linear recovery");
}

// --- classification: exact linear cycles (det tier) --------------------
{
  const ns = [8, 16, 32, 64, 128, 256, 512, 1024];
  const ys = ns.map((x) => 120 + 46 * x);
  const c = classifyGrowth(ns, ys, TIERS.det.tol);
  ok(c.consistent.includes("O(n)"), "linear consistent with O(n)");
  ok(!c.consistent.includes("O(n^2)"), "linear refutes O(n^2)");
  ok(!c.consistent.includes("O(log n)"), "linear refutes O(log n)");
  ok(c.closest === "O(n)", "closest is O(n)");
}

// --- classification: a step going non-positive after bHat correction
// must not silently corrupt every class's score identically ------------
// Regression test for a real bug found live: at maxSizes=4 (first=2,
// only 2 scored steps), a near-flat first (unscored) step can produce a
// bHat close enough to the second point that it goes slightly negative
// after correction. The old code pushed a hardcoded -10 for EVERY class
// on that step (the y1>0&&y2>0 check never depends on the class), which
// diluted the one remaining scored step's real signal by averaging it
// with an uninformative constant every class shared -- producing a
// confident-looking but wrong "closest" that didn't match the raw
// measured ratios. This exact data (reconstructed from the live
// verdict) used to report O(1); the true shape is O(n log n).
{
  const ns = [64, 128, 256, 512];
  const Y = 100000;
  const ys = [Y, Y * 1.00, Y * 1.00 * 2.40, Y * 1.00 * 2.40 * 2.00];
  const c = classifyGrowth(ns, ys, TIERS.wall.tol);
  ok(c.closest === "O(n log n)", `a near-flat unscored first step must not corrupt the verdict (got ${c.closest})`);
}

// --- falsifier, upper direction: quadratic refutes O(n log n) ----------
{
  const r = mulberry32(7);
  const ns = [64, 128, 256, 512, 1024, 2048];
  const ys = ns.map((x) => (0.9 + 8e-5 * x * x) * (0.97 + 0.06 * r()));
  const j = judge({ worst: { ns, ys }, best: { ns, ys } }, { upper: "worst", lower: "best" },
    { upper: "O(n log n)", lower: "O(1)" }, TIERS.wall.tol);
  ok(j.upper.verdict === "refuted", "quadratic growth refutes declared O(n log n) upper");
  ok(j.perMode.worst.closest === "O(n^2)", "closest alternative is O(n^2)");
  ok(j.lower.trivial && j.lower.verdict === "consistent", "Omega(1) is unrefutable");
}

// --- falsifier, lower direction + Theta composition --------------------
{
  const ns = [8, 16, 32, 64, 128, 256];
  const lin = ns.map((x) => 50 + 30 * x);
  const flat = ns.map(() => 55);
  // declared Omega(n) but the easy family is flat -> lower bound refuted
  let j = judge({ worst: { ns, ys: lin }, best: { ns, ys: flat } }, { upper: "worst", lower: "best" },
    { upper: "O(n)", lower: "O(n)" }, TIERS.det.tol);
  ok(j.lower.verdict === "refuted", "flat easy-family growth refutes declared Omega(n)");
  ok(j.theta === null, "no Theta when families pin different classes");
  // both families linear + matching declared bounds -> Theta(n)
  j = judge({ value: { ns, ys: lin } }, { upper: "value", lower: "value" },
    { upper: "O(n)", lower: "O(n)" }, TIERS.det.tol);
  ok(j.theta && j.theta.cls === "O(n)", "matching bounds on one family pin Theta(n)");
  // upper holds but is not tight: linear growth under declared O(n^2)
  j = judge({ worst: { ns, ys: lin }, best: { ns, ys: lin } }, { upper: "worst", lower: "best" },
    { upper: "O(n^2)", lower: "O(1)" }, TIERS.det.tol);
  ok(j.upper.verdict === "not-tight", "linear under declared O(n^2) is holds-but-not-tight");
}

// --- utilities ----------------------------------------------------------
ok(median([3, 1, 2]) === 2 && median([4, 1, 3, 2]) === 2.5, "median odd+even");

// isReliable: majority-agreement point-reliability check, added after a
// real CI failure pattern (near-total, 22-30 of 30 points flagged
// unreliable) traced to the OLD full-range (max/min) check being far
// more fragile than the median it gates -- a single outlier among 3
// reps could disqualify a point the other 2 agreed on closely.
{
  // The exact scenario this replaces the old check for: 2 of 3 reps
  // agree closely, one is a wild outlier (contention hit just that
  // rep's measurement of just this point) -- must be reliable, not
  // disqualified by the one outlier the median would ignore anyway.
  ok(isReliable([1000, 1050, 8000], 3) === true, "2-of-3 close agreement survives one wild outlier");
  ok(isReliable([8000, 1000, 1050], 3) === true, "same, unsorted input order");

  // All three agree closely -- clearly reliable.
  ok(isReliable([1000, 1020, 980], 3) === true, "all three agree closely");

  // No pair agrees anywhere -- genuinely unreliable, not just noisy.
  ok(isReliable([1000, 5000, 20000], 3) === false, "no agreeing pair anywhere -- genuinely unreliable");

  // Boundary: ratio exactly at spreadLimit is still reliable (<=, not <).
  ok(isReliable([1000, 3000], 3) === true, "exact boundary ratio (3x) counts as reliable");
  ok(isReliable([1000, 3000.001], 3) === false, "just over the boundary is unreliable");

  // n=2 edge case: majority must mean BOTH agree, not either one alone.
  // (Caught as a real bug during design: Math.ceil(2/2)=1 would let a
  // lone value trivially "agree with itself" and always return true
  // regardless of the actual spread -- fixed to floor(n/2)+1.)
  ok(isReliable([1000, 1050], 3) === true, "n=2, both agree -- reliable");
  ok(isReliable([1000, 9000], 3) === false, "n=2, wide disagreement -- unreliable (not trivially true)");

  // n=1: can't judge reliability from a single sample -- treated as
  // reliable (matches the existing missing-value handling elsewhere,
  // which is a separate, stricter check with zero tolerance).
  ok(isReliable([1000], 3) === true, "n=1 -- can't judge, treated as reliable");

  // n=4: a TRUE majority (3 of 4), not just half (2 of 4).
  ok(isReliable([1000, 1020, 1050, 9000], 3) === true, "n=4, 3-of-4 agree -- a true majority");
  ok(isReliable([1000, 1020, 9000, 9500], 3) === false, "n=4, only 2-of-4 agree -- not a majority, unreliable");
}

ok(mulberry32(1)() !== mulberry32(2)() && mulberry32(9)() === mulberry32(9)(), "prng seeded + deterministic");
ok(hashSeed("a:b") === hashSeed("a:b") && hashSeed("a:b") !== hashSeed("a:c"), "seed hashing stable + distinct");
ok(CLASSES.length === 6, "fitted model set mirrors the polynomial whitelist");

// --- generator invariants ----------------------------------------------
{
  const p1 = buildPlan(PROBLEMS["001-anagram-detection"], "wall", "javascript", "s");
  const p2 = buildPlan(PROBLEMS["001-anagram-detection"], "wall", "javascript", "s");
  ok(JSON.stringify(p1.plan) === JSON.stringify(p2.plan), "same seed base reproduces identical inputs");
  const worst = p1.plan.filter((c) => c.mode === "worst");
  ok(worst.every((c) => c.input.s.split("").sort().join("") === c.input.t.split("").sort().join("")),
    "anagram adversarial family really is anagrams");
  const best = p1.plan.filter((c) => c.mode === "best");
  ok(best.every((c) => c.input.s.length !== c.input.t.length), "anagram easy family length-mismatches");
}
{
  const cfg = PROBLEMS["002-two-sum"];
  const plan = buildPlan(cfg, "wall", "javascript", "s").plan;
  for (const c of plan.slice(0, 6)) {
    const { nums, target } = c.input;
    let hits = 0, pair = null;
    for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++)
      if (nums[i] + nums[j] === target) { hits++; pair = [i, j]; }
    ok(hits === 1, "two-sum planted pair is the unique answer (n=" + nums.length + ", mode=" + c.mode + ")");
    ok(cfg.validate(c.input, pair) && cfg.validate(c.input, [pair[1], pair[0]]), "validator accepts both index orders");
    ok(!cfg.validate(c.input, [0, 0]) && cfg.validate(c.input, JSON.stringify(pair)), "validator rejects i==j, parses string got");
  }
  const worst = plan.filter((c) => c.mode === "worst")[0];
  const wi = worst.input.nums.length;
  ok(worst.input.nums[wi - 2] + worst.input.nums[wi - 1] === worst.input.target, "two-sum worst family plants at the far end");
}
{
  const capped = buildPlan(PROBLEMS["001-anagram-detection"], "wall", "cpp", "s");
  ok(capped.sizes.length === 10, "compiled-language ladder is capped (maxSizes: 10, per LANG_OVERRIDES)");
  const det = buildPlan(PROBLEMS["003-nth-fibonacci"], "det", "i8080", "s");
  ok(Math.max(...det.sizes) <= 24, "retro fib ladder respects the u16 result contract");
}

// --- shared-overhead classifier: regression tests for the det-tier false-
// refutation bug (real 8080 clean.s cycle counts: cycles(n) = 29n + 95
// exactly, hand-assembled and run through web/retro/cpu8080.mjs) ---------
{
  const ns = [3, 6, 12, 24], ys = [182, 269, 443, 791];   // exact, real, noiseless
  const c = classifyGrowth(ns, ys, TIERS.det.tol);
  ok(Math.abs(c.errs["O(n)"]) < 1e-9, "real 8080 fib: O(n) error is exactly zero (perfect affine fit)");
  ok(c.closest === "O(n)", "real 8080 fib: closest class is O(n)");
  ok(c.consistent.includes("O(n)"), "real 8080 fib: O(n) is NOT refuted (this was the reported bug)");
  ok(!c.consistent.includes("O(n^2)") && !c.consistent.includes("O(log n)"), "real 8080 fib: wrong classes still correctly excluded");
  ok(Math.abs(c.bHat - 95) < 1e-6, "real 8080 fib: recovered shared overhead matches the true fixed cost (95 cycles)");
}
// A wrong class must not be able to fit its OWN convenient intercept to
// fake a match (confirmed failure mode of an earlier design attempt: a
// per-class free intercept let O(n) pass even noiseless quadratic data).
{
  const ns = [64, 128, 256, 512, 1024];
  const ys = ns.map((n) => 0.002 * n * n + 50);   // exact, noiseless O(n^2)
  const c = classifyGrowth(ns, ys, TIERS.wall.tol);
  ok(c.consistent.includes("O(n^2)") && c.closest === "O(n^2)", "clean quadratic: correctly consistent with O(n^2)");
  ok(!c.consistent.includes("O(n)"), "clean quadratic: O(n) is refuted even noiseless (regression guard for the per-class-intercept cheat)");
}
// Noise robustness: realistic wall-tier jitter must not false-refute a
// genuinely correct O(n) bound (fixed seed for a deterministic regression).
{
  const r = mulberry32(12345);
  const ns = [64, 128, 256, 512, 1024];
  const ys = ns.map((n) => (3 * n + 200) * (1 + (r() - 0.5) * 0.3));
  const c = classifyGrowth(ns, ys, TIERS.wall.tol);
  ok(c.consistent.includes("O(n)"), "noisy-but-correct O(n) (30% jitter, seeded): not falsely refuted");
}

// --- 003-nth-fibonacci's wall ladder must stay large enough to avoid the
// fixed-overhead-dominated small-n bias (regression guard: an earlier
// [8,16,32,64] ladder measured a 73% false-refutation rate on the real
// sampler -- reproducible, not noise, since fixed overhead at n=8-64 is a
// systematic fraction of the tiny per-call cost. [16,32,55,78] measured
// 0-7% across the same many-trial test. 78 is a hard ceiling, not
// headroom: fib(78) is the last exactly-representable double.) ----------
{
  const wallSizes = PROBLEMS["003-nth-fibonacci"].sizes.wall;
  ok(Math.min(...wallSizes) >= 16, "fib wall ladder floor stays clear of the overhead-dominated tiny-n region (>=16)");
  ok(Math.max(...wallSizes) <= 78, "fib wall ladder ceiling respects fib(78) as the last exact double");
  ok(wallSizes.length === 30, "fib wall ladder is the temporary/diagnostic 30-point version (up from 4)");
  ok(new Set(wallSizes).size === 30, "fib wall ladder has no duplicate sizes");
}

// --- per-language wall-tier precision overrides (SM83/6502/WAT): fixes
// false correctness failures caused by numeric overflow, independent of
// the shared ladder's own size (confirmed real reports at n=25 for SM83,
// n=48 for WAT against the current 30-point shared ladder) -------------
{
  function fib(n) { let a = 0, b = 1; for (let i = 0; i < n; i++) { const t = a + b; a = b; b = t; } return a; }
  const cfg = PROBLEMS["003-nth-fibonacci"];
  const sm83Sizes = buildPlan(cfg, "wall", "sm83", "s").sizes;
  const asm6502Sizes = buildPlan(cfg, "wall", "asm-6502", "s").sizes;
  const watSizes = buildPlan(cfg, "wall", "wat", "s").sizes;
  const jsSizes = buildPlan(cfg, "wall", "javascript", "s").sizes;
  ok(Math.max(...sm83Sizes) <= 24 && fib(Math.max(...sm83Sizes)) <= 0xffff, "SM83 wall override stays within its u16 result register");
  ok(sm83Sizes.length === 15, "SM83 wall override is the densified 15-point version (up from 4), same u16-safe range");
  ok(new Set(sm83Sizes).size === 15, "SM83 wall override has no duplicate sizes");
  ok(Math.max(...asm6502Sizes) <= 24, "6502's defensive wall override also stays within u16, in case it ever falls through to wall-tier");
  ok(!sm83Sizes.includes(25), "SM83 override no longer includes n=25, the exact reported failure point");
  // WAT no longer has its own override: clean.wat/optimized.wat were
  // rewritten to use i64 (safe past fib(78), the shared ladder's own
  // ceiling), so WAT now safely uses the exact same ladder as JS.
  ok(JSON.stringify(watSizes) === JSON.stringify(jsSizes), "WAT now uses the exact same shared ladder as JS (i64 rewrite removed the need for its own override)");
  ok(fib(78) <= Number.MAX_SAFE_INTEGER, "sanity: fib(78) stays exactly representable as a JS Number (an i64 WASM result compares equal to it via eq()'s BigInt-safe comparison -- see web/runtimes.js)");
}

// --- 002-two-sum's WAT track never actually worked: loadWat's generic
// callSolve only ever supported pure-scalar WASM functions, and
// two-sum's solve(ptr, len, target) needs the nums array marshaled into
// WASM memory first (confirmed real report: "got=-1" on every case).
// clean.wat/optimized.wat also rewritten to use WASM's native multi-
// value return ((result i32 i32) -> a plain JS array [i,j] at the
// boundary) instead of packing the pair into a single i64, avoiding
// BigInt entirely for this problem -- validate() tested here needs no
// unpacking logic as a result. -------------------------------------
{
  const cfg = PROBLEMS["002-two-sum"];
  ok(typeof cfg.validate === "function", "002-two-sum still has a validate() fallback for semantically-equivalent answers");
  ok(cfg.validate({ nums: [2, 7, 11, 15], target: 9 }, [0, 1]) === true, "validate() accepts a correct plain-array pair");
  ok(cfg.validate({ nums: [2, 7, 11, 15], target: 9 }, [-1, -1]) === false, "validate() rejects the not-found sentinel");
  ok(cfg.validate({ nums: [2, 7, 11, 15], target: 9 }, [1, 0]) === true, "validate() accepts the pair in either order (semantic check, not order-sensitive)");
}

// --- matchKnownVariants: empirical-first matching against per-variant
// declared bounds (no specific claim revealed to test -- see lab.js's
// "empirical-match" mode). Deliberately uses classifyGrowth's strict
// `consistent` set, not a "not refuted" check -- being FASTER than a
// declared upper bound never refutes it, so a naive check would
// incorrectly also match genuinely-O(n) data against a variant declared
// O(n^2). Only a tight fit counts as a match. ---------------------------
{
  const ns = [64, 128, 256, 512, 1024];
  const linear = { ns, ys: ns.map((x) => 10 * x + 500) };
  const quad = { ns, ys: ns.map((x) => 0.05 * x * x + 500) };
  const constant = { ns, ys: ns.map(() => 100) };
  const variantBounds = {
    "brute-force": { upper: "O(n^2)", lower: "O(1)" },
    clean: { upper: "O(n)", lower: "O(1)" },
    optimized: { upper: "O(n)", lower: "O(1)" },
  };
  const roles = { upper: "worst", lower: "best" };

  const mLinear = matchKnownVariants({ worst: linear, best: constant }, roles, variantBounds, TIERS.wall.tol);
  ok(mLinear.matches.includes("clean") && mLinear.matches.includes("optimized"), "O(n) data matches both clean and optimized (same declared bound -- list all matches)");
  ok(!mLinear.matches.includes("brute-force"), "O(n) data does NOT match brute-force's declared O(n^2)");

  const mQuad = matchKnownVariants({ worst: quad, best: constant }, roles, variantBounds, TIERS.wall.tol);
  ok(mQuad.matches.length === 1 && mQuad.matches[0] === "brute-force", "O(n^2) data matches ONLY brute-force");
  ok(!mQuad.matches.includes("clean"), "O(n^2) data does NOT match clean's declared O(n) -- being slower refutes a tighter upper bound");

  const cubic = { ns, ys: ns.map((x) => 0.0002 * x * x * x + 500) };
  const mCubic = matchKnownVariants({ worst: cubic, best: constant }, roles, variantBounds, TIERS.wall.tol);
  ok(mCubic.matches.length === 0, "O(n^3) data matches no known variant (none declares O(n^3))");
  ok(mCubic.upperClosest === "O(n^3)", "no-match case still reports the empirical closest class for display");

  // Missing lower bound: doesn't block a match on the upper bound alone.
  const boundsNoLower = { onlyUpper: { upper: "O(n)", lower: null } };
  const mNoLower = matchKnownVariants({ worst: linear, best: constant }, roles, boundsNoLower, TIERS.wall.tol);
  ok(mNoLower.matches.includes("onlyUpper"), "a variant with no declared lower bound can still match on upper alone");

  // A variant with no declared upper bound at all is skipped entirely (not a match, not counted as a refutation).
  const boundsNoUpper = { undeclared: { upper: null, lower: "O(1)" } };
  const mNoUpper = matchKnownVariants({ worst: linear, best: constant }, roles, boundsNoUpper, TIERS.wall.tol);
  ok(!mNoUpper.matches.includes("undeclared") && mNoUpper.perVariant.undeclared.skipped, "a variant with no declared upper bound is skipped, not falsely matched or refuted");
}

// --- build.mjs's manifest complexity parsing feeds the corpus this ties
// into: confirm 002-two-sum's baked WAT complexity actually distinguishes
// brute-force (O(n^2)) from clean/optimized (O(n)) end to end, since this
// exact mismatch (declaring one bound per problem, not per variant) was
// the reported gap that motivated this feature. ------------------------
{
  const fs = await import("node:fs");
  const corpus = JSON.parse(fs.readFileSync(new URL("./problems.generated.json", import.meta.url), "utf8"));
  const p = corpus.problems.find((x) => x.id === "002-two-sum");
  ok(!!p, "002-two-sum is present in the baked corpus");
  const wat = p.languages.wat.complexity;
  ok(wat["brute-force"].upper === "O(n^2)", "baked corpus: WAT brute-force declares O(n^2)");
  ok(wat.clean.upper === "O(n)" && wat.optimized.upper === "O(n)", "baked corpus: WAT clean and optimized both declare O(n)");
  const js = p.languages.javascript.complexity;
  ok(js.clean.upper === "O(n)" && js.optimized.upper === "O(n)", "baked corpus: JS (via the default fallback, no per-language override) declares O(n) for clean/optimized");
}

console.log(`lab-engine battery: ${n}/${n} passed`);


