// Generated harness — do not edit. Compiled to .tsbuild/, reads ../../test_cases.json.
// Node globals declared ambiently so it compiles offline without @types/node.
declare const require: any;
declare const process: any;
declare const __dirname: string;
const fs = require("fs");
const path = require("path");
const eq = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
const variant = process.argv[2] || "practice";
const cases: any[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "test_cases.json"), "utf8")
);
const solve = require("./" + variant + ".js").solve;
let passed = 0;
cases.forEach((c: any, i: number) => {
  const got = solve(c.input), ok = eq(got, c.expected);
  if (ok) passed++;
  console.log(`  [${ok ? "PASS" : "FAIL"}] case ${i}` + (ok ? "" : `  expected=${JSON.stringify(c.expected)} got=${JSON.stringify(got)}`));
});
console.log(`${passed}/${cases.length} passed`);
process.exit(passed === cases.length ? 0 : 1);
