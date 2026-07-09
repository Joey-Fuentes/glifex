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
    sizes: {
      det: [3, 6, 12, 24],
      // TEMPORARY/DIAGNOSTIC (requested explicitly, not a final design):
      // 30 points instead of 4, spread evenly across the same [16,78]
      // safe range -- gives the consistency floor's tolerance (see
      // web/lab.js's UNRELIABLE_TOLERANCE) enough real headroom that a
      // handful of bad individual measurements can be filtered out and
      // classification can still proceed on the rest, instead of one bad
      // point blocking the whole analysis. Also surfaces the actual
      // unreliable-count ("X of 30") for real visibility into how often
      // this happens under real conditions, pending a decision on the
      // long-term fix.
      wall: [16, 18, 20, 22, 25, 27, 29, 31, 33, 35, 37, 40, 42, 44, 46, 48, 50, 52, 54, 57, 59, 61, 63, 65, 67, 69, 72, 74, 76, 78],
      // Per-language wall-tier overrides: 003's declared O(n) upper bound
      // is only meaningful if EVERY language's result fits its own numeric
      // contract at every tested n -- otherwise a genuinely correct
      // solution silently overflows and the Lab reports a false
      // correctness failure (confirmed: SM83 at n=25, WAT at n=48, both
      // real reports against the 30-point diagnostic ladder above; neither
      // is an actual bug in the solution being tested). SM83 has no cycle
      // counter yet ("6502/SM83 coarse until Harte parity" -- see
      // ROADMAP), so it falls through to the wall tier like any
      // non-cycle-exact language, but its retro-contract u16 result
      // register is the SAME one the det ladder is already capped at 24
      // to respect. Densified from 4 to 15 points within that same
      // [6,24] safe range once the underlying measurement itself was
      // fixed (web/runtimes.js's makeRetroLoader originally allocated a
      // fresh 64KB RAM array on every timing repeat -- measured directly:
      // that allocation alone was 83-92% of the total time, burying the
      // real O(n) signal and making growth measure as flat/O(1) even
      // though the algorithm is genuinely O(n); replaced with a
      // targeted-reset design that only clears the specific addresses
      // each execution actually wrote).
      //
      // asm-6502 has cycle tracking (should stay det-tier classified) --
      // included here too as a defensive fallback in case that ever
      // fails to report for some case and it falls through to wall-tier,
      // same as SM83.
      //
      // WAT has NO override here anymore: clean.wat/optimized.wat were
      // rewritten to use i64 accumulators instead of i32 (the loop
      // counter $n stays i32; only the Fibonacci values widen), pushing
      // its own overflow point out to fib(93) -- past what the shared
      // ladder below ever tests (capped at 78 to match the JS oracle's
      // own exact-double ceiling, not WAT's i64 limit). WAT now safely
      // uses the exact same shared 30-point ladder as JS/Python/Ruby/TS.
      // Motivated by the SAME overhead-domination signature found for
      // JS's original tiny ladder: at i32's narrow [12,46] range, WAT's
      // near-native execution speed left too little absolute signal
      // above fixed overhead to reliably classify growth (confirmed
      // directly: measurements consistently read as flat O(1)).
      // loadWat's callSolve() converts the resulting BigInt back to a
      // Number for the oracle comparison (see web/runtimes.js).
      wallByLang: { sm83: [6, 7, 9, 10, 11, 12, 14, 15, 16, 18, 19, 20, 21, 23, 24], "asm-6502": [6, 7, 9, 10, 11, 12, 14, 15, 16, 18, 19, 20, 21, 23, 24] },
    },
    // Retro ladder tops out at 24: fib(25) = 75025 overflows the tracks'
    // u16 result contract. Wall ladder tops at 78: fib(78) is the last
    // exactly-representable double, and 78 IS the ceiling here (not
    // conservative headroom under it) -- an earlier [8,16,32,64] ladder
    // was found to false-refute the declared O(n) bound 73% of the time
    // (measured directly, many trials of the real sampler): at such tiny n,
    // fixed per-call overhead (object creation, property access, JIT-level
    // effects) is a SYSTEMATIC, reproducible fraction of the measured cost,
    // not noise -- every individual point measures consistently, but the
    // curve genuinely doesn't look linear yet at n=8-64. Shifting the whole
    // ladder toward the precision ceiling (rather than widening it, which
    // would cross into imprecise fib(n) territory and risk a differently-
    // structured but equally correct solution rounding differently than
    // the oracle's specific iteration order) resolved it: 0-7% at
    // [16,32,55,78] across the same many-trial test.
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
  // A problem may need a NARROWER wall ladder for specific languages whose
  // result-encoding can't safely represent every value the shared ladder
  // would test (see 003-nth-fibonacci's wallByLang for why this exists).
  const wallOverride = tierId === "wall" && cfg.sizes.wallByLang && cfg.sizes.wallByLang[lang];
  const baseSizes = wallOverride || cfg.sizes[tierId] || cfg.sizes.wall;
  const sizes = baseSizes.slice(0, ov.maxSizes || 99);
  const plan = [];
  for (const mode of cfg.modes) {
    for (const n of sizes) {
      const r = mulberry32(hashSeed(seedBase + ":" + mode.id + ":" + n));
      plan.push({ mode: mode.id, n, input: mode.gen(n, r) });
    }
  }
  return { sizes, plan };
}
