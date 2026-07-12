// Per-problem host for the WAT track. Core wasm speaks only numbers, so the
// host owns marshalling: it CREATES and sizes linear memory, provides it to
// the module as an imported (env.memory), writes nums[] into it, then calls
//   solve(ptr, len, target) -> (i32, i32)   ;; [i, j], or [-1, -1] if none
// -- a real, native WASM multi-value return, not a packed i64 (see
// clean.wat's own header comment for why that was chosen).
//
// The solutions here IMPORT memory ((import "env" "memory" (memory 0))); they
// do not declare/export their own. So the host must (a) create a memory, (b)
// pass it as env.memory at instantiation, and (c) marshal into THAT memory --
// exactly as web/wat-worker.js does. An earlier version of this file
// instantiated with empty imports and read an EXPORTED memory these modules
// never export, so it could not instantiate at all -- a latent break that
// only surfaced once the CI matrix re-enabled the WAT toolchain (the sole
// place these CLI references run).
import { readFileSync } from "node:fs";

const cases = JSON.parse(readFileSync("../test_cases.json", "utf8"));
const bytes = readFileSync(".glifex.wasm");

// Size memory from the actual cases, mirroring each solution's own power-of-2
// hash-table growth (start 16, double while < 2n) at up to 12 bytes/slot,
// plus the input array -- the same formula web/wat-worker.js uses, so sizing
// is precise (not just "generously large enough") and carries no embedded
// "how big could n get" assumption.
function tableCapacity(n) { let cap = 16; const need = n * 2; while (cap < need) cap *= 2; return cap; }
function maxArrayLen(cs) {
  let max = 0;
  for (const c of cs) for (const v of Object.values((c && c.input) || {})) if (Array.isArray(v) && v.length > max) max = v.length;
  return max;
}
function requiredPages(maxN) {
  const total = maxN * 4 + tableCapacity(maxN) * 12 + 8; // input array + table + alignment padding
  return Math.max(1, Math.ceil(total / 65536) + 1);
}

const memory = new WebAssembly.Memory({ initial: requiredPages(maxArrayLen(cases)) });
const { instance } = await WebAssembly.instantiate(bytes, { env: { memory } });
const { solve } = instance.exports;

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
