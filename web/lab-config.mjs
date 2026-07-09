// Complexity Lab per-problem configuration (L1).
//
// L1 scope note: generators, declared bounds, and input-family notes live
// HERE, in web/, not in problem manifests -- promoting them into the manifest
// schema (with glifex.py verifier support) is L2, once these shapes have
// proven out. Declared classes below mirror the manifests' [complexity]
// claims for the practice variant.
//
// Every generator returns a JSON input matching the problem's schema; the
// expected output always comes from the JavaScript `clean` oracle at run
// time, and correctness gates every sample (a wrong solution benchmarks
// beautifully -- its samples must never reach the fitter).
//
// modes: named input families. roles.upper names the adversarial family the
// declared upper bound is tested on; roles.lower names the easy family for
// the declared lower bound. Single-mode problems point both roles at the
// same family and say why in `note`.

import { mulberry32, hashSeed } from "./lab-engine.mjs";

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const randStr = (n, r) => { let s = ""; for (let i = 0; i < n; i++) s += LETTERS[(r() * 26) | 0]; return s; };
const shuffled = (s, r) => { const a = s.split(""); for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a.join(""); };

export const TIERS = {
  det: { reps: 1, tol: 0.05, label: "deterministic" },
  wall: { reps: 3, tol: 0.28, label: "wall time" },
};

// Per-language overrides: compiled-in-browser toolchains repeat per case
// inside the harness (stable medians from one run), so lab-level reps stay
// at 1 to avoid recompiling; their ladders are also capped -- compile time
// dwarfs execution and JSON marshaling grows with n.
export const LANG_OVERRIDES = {
  c: { reps: 1, maxSizes: 4 },
  cpp: { reps: 1, maxSizes: 4 },
  php: { maxSizes: 4 },
};

export const PROBLEMS = {
  "001-anagram-detection": {
    sizeLabel: "string length n",
    sizes: { wall: [64, 128, 256, 512, 1024] },
    declared: { upper: "O(n)", lower: "O(1)" },
    roles: { upper: "worst", lower: "best" },
    modes: [
      { id: "worst", label: "true anagram (no early exit)", gen: (n, r) => { const s = randStr(n, r); return { s, t: shuffled(s, r) }; } },
      { id: "random", label: "random letters, equal length", gen: (n, r) => ({ s: randStr(n, r), t: randStr(n, r) }) },
      { id: "best", label: "length mismatch (early-exit family)", gen: (n, r) => ({ s: randStr(n, r), t: randStr(Math.max(1, n - 1), r) }) },
    ],
  },

  "002-two-sum": {
    sizeLabel: "array length n",
    sizes: { wall: [64, 128, 256, 512, 1024] },
    declared: { upper: "O(n)", lower: "O(1)" },
    roles: { upper: "worst", lower: "best" },
    // Base array: distinct even values, shuffled; target = odd (sum of the
    // planted even+odd pair) so no unplanted pair can hit it -- the planted
    // answer is unique by parity, which keeps every correct algorithm's
    // output comparable.
    modes: [
      { id: "worst", label: "answer at the far end (full scan)", gen: (n, r) => plant(n, r, n - 2, n - 1) },
      { id: "random", label: "answer uniformly placed", gen: (n, r) => { const i = (r() * (n - 1)) | 0; return plant(n, r, i, i + 1); } },
      { id: "best", label: "answer up front (early-exit family)", gen: (n, r) => plant(n, r, 0, 1) },
    ],
    // Two valid programs may return the pair in either order; compare
    // semantically, not byte-for-byte with the oracle.
    validate: (input, got) => {
      let g = got;
      if (typeof g === "string") { try { g = JSON.parse(g); } catch { return false; } }
      if (!Array.isArray(g) || g.length !== 2) return false;
      const [i, j] = g.map(Number);
      const a = input.nums;
      return Number.isInteger(i) && Number.isInteger(j) && i !== j
        && i >= 0 && j >= 0 && i < a.length && j < a.length
        && a[i] + a[j] === input.target;
    },
  },

  "003-nth-fibonacci": {
    sizeLabel: "n (the input value)",
    sizes: { det: [3, 6, 12, 24], wall: [8, 16, 32, 64] },
    // Retro ladder tops out at 24: fib(25) = 75025 overflows the tracks'
    // u16 result contract. Wall ladder tops at 64: fib(78) is the last
    // exactly-representable double, 64 keeps headroom.
    declared: { upper: "O(n)", lower: "O(n)" },
    roles: { upper: "value", lower: "value" },
    modes: [
      { id: "value", label: "n itself (no input-shape spread)", gen: (n) => ({ n }) },
    ],
    note: "Cost depends only on the value of n -- there is no easy or adversarial input SHAPE for this problem, so best and worst case coincide and one family tests both bounds.",
  },
};

function plant(n, r, i, j) {
  const nums = [];
  for (let k = 0; k < n; k++) nums.push((k + 1) * 2);        // distinct evens
  for (let k = n - 1; k > 0; k--) { const m = (r() * (k + 1)) | 0; const t = nums[k]; nums[k] = nums[m]; nums[m] = t; }
  nums[j] = nums[j] + 1;                                     // one odd value
  return { nums, target: nums[i] + nums[j] };                // odd target => planted pair is the only hit
}

// Build the (mode x size) case plan for one experiment, seeded and ordered
// deterministically so a provenance line fully reproduces the inputs.
export function buildPlan(cfg, tierId, lang, seedBase) {
  const ov = LANG_OVERRIDES[lang] || {};
  const sizes = (cfg.sizes[tierId] || cfg.sizes.wall).slice(0, ov.maxSizes || 99);
  const plan = [];
  for (const mode of cfg.modes) {
    for (const n of sizes) {
      const r = mulberry32(hashSeed(seedBase + ":" + mode.id + ":" + n));
      plan.push({ mode: mode.id, n, input: mode.gen(n, r) });
    }
  }
  return { sizes, plan };
}
