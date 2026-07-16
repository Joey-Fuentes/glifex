// drive.mjs <build-dir> <kata.elf> <expected> [a0] [a1]
// Set registers, jump to the symbol, single-step to ret, read a0. The Bx-7 ->
// Bx-10 pattern, ported a third time.
import { readFileSync } from "node:fs";
import path from "node:path";
const DIR = process.argv[2], ELF = process.argv[3], WANT = BigInt(process.argv[4]);
const A0 = BigInt(process.argv[5] ?? "7"), A1 = BigInt(process.argv[6] ?? "5");

const M = await (await import(path.resolve(DIR, "gx_rv.mjs"))).default();
const elf = new Uint8Array(readFileSync(ELF));
const p = M._malloc(elf.length);
M.HEAPU8.set(elf, p);
const rc = M._gx_load_elf(p, elf.length);
if (rc !== 0) { console.log("   gx_load_elf -> " + rc + "  FAIL"); process.exit(1); }

const np = M._malloc(8);
M.HEAPU8.set(new TextEncoder().encode("kata\0"), np);
const kata = M._gx_sym(np);
if (kata === 0n) { console.log("   symbol 'kata' not found  FAIL"); process.exit(1); }

M._gx_write_x(10, A0);
M._gx_write_x(11, A1);
M._gx_write_x(1, 0n);          // ra = 0 -> a ret to 0 is the sentinel, VIXL's kEndOfSimAddress
M._gx_set_pc(kata);
let steps = 0;
while (steps < 100000) {
  if (M._gx_step() !== 0) break;
  steps++;
  if (M._gx_get_pc() === 0n) break;
}
const a0 = M._gx_read_x(10);
const ok = a0 === WANT;
console.log("   " + (ok ? "PASS" : "FAIL") + "  kata@0x" + kata.toString(16) +
  "  steps=" + steps + "  icount=" + M._gx_icount() + "  a0=" + a0 + "  want=" + WANT);
process.exit(ok ? 0 : 1);
