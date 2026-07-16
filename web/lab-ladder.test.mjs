// lab-ladder.test.mjs -- a det-tier language must never inherit the wall ladder.
//
// WHY THIS EXISTS. buildPlan() resolves a ladder like this:
//
//   const byLang    = cfg.sizes[tierId + "ByLang"]?.[lang];
//   const baseSizes = byLang || cfg.sizes[tierId] || cfg.sizes.wall;
//
// The tier is decided at RUNTIME, not in config: lab.js picks "det" when the
// runtime reports `cycles` on its results. So any single-stepped runtime is
// det-tier automatically -- no registration, nothing to opt into.
//
// 001 and 002 defined no `det` key. So a det-tier language without an explicit
// detByLang entry fell through to cfg.sizes.wall -- the ladder sized for fast
// wall-clock runtimes, running to n=32768. That shipped: arm64 Analyze reported
// "the solution is incorrect on a generated input (family worst, n=32768)" on
// the live site, because clean's stack table hit exactly the 1 MB guest stack
// and brute-force truncated at MAX_STEPS. Absent config is not neutral -- it is
// the most aggressive setting available.
//
// The invariant, derived from buildPlan rather than from a hand-kept list:
//   every problem that defines sizes.wall must also define sizes.det.
// Then a new det-tier track gets a sane ladder BY DEFAULT and detByLang goes
// back to being an optional narrowing.

import { PROBLEMS } from "./lab-config.mjs";

const problems = Object.entries(PROBLEMS);
console.log("problems: " + problems.map(([id]) => id).join(", "));

const problems_ = [];
for (const [id, cfg] of problems) {
  const s = cfg.sizes || {};
  if (!s.wall) continue;               // nothing to fall back FROM
  if (!s.det) {
    problems_.push(
      `${id}: defines sizes.wall but no sizes.det.\n` +
      `      buildPlan falls back wall -> any det-tier language (one whose runtime\n` +
      `      reports cycles: a single-stepped emulator) would run this problem's\n` +
      `      FULL wall ladder, up to n=${s.wall[s.wall.length - 1]}.\n` +
      `      Add a det ladder sized for single-stepping, e.g. sizes.det.`);
    continue;
  }
  const dMax = s.det[s.det.length - 1], wMax = s.wall[s.wall.length - 1];
  if (dMax >= wMax) {
    problems_.push(
      `${id}: sizes.det tops out at ${dMax}, sizes.wall at ${wMax}.\n` +
      `      A det ladder that reaches the wall ladder's ceiling is not a cap.\n` +
      `      Single-stepped runtimes are ~1000x slower than native.`);
  }
  // detByLang entries must not silently exceed the det ladder either.
  for (const [lang, ladder] of Object.entries(s.detByLang || {})) {
    const lMax = ladder[ladder.length - 1];
    if (lMax > dMax) {
      problems_.push(`${id}: detByLang.${lang} tops at ${lMax}, above the det ladder's ${dMax}.`);
    }
  }
}

if (problems_.length) {
  console.error("\nLAB LADDER CHECK FAILED:");
  for (const p of problems_) console.error("  " + p);
  console.error(
    "\nA det-tier language is decided by its RUNTIME (results carry `cycles`),\n" +
    "not by config -- so a new single-stepped track becomes det-tier the moment\n" +
    "it lands, and inherits whatever ladder these keys resolve to.");
  process.exit(1);
}
console.log(`lab ladder OK: all ${problems.length} problems define a det ladder capped below their wall ladder.`);
