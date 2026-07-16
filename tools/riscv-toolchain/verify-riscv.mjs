// verify-riscv.mjs <vendor-dir>
// Prove the BUILT artifact executes RV64GC. The size checks in the vendor step
// prove a fetch succeeded, not that the runtime is correct -- and the one
// setting that silently breaks everything (RISCV_EXT_C) fails at ELF LOAD, so
// only running something catches it.
//
// Bx-10 learned this the hard way twice: nothing verified VIXL's 1 MB guest
// stack until a probe was added, and nothing verified arm64's Lab ladder until
// it broke on the live site.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const DIR = process.argv[2];
const tmp = os.tmpdir();

// '#' is RISC-V's comment char. aarch64 uses '//', and every kata failed once on
// exactly that -- the assembler recipe transferring does not mean the syntax does.
const KATA = ["# kata(a, b) -> a + b", "    .text", "    .globl kata", "kata:",
              "    add     a0, a0, a1", "    ret", ""].join("\n");
const s = path.join(tmp, "gxrv.s"), o = path.join(tmp, "gxrv.o"), elf = path.join(tmp, "gxrv.elf");
writeFileSync(s, KATA);
execFileSync(path.join(DIR, "riscv64-as.elf"), ["-march=rv64gc", "-mabi=lp64d", s, "-o", o]);
execFileSync(path.join(DIR, "riscv64-ld.elf"), [o, "-o", elf, "-e", "kata", "-z", "max-page-size=4096"]);

const M = await (await import(path.resolve(DIR, "gx_rv.mjs"))).default();
if (M._gx_ptr_bytes() !== 4) { console.error("## FAIL not a wasm32 build"); process.exit(1); }

const buf = new Uint8Array(readFileSync(elf));
const p = M._malloc(buf.length);
M.HEAPU8.set(buf, p);
const rc = M._gx_load_elf(p, buf.length);
if (rc !== 0) {
  console.error("## FATAL gx_load_elf -> " + rc);
  console.error("##       The most likely cause is RISCV_EXT_C=OFF: -march=rv64gc");
  console.error("##       compresses automatically, and libriscv rejects a compressed");
  console.error("##       ELF at LOAD. build-libriscv.sh must pass -DRISCV_EXT_C=ON.");
  process.exit(1);
}
const np = M._malloc(8);
M.HEAPU8.set(new TextEncoder().encode("kata\0"), np);
const kata = M._gx_sym(np);
if (kata === 0n) { console.error("## FAIL symbol 'kata' not found"); process.exit(1); }

M._gx_write_x(10, 7n);
M._gx_write_x(11, 5n);
M._gx_write_x(1, 0n);          // ra = 0 -> a ret to 0 is the sentinel
M._gx_set_pc(kata);
let steps = 0;
while (steps < 1000) { if (M._gx_step() !== 0) break; steps++; if (M._gx_get_pc() === 0n) break; }
const a0 = M._gx_read_x(10);
console.log("## riscv64 probe: steps=" + steps + " icount=" + M._gx_icount() + " a0=" + a0 + " (want 12)");
if (a0 !== 12n) { console.error("## FATAL the built runtime does not execute RV64GC correctly"); process.exit(1); }
console.log("## verified in the ARTIFACT: libriscv executes RV64GC, compressed instructions decode");
