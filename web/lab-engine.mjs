// Complexity Lab engine (L1) -- pure math, no DOM, node-testable.
//
// Doctrine (docs/ROADMAP.md C3, docs/contribution-policy.md): this is a
// FALSIFIER. It can refute a declared complexity class from measured growth;
// it can never prove one. Verdict language everywhere reflects that.
//
// Notation is handled properly (the O = worst / Omega = best shorthand is
// wrong and this tool exists partly to teach why): worst/average/best CASES
// are different cost functions produced by different input families (modes);
// O / Omega / Theta are BOUNDS applicable to any of them. Here the declared
// upper bound is tested against the adversarial ("worst") input family and
// the declared lower bound against the easy ("best") family -- a growth
// curve exceeding the upper bound on ANY family is a valid refutation.
//
// Method: consecutive-step growth ratios, corrected for shared fixed
// overhead (see classifyGrowth below for why the correction is necessary
// and how it avoids a class fitting its own convenient intercept). Ratios
// cancel constant MULTIPLICATIVE factors, so the same test reads exact
// 8080 T-states and coarse wall time alike, and never compares absolute
// speed across runtimes (Decision 6). Tolerance is per measurement tier --
// tight for deterministic cycle counts, loose for wall time.

// The model set mirrors the manifest complexity whitelist (glifex.py ORDER).
// O(2^n) / O(n!) are in the whitelist but not fitted: any measurable ladder
// under them either times out or refutes everything polynomial first.
export const CLASSES = [
  { id: "O(1)", f: () => 1 },
  { id: "O(log n)", f: (n) => Math.log2(Math.max(n, 2)) },
  { id: "O(n)", f: (n) => n },
  { id: "O(n log n)", f: (n) => n * Math.log2(Math.max(n, 2)) },
  { id: "O(n^2)", f: (n) => n * n },
  { id: "O(n^3)", f: (n) => n * n * n },
];
export const classById = (id) => CLASSES.find((c) => c.id === id) || null;

// Least-squares fit y ~ a*f(n) + b. The intercept absorbs per-case fixed
// overhead so the chart's fitted curve is honest at small n too.
export function fitClass(f, ns, ys) {
  let sff = 0, sf = 0, sfy = 0, sy = 0;
  const m = ns.length;
  for (let i = 0; i < m; i++) {
    const v = f(ns[i]);
    sff += v * v; sf += v; sfy += v * ys[i]; sy += ys[i];
  }
  const det = m * sff - sf * sf;
  if (Math.abs(det) < 1e-12) { const b = sy / m; return { a: 0, b, predict: () => b }; }
  const a = (m * sfy - sf * sy) / det, b = (sy - a * sf) / m;
  return { a, b, predict: (n) => a * f(n) + b };
}

// Consecutive-step measured ratios with per-class PURE predictions (no
// overhead correction) -- kept for the UI's raw-data proof table, which is
// pedagogically about showing the actual measured ratios. classifyGrowth
// below does NOT use these predictions for verdicts (see bHat correction).
export function stepRatios(ns, ys) {
  const rows = [];
  const first = Math.max(1, Math.floor(ns.length / 2));
  for (let i = 1; i < ns.length; i++) {
    const row = { from: ns[i - 1], to: ns[i], meas: ys[i] / ys[i - 1], scored: i >= first, pred: {} };
    for (const c of CLASSES) row.pred[c.id] = c.f(ns[i]) / c.f(ns[i - 1]);
    rows.push(row);
  }
  return rows;
}

// Classify one mode's growth against every candidate class.
//
// A pure ratio test (measured y(n2)/y(n1) vs f(n2)/f(n1)) is exactly right
// when y is a pure a*f(n) with no additive term -- but every real
// measurement has SOME fixed per-case cost (call/marshal overhead on wall
// tiers; setup/I-O instructions on cycle-exact retro tiers), so real y is
// a*f(n)+b. At small n, b can dominate enough to make a genuinely-O(n)
// algorithm's ratios look sub-linear against a pure (no-intercept) O(n)
// prediction -- a false refutation of a CORRECT bound. (Confirmed on the
// real 8080 nth-Fibonacci core: cycles(n) = 29*n + 95 exactly; the pure-
// ratio test refuted the correct O(n) bound by 3x its own tolerance.)
//
// The chart's fitted curve already handles this (fitClass includes an
// intercept) -- the verdict math didn't. Two traps to avoid in fixing it:
//   1. Letting EACH candidate class fit its own free intercept lets a
//      WRONG class's regression choose a pathological b that flattens its
//      ratio structure enough to fake a match (confirmed: a wrong class's
//      own least-squares b can go arbitrarily negative and pass even
//      noiseless data of the wrong shape).
//   2. Averaging SIGNED fit residuals is self-defeating: ordinary least
//      squares forces residuals to sum to ~zero by construction, so this
//      "test" would pass almost any class regardless of shape.
// Fix: there is exactly ONE true fixed-overhead value per measurement, so
// estimate it ONCE -- from whichever candidate class fits the data best
// overall (smallest log-scale residual across ALL points) -- then test
// EVERY class's PURE ratio against that SAME shared-overhead-corrected
// data. No class gets to choose a convenient intercept for itself; ratios
// stay noise-stable (unlike raw consecutive differences, which amplify
// noise badly when values are close together -- tested and rejected).
export function classifyGrowth(ns, ys, tol) {
  const rows = stepRatios(ns, ys);
  const first = Math.max(1, Math.floor(ns.length / 2));

  // Pass 1: shared overhead estimate. Fit every class (its own a,b), score
  // by log-scale squared residual over ALL points, keep the best-fitting
  // class's b. A class whose fit goes non-positive anywhere is disqualified
  // from contributing the shared estimate (a sign its own fit is unstable).
  let bHat = 0, bestScore = Infinity;
  for (const c of CLASSES) {
    const fit = fitClass(c.f, ns, ys);
    let score = 0, bad = false;
    for (let i = 0; i < ns.length; i++) {
      const p = fit.predict(ns[i]);
      if (p <= 0) { bad = true; break; }
      const r = Math.log(ys[i] / p);
      score += r * r;
    }
    if (!bad && score < bestScore) { bestScore = score; bHat = fit.b; }
  }

  // Pass 2: every class's PURE ratio (no fitting) tested against the SAME
  // bHat-corrected measured data, scored only on the top-half (large-n)
  // steps, matching the original scoring convention.
  //
  // A step whose bHat-corrected values go non-positive used to push a
  // hardcoded -10 for EVERY class identically (the y1>0&&y2>0 check never
  // depends on the class, only on i/ns/ys/bHat) -- a real bug: that step
  // contributed ZERO differentiating signal between classes, yet still
  // diluted whatever real signal the OTHER scored step(s) had by being
  // averaged in as a fake, uniform, large-magnitude value. Confirmed
  // directly: with maxSizes=4 (first=2, so only 2 scored steps exist),
  // a single noisy small-n point produced a bHat large enough to push
  // one of the two scored steps negative -- reducing real signal to
  // effectively one step, but the corrupted average still produced a
  // confident-looking "closest" verdict that didn't match the raw
  // measured ratios shown in the UI's own proof table. Fixed: skip an
  // unusable step entirely for that class's average, instead of forcing
  // in a fake penalty every class shares equally.
  const errs = {};
  for (const c of CLASSES) {
    const stepErrs = [];
    for (let i = 1; i < ns.length; i++) {
      if (i < first) continue;
      const y2 = ys[i] - bHat, y1 = ys[i - 1] - bHat;
      if (y1 <= 0 || y2 <= 0) continue;   // unusable under this bHat -- skip, don't fake a penalty
      const predPure = c.f(ns[i]) / c.f(ns[i - 1]);
      stepErrs.push(Math.log((y2 / y1) / predPure));
    }
    // Every scored step unusable is rare, and -- since the y1>0&&y2>0 check
    // never depends on the class -- affects every class identically when it
    // happens: there's no real signal to work with regardless of what
    // fallback value is used here, so this exists only to avoid dividing by
    // zero, not to produce a meaningful comparison.
    errs[c.id] = stepErrs.length ? stepErrs.reduce((a, b) => a + b, 0) / stepErrs.length : -10;
  }

  // Attach the bHat-corrected ratio to each row so the UI's proof table can
  // highlight hit/miss consistently with what actually drove the verdict
  // (rather than re-deriving a different, pre-correction comparison).
  for (let i = 0; i < rows.length; i++) {
    const y2 = ys[i + 1] - bHat, y1 = ys[i] - bHat;
    rows[i].correctedMeas = (y1 > 0 && y2 > 0) ? y2 / y1 : null;
  }

  const consistent = CLASSES.filter((c) => Math.abs(errs[c.id]) <= tol).map((c) => c.id);
  let closest = CLASSES[0].id;
  for (const c of CLASSES) if (Math.abs(errs[c.id]) < Math.abs(errs[closest])) closest = c.id;
  return { rows, errs, consistent, closest, bHat };
}

// Compose the case x bound verdicts.
//   modes:    { <modeId>: { ns, ys } }  (already aggregated: one y per size)
//   roles:    { upper: <modeId>, lower: <modeId> }  (worst-family / best-family;
//             a single-mode problem points both roles at the same mode)
//   declared: { upper: "O(n)", lower: "O(1)" }      (lower shown as Omega)
// Returns per-bound verdicts plus a Theta result when both ends pin the
// same class. verdict values: "consistent" | "refuted" | "not-tight".
export function judge(modes, roles, declared, tol) {
  const cls = {};
  for (const [id, m] of Object.entries(modes)) cls[id] = classifyGrowth(m.ns, m.ys, tol);

  const upC = cls[roles.upper], loC = cls[roles.lower];
  const upErr = upC.errs[declared.upper];
  const upper = {
    declared: declared.upper, mode: roles.upper, err: upErr,
    verdict: upErr > tol ? "refuted" : Math.abs(upErr) <= tol ? "consistent" : "not-tight",
  };
  // Growth ABOVE the declared upper bound refutes it. Growth below it means
  // the bound holds but is not tight on this family.

  const lowerTrivial = declared.lower === "O(1)";
  const loErr = loC.errs[declared.lower];
  const lower = {
    declared: declared.lower, mode: roles.lower, err: loErr, trivial: lowerTrivial,
    verdict: lowerTrivial ? "consistent"
      : loErr < -tol ? "refuted" : Math.abs(loErr) <= tol ? "consistent" : "not-tight",
  };
  // Growth BELOW the declared lower bound refutes it; Omega(1) is satisfied
  // by every algorithm and is reported as unrefutable rather than "proved".

  // Theta: both families' growth pinned to the SAME class -> tight bound.
  const theta = (upC.closest === loC.closest
    && upC.consistent.includes(upC.closest) && loC.consistent.includes(loC.closest))
    ? { cls: upC.closest } : null;

  return { perMode: cls, upper, lower, theta };
}

// Empirical-first matching: given measured growth (no specific declared
// bound to test against -- see lab.js's reveal-state branching for when
// this applies), check each KNOWN solution variant's own declared bounds
// and report which ones the data is actually consistent with.
//
// Deliberately uses classifyGrowth's `consistent` set (strict per-class
// tolerance, the same criterion judge()'s "consistent" verdict uses) and
// NOT a "not refuted" check -- being FASTER than a declared upper bound
// never refutes it, so a naive "not refuted" test would incorrectly also
// match genuinely-O(n) data against a variant declared O(n^2). Only a
// tight fit counts as a match.
//
//   modes:         { <modeId>: { ns, ys } }  (same shape as judge())
//   roles:         { upper: <modeId>, lower: <modeId> }
//   variantBounds: { <variantId>: { upper: "O(n)"|null, lower: "O(1)"|null } }
//                  upper===null means this variant has no declared bound
//                  at all (skipped entirely); lower===null means "not
//                  declared for this variant" (upper alone can still match
//                  -- NOT treated as Omega(1), since guessing a lower
//                  bound that was never stated could be wrong, e.g. a
//                  problem with no easy/hard input-shape distinction).
export function matchKnownVariants(modes, roles, variantBounds, tol) {
  const upC = classifyGrowth(modes[roles.upper].ns, modes[roles.upper].ys, tol);
  const loC = roles.lower === roles.upper ? upC : classifyGrowth(modes[roles.lower].ns, modes[roles.lower].ys, tol);

  const matches = [];
  const perVariant = {};
  for (const [variantId, bounds] of Object.entries(variantBounds)) {
    if (!bounds || !bounds.upper) { perVariant[variantId] = { upperOk: false, lowerOk: false, skipped: true }; continue; }
    const upperOk = upC.consistent.includes(bounds.upper);
    const lowerOk = bounds.lower == null ? true : bounds.lower === "O(1)" ? true : loC.consistent.includes(bounds.lower);
    perVariant[variantId] = { upperOk, lowerOk, declaredUpper: bounds.upper, declaredLower: bounds.lower };
    if (upperOk && lowerOk) matches.push(variantId);
  }
  return { matches, perVariant, upperClosest: upC.closest, lowerClosest: loC.closest, upC, loC };
}

export function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

// A point's repeated measurements are "reliable" if a MAJORITY of them
// mutually agree (within spreadLimit of each other), not only if ALL of
// them do. The straightforward alternative -- comparing the full
// max/min range against spreadLimit -- lets a SINGLE outlier value
// disqualify a point the majority actually agrees closely on. That's
// exactly the failure mode sustained-but-not-total contention produces:
// most reps land close together, one gets hit by a transient
// interruption. median(vals) (used downstream once a point passes this
// gate) is ALREADY robust to exactly one outlier among 3 values -- with
// an odd count, the middle element can't itself be the extreme -- so
// the gating check should reflect that same robustness rather than
// being far more fragile than the statistic it's gating.
//
// Sorts once, then slides a window of the majority size across it,
// checking whether ANY contiguous window (in sorted order, the
// tightest-possible cluster of that size) falls within spreadLimit.
// With 3 values this reduces to: do the two smallest agree, OR do the
// two largest agree? Either is enough to trust the point; agreement
// nowhere means it's genuinely unreliable, not just noisy.
export function isReliable(vals, spreadLimit) {
  if (vals.length < 2) return true;
  // True majority (strictly more than half), not Math.ceil(n/2) -- that
  // formula gives 1 when n=2, meaning a single value would trivially
  // "agree with itself" (ratio 1) regardless of how far apart the two
  // actual values are, always returning true for exactly the n=2 case
  // where that's wrong: with only two measurements, agreement has to
  // mean BOTH agree, not either one alone.
  const majority = Math.floor(vals.length / 2) + 1;
  const sorted = vals.slice().sort((a, b) => a - b);
  for (let i = 0; i + majority <= sorted.length; i++) {
    if (sorted[i + majority - 1] / sorted[i] <= spreadLimit) return true;
  }
  return false;
}

// Deterministic PRNG so generated inputs are reproducible from a seed the
// provenance line can name.
export function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hashSeed = (str) => { let h = 0x9e3779b9; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x85ebca6b); return h >>> 0; };
