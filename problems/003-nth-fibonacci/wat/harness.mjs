// WAT harness (JS host). wat.toml runs:
//   wat2wasm {variant}.wat -o .glifex.wasm && node harness.mjs
// then this loads the assembled module and runs every case as solve(...nums).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const wasm = readFileSync(join(here, ".glifex.wasm"));
const cases = JSON.parse(readFileSync(join(here, "..", "test_cases.json"), "utf8"));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const { instance } = await WebAssembly.instantiate(wasm, {});
const solve = instance.exports.solve;
if (typeof solve !== "function") { console.error('no "solve" export'); process.exit(1); }
let passed = 0;
cases.forEach((c, i) => {
  // WASM i64 returns marshal into JS as BigInt; JSON.stringify throws on
  // BigInt, so normalize to Number before comparing. fib(n) returns i64
  // (it overflows i32); every test value is far under 2^53, so Number is
  // exact here. (This surfaced only when the CI matrix re-enabled WAT.)
  const raw = solve(...Object.values(c.input));   // numeric args, positional
  const got = typeof raw === "bigint" ? Number(raw) : raw;
  const ok = eq(got, c.expected);
  if (ok) passed++;
  console.log(`  [${ok ? "PASS" : "FAIL"}] case ${i}` + (ok ? "" : `  expected=${JSON.stringify(c.expected)} got=${JSON.stringify(got)}`));
});
console.log(`${passed}/${cases.length} passed`);
process.exit(passed === cases.length ? 0 : 1);
