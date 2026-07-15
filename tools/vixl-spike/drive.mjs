// drive.mjs <out-dir> <kata-dir>
// v3 -- runs 1-2 died on an uncaught "memory access out of bounds" with no
// trace. Now every phase is wrapped and the stack is printed.

import { readFileSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
const KATAS = process.argv[3];

const big = (v) => (typeof v === "bigint" ? v : BigInt(v));
const num = (v) => (typeof v === "bigint" ? Number(v) : v);

function boom(where, e) {
  console.log("## TRAP during " + where);
  console.log("##   " + String(e && e.message ? e.message : e));
  if (e && e.stack) {
    console.log("## ---- stack ----");
    console.log(String(e.stack).split("\n").slice(0, 25).join("\n"));
  }
}

let M;
try {
  const factory = (await import(path.resolve(OUT, "gx_vixl.mjs"))).default;
  M = await factory();
} catch (e) {
  boom("module instantiation", e);
  process.exit(1);
}

console.log("## sizeof(uintptr_t) in this build: " + M._gx_ptr_bytes());

// The breadcrumbs from gx_vixl.cc print here. The LAST [gx] line before a trap
// names the guilty construction step.
try {
  const rc = M._gx_init();
  if (rc !== 0) { console.log("## gx_init returned " + rc); process.exit(1); }
  console.log("## gx_init OK -- guest sp = 0x" + M._gx_stack_base().toString(16));
} catch (e) {
  boom("gx_init", e);
  process.exit(1);
}

function place(bytes) {
  const p = num(M._malloc(bytes.length));
  M.HEAPU8.set(bytes, p);
  return p;
}
function placeU64(values) {
  const b = new Uint8Array(values.length * 8);
  const dv = new DataView(b.buffer);
  values.forEach((v, i) => dv.setBigUint64(i * 8, big(v), true));
  return place(b);
}
function placeS32(values) {
  const b = new Uint8Array(values.length * 4);
  const dv = new DataView(b.buffer);
  values.forEach((v, i) => dv.setInt32(i * 4, v, true));
  return place(b);
}

const results = [];
function kata(name, label, setup, want) {
  try {
    const code = new Uint8Array(readFileSync(path.join(KATAS, name + ".bin")));
    const entry = place(code);
    M._gx_reset();
    setup();
    M._gx_run_from(big(entry));
    const got = M._gx_read_x(0);
    const ok = big(got) === big(want);
    results.push(ok);
    console.log((ok ? "## PASS " : "## FAIL ") + label + "  got=" + got + " want=" + want);
  } catch (e) {
    results.push(false);
    boom("kata " + label, e);
  }
}

kata("add", "add(7,5)", () => { M._gx_write_x(0, 7n); M._gx_write_x(1, 5n); }, 12n);

try {
  const buf = placeU64([100n, 250n]);
  kata("memops", "memops(ptr)->350", () => { M._gx_write_x(0, big(buf)); }, 350n);
} catch (e) { results.push(false); boom("memops setup", e); }

kata("loop", "loop(n=5) sum sq", () => { M._gx_write_x(1, 5n); }, 55n);
kata("csel", "csel max(9,4)", () => { M._gx_write_x(0, 9n); M._gx_write_x(1, 4n); }, 9n);
kata("csel", "csel max(4,9)", () => { M._gx_write_x(0, 4n); M._gx_write_x(1, 9n); }, 9n);

try {
  const buf = placeS32([1, 2, 3, 4]);
  kata("neon", "neon addv[1,2,3,4]", () => { M._gx_write_x(0, big(buf)); }, 10n);
} catch (e) { results.push(false); boom("neon setup", e); }

try {
  const code = new Uint8Array(readFileSync(path.join(KATAS, "loop.bin")));
  const entry = place(code);
  M._gx_reset();
  M._gx_write_x(1, 3n);
  M._gx_set_pc(big(entry));
  let steps = 0;
  while (steps < 10000) { steps++; if (M._gx_step() === 1) break; }
  const x0 = M._gx_read_x(0);
  const ok = steps > 1 && steps < 10000 && big(x0) === 14n;
  results.push(ok);
  console.log((ok ? "## PASS " : "## FAIL ") + "single-step loop(n=3) -> x0=" + x0 + " want=14 in " + steps + " steps");
} catch (e) { results.push(false); boom("single-step", e); }

const passed = results.filter(Boolean).length;
console.log("## ================================");
console.log("## VIXL SPIKE: " + passed + "/" + results.length + " gates passed");
console.log("## ================================");
process.exit(passed === results.length ? 0 : 1);
