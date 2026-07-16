// run-kata.mjs <out-dir> <kata.bin>
// Drive an RV64GC .text blob on the libriscv wasm, blinkenlib-style: set
// registers, jump, single-step, read a0. If this returns 12, the RISC-V track
// has an emulator and the Bx-7/Bx-10 pattern ports a third time.
import { readFileSync } from "node:fs";
import path from "node:path";
const OUT = process.argv[2], BIN = process.argv[3];
const M = await (await import(path.resolve(OUT, "gx_rv.mjs"))).default();
console.log("## sizeof(uintptr_t) = " + M._gx_ptr_bytes() + " (4 = wasm32)");

const code = new Uint8Array(readFileSync(BIN));
const p = M._malloc(code.length);
M.HEAPU8.set(code, p);
// libriscv is likely a flat arena with its own guest addressing -- unlike VIXL,
// where a guest address WAS a wasm offset. gx_init takes a base so we can find
// out which it is rather than assume.
const BASE = 0x100000;
const rc = M._gx_init(BigInt(BASE), p, code.length);
console.log("## gx_init -> " + rc);
if (rc !== 0) process.exit(1);

M._gx_write_x(10, 7n);   // a0
M._gx_write_x(11, 5n);   // a1
M._gx_set_pc(BigInt(BASE));
let steps = 0;
while (steps < 1000) {
  if (M._gx_step() !== 0) break;
  steps++;
  const pc = M._gx_get_pc();
  if (Number(pc) < BASE || Number(pc) >= BASE + code.length) break;  // ret left the blob
}
console.log("## steps=" + steps + "  a0=" + M._gx_read_x(10) + "  (want 12)");
process.exit(M._gx_read_x(10) === 12n ? 0 : 1);
