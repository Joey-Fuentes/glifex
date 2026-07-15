// drive.mjs -- run the real aarch64-as-assembled katas against the VIXL wasm.
// usage: node drive.mjs <out-dir> <kata-dir>
//
// Every value crossing the boundary is a u64 -> BigInt under emscripten's
// WASM_BIGINT (and pointers are BigInt too under -sMEMORY64), so normalise
// hard at the edges rather than trusting either mode.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
const KATAS = process.argv[3];

const big = (v) => (typeof v === "bigint" ? v : BigInt(v));
const num = (v) => (typeof v === "bigint" ? Number(v) : v);

const factory = (await import(path.resolve(OUT, "gx_vixl.mjs"))).default;
const M = await factory();

console.log("## sizeof(uintptr_t) in this build:", M._gx_ptr_bytes());
if (M._gx_init() !== 0) { console.log("## FATAL: gx_init failed"); process.exit(1); }

// Put a blob in linear memory and hand back its address.
function place(bytes) {
  const p = num(M._malloc(bytes.length));
  M.HEAPU8.set(bytes, p);
  return p;
}
function placeU64(values) {
  const buf = new Uint8Array(values.length * 8);
  const dv = new DataView(buf.buffer);
  values.forEach((v, i) => dv.setBigUint64(i * 8, big(v), true));
  return place(buf);
}
function placeS32(values) {
  const buf = new Uint8Array(values.length * 4);
  const dv = new DataView(buf.buffer);
  values.forEach((v, i) => dv.setInt32(i * 4, v, true));
  return place(buf);
}

function callKata(name, setup) {
  const code = new Uint8Array(readFileSync(path.join(KATAS, name + ".bin")));
  const entry = place(code);
  M._gx_reset();
  setup();                       // caller seeds x0..x7 per AAPCS64
  M._gx_run_from(big(entry));
  return M._gx_read_x(0);
}

const results = [];
function check(label, got, want) {
  const ok = big(got) === big(want);
  results.push(ok);
  console.log((ok ? "## PASS " : "## FAIL ") + label + "  got=" + got + " want=" + want);
}

// ---- gate 1: does anything execute at all, and does ret terminate?
check("add(7,5)", callKata("add", () => {
  M._gx_write_x(0, 7n); M._gx_write_x(1, 5n);
}), 12n);

// ---- gate 2: THE memory-model probe (host-pointer loads, stp/ldp frame)
{
  const buf = placeU64([100n, 250n]);
  check("memops(ptr)->350", callKata("memops", () => {
    M._gx_write_x(0, big(buf));
  }), 350n);
}

// ---- gate 3: branches + madd
check("loop(n=5) sum sq", callKata("loop", () => {
  M._gx_write_x(1, 5n);
}), 55n);

// ---- gate 4: flags survive cmp -> csel
check("csel max(9,4)", callKata("csel", () => {
  M._gx_write_x(0, 9n); M._gx_write_x(1, 4n);
}), 9n);
check("csel max(4,9)", callKata("csel", () => {
  M._gx_write_x(0, 4n); M._gx_write_x(1, 9n);
}), 9n);

// ---- gate 5: basic NEON
{
  const buf = placeS32([1, 2, 3, 4]);
  check("neon addv[1,2,3,4]", callKata("neon", () => {
    M._gx_write_x(0, big(buf));
  }), 10n);
}

// ---- gate 6: single-step -- the thing that makes a GDB-style stepper possible
{
  const code = new Uint8Array(readFileSync(path.join(KATAS, "loop.bin")));
  const entry = place(code);
  M._gx_reset();
  M._gx_write_x(1, 3n);
  M._gx_set_pc(big(entry));
  let steps = 0;
  while (steps < 10000) {
    steps++;
    if (M._gx_step() === 1) break;
  }
  const x0 = M._gx_read_x(0);
  const ok = steps > 1 && steps < 10000 && big(x0) === 14n;
  results.push(ok);
  console.log((ok ? "## PASS " : "## FAIL ") +
    "single-step loop(n=3) -> x0=" + x0 + " want=14 in " + steps + " steps");
}

const passed = results.filter(Boolean).length;
console.log("## ================================");
console.log("## VIXL SPIKE: " + passed + "/" + results.length + " gates passed");
console.log("## ================================");
process.exit(passed === results.length ? 0 : 1);
