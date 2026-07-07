// Generated harness — do not edit. Reads ../test_cases.json, runs a variant.
const fs = require("fs"), path = require("path");
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const variant = process.argv[2] || "practice";
const bench = process.argv.includes("--bench");
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "test_cases.json"), "utf8"));
const solve = require("./" + variant + ".js");
if (bench) {
  let best = Infinity;
  for (let r = 0; r < 5; r++) {
    const t = process.hrtime.bigint();
    for (const c of cases) solve(c.input);
    const per = Number(process.hrtime.bigint() - t) / Math.max(1, cases.length);
    best = Math.min(best, per);
  }
  console.log(`  ${variant}: ~${best.toFixed(0)} ns/case (coarse)`);
} else {
  let passed = 0;
  cases.forEach((c, i) => {
    const got = solve(c.input), ok = eq(got, c.expected);
    if (ok) passed++;
    console.log(`  [${ok ? "PASS" : "FAIL"}] case ${i}` + (ok ? "" : `  expected=${JSON.stringify(c.expected)} got=${JSON.stringify(got)}`));
  });
  console.log(`${passed}/${cases.length} passed`);
  process.exit(passed === cases.length ? 0 : 1);
}
