// drive.mjs <out-dir> <kata.elf> <expected>
// THE GATE. Set a0/a1, jump to the kata symbol, single-step to ret, read a0.
// Same shape as web/asm-arm64-core.mjs. If a0 == 12, the RISC-V track has an
// emulator and the Bx-7 -> Bx-10 driving pattern ports a third time.
import { readFileSync } from "node:fs";
import path from "node:path";
const OUT = process.argv[2], ELF = process.argv[3], WANT = BigInt(process.argv[4] || "12");

const M = await (await import(path.resolve(OUT, "gx_rv.mjs"))).default();
console.log("## sizeof(uintptr_t) = " + M._gx_ptr_bytes() + "  (4 = wasm32, as Bx-10 uses)");

const elf = new Uint8Array(readFileSync(ELF));
const p = M._malloc(elf.length);
M.HEAPU8.set(elf, p);
const rc = M._gx_load_elf(p, elf.length);
console.log("## gx_load_elf(" + elf.length + " bytes) -> " + rc);
if (rc !== 0) process.exit(1);

// Ask libriscv for the symbol -- it owns the ELF, so do not re-parse the symtab.
const namePtr = M._malloc(8);
M.HEAPU8.set(new TextEncoder().encode("kata\0"), namePtr);
const kata = M._gx_sym(namePtr);
console.log("## kata @ 0x" + kata.toString(16));
if (kata === 0n) { console.log("## FAIL: symbol kata not found"); process.exit(1); }

M._gx_write_x(10, 7n);   // a0
M._gx_write_x(11, 5n);   // a1
M._gx_write_x(1, 0n);    // ra = 0 -- a ret to 0 is our sentinel, like VIXL's kEndOfSimAddress
M._gx_set_pc(kata);

let steps = 0;
while (steps < 10000) {
  if (M._gx_step() !== 0) break;
  steps++;
  if (M._gx_get_pc() === 0n) break;   // returned
}
const a0 = M._gx_read_x(10);
console.log("## steps=" + steps + "  icount=" + M._gx_icount() + "  a0=" + a0 + "  want=" + WANT);
if (a0 === WANT) {
  console.log("## VERDICT: libriscv runs RV64GC in wasm, driven register-by-register.");
  console.log("##          The Bx-7 -> Bx-10 pattern ports a third time.");
  process.exit(0);
}
console.log("## VERDICT: it built and loaded but did not produce the answer -- read steps/a0 above.");
process.exit(1);
