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
// Method: consecutive-step growth ratios. For sizes n1 < n2, a pure class f
// predicts y(n2)/y(n1) = f(n2)/f(n1). Ratios cancel constant factors, so the
// same test reads exact 8080 T-states and coarse wall time alike, and never
// compares absolute speed across runtimes (Decision 6). Small-n steps are
// excluded from scoring: fixed overhead (call/marshaling/startup) dominates
// the leading term there. Tolerance is per measurement tier -- tight for
// deterministic cycle counts, loose for wall time.

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

// Consecutive-step measured ratios with per-class predictions.
// scored: only the top half of the ladder counts toward verdicts.
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

// Classify one mode's growth: per class, the mean SIGNED log error of
// measured vs predicted ratios over the scored steps. |err| <= tol means
// "this run failed to refute the class"; sign says which way it missed.
export function classifyGrowth(ns, ys, tol) {
  const rows = stepRatios(ns, ys);
  const scored = rows.filter((r) => r.scored);
  const errs = {};
  for (const c of CLASSES) {
    let s = 0;
    for (const r of scored) s += Math.log(r.meas / r.pred[c.id]);
    errs[c.id] = s / scored.length;
  }
  const consistent = CLASSES.filter((c) => Math.abs(errs[c.id]) <= tol).map((c) => c.id);
  let closest = CLASSES[0].id;
  for (const c of CLASSES) if (Math.abs(errs[c.id]) < Math.abs(errs[closest])) closest = c.id;
  return { rows, errs, consistent, closest };
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

export function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
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
