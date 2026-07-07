// Per-problem host for the WAT track. Core wasm speaks only numbers, so the
// host owns marshalling: it writes nums[] into linear memory as i32s, calls
//   solve(ptr, len, target) -> (i32, i32)   ;; [i, j], or [-1, -1] if none
// -- a real, native WASM multi-value return, not a packed i64 (see
// clean.wat's own header comment for why that was chosen).
import { readFileSync } from "node:fs";

const cases = JSON.parse(readFileSync("../test_cases.json", "utf8"));
const bytes = readFileSync(".glifex.wasm");
const { instance } = await WebAssembly.instantiate(bytes, {});
const { memory, solve } = instance.exports;

let passed = 0;
cases.forEach((c, i) => {
  const nums = c.input.nums;
  new Int32Array(memory.buffer, 0, nums.length).set(nums);
  const [a, b] = solve(0, nums.length, c.input.target);
  const got = a === -1 && b === -1 ? [] : [a, b];
  const ok = JSON.stringify(got) === JSON.stringify(c.expected);
  if (ok) { passed++; console.log(`  [PASS] case ${i}`); }
  else console.log(`  [FAIL] case ${i}  expected=${JSON.stringify(c.expected)} got=${JSON.stringify(got)}`);
});
console.log(`${passed}/${cases.length} passed`);
process.exit(passed === cases.length ? 0 : 1);

