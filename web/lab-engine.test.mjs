// Complexity Lab engine battery (L1, shared-overhead-corrected classifier).
// Plain node script, zero deps:
//   node web/lab-engine.test.mjs
// Covers: fit recovery, falsifier verdicts each direction, Theta
// composition, the trivial-Omega(1) rule, and the generator invariants the
// verdicts depend on (seed determinism; two-sum planted-pair uniqueness;
// anagram adversarial family really is anagrams).
import { CLASSES, classById, fitClass, classifyGrowth, judge, median, mulberry32, hashSeed } from "./lab-engine.mjs";
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
  ok(capped.sizes.length === 4, "compiled-language ladder is capped");
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

console.log(`lab-engine battery: ${n}/${n} passed`);
