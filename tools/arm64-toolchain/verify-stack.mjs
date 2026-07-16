// verify-stack.mjs <vendor-dir>
// Prove the BUILT artifact gives the guest a 1 MB stack. The source says
// 1 << 20; only the wasm can say what it does.
//
// Why this exists: nothing else checks it. The vendor step's size assertions
// prove a fetch succeeded, not that the runtime is correct. VIXL's default is
// 8 KB usable (measured: the 9th KB trips "Attempt to write to stack guard
// region"), which is tiny for assembly and an INVISIBLE cliff -- native gives
// 8 MB, so an over-deep .s passes on the CLI and traps only in the browser.
// If gx_vixl.cc ever loses its SimStack argument, 002's hash table breaks
// around n=256 and looks like a hash bug.
//
// The probe FILLS AND READS BACK the claimed region. An earlier version touched
// only [sp] and cheerfully reported 4 MB -- it had sailed past the guard into
// unrelated memory. A check that cannot fail is not a check.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const DIR = process.argv[2];
const WANT_KB = 1024;
const tmp = os.tmpdir();

const PROBE = [
  "    .text", "    .globl probe", "probe:",
  "    mov     x1, sp",
  "    sub     sp, sp, x0",
  "    mov     x2, sp", "    mov     x3, x0", "    lsr     x3, x3, #3", "    mov     x4, #0",
  "1:  str     x4, [x2], #8", "    add     x4, x4, #1", "    subs    x3, x3, #1", "    b.ne    1b",
  "    mov     x2, sp", "    mov     x3, x0", "    lsr     x3, x3, #3", "    mov     x4, #0",
  "2:  ldr     x5, [x2], #8", "    cmp     x5, x4", "    b.ne    3f",
  "    add     x4, x4, #1", "    subs    x3, x3, #1", "    b.ne    2b",
  "    mov     sp, x1", "    mov     x0, #1", "    ret",
  "3:  mov     sp, x1", "    mov     x0, #0", "    ret", "",
].join("\n");

const s = path.join(tmp, "gxstack.s"), o = path.join(tmp, "gxstack.o"), elf = path.join(tmp, "gxstack.elf");
writeFileSync(s, PROBE);
execFileSync(path.join(DIR, "aarch64-as.elf"), [s, "-o", o]);
execFileSync(path.join(DIR, "aarch64-ld.elf"), [o, "-o", elf, "-z", "max-page-size=4096", "-e", "probe"]);

const M = await (await import(path.resolve(DIR, "gx_vixl.mjs"))).default();
if (M._gx_init() !== 0) { console.error("## FAIL gx_init"); process.exit(1); }

const buf = new Uint8Array(readFileSync(elf));
const d = new DataView(buf.buffer);
const ph = Number(d.getBigUint64(0x20, true)), pe = d.getUint16(0x36, true), pn = d.getUint16(0x38, true);
const segs = [];
for (let i = 0; i < pn; i++) {
  const q = ph + i * pe;
  if (d.getUint32(q, true) === 1)
    segs.push({ off: Number(d.getBigUint64(q + 8, true)), va: Number(d.getBigUint64(q + 16, true)),
                fsz: Number(d.getBigUint64(q + 32, true)), msz: Number(d.getBigUint64(q + 40, true)) });
}
const minva = Math.min(...segs.map((x) => x.va));
const span = Math.max(...segs.map((x) => x.va + x.msz)) - minva;
const raw = Number(M._malloc(span + 8192)), base = (raw + 4095) & ~4095;
for (const x of segs) {
  const dst = base + (x.va - minva);
  M.HEAPU8.fill(0, dst, dst + x.msz);
  M.HEAPU8.set(buf.subarray(x.off, x.off + x.fsz), dst);
}
// Use the ELF's real entry point (e_entry, set by ld -e probe). Assuming the
// symbol sits at the start of .text is how the first version of this failed a
// build that was correct -- a guard that red-lights a good artifact is worse
// than no guard.
const eEntry = Number(d.getBigUint64(0x18, true));
const entry = base + (eEntry - minva);

function depthOK(kb) {
  M._gx_reset();
  M._gx_write_x(0, BigInt(kb * 1024));
  M._gx_set_pc(BigInt(entry));
  let n = 0;
  try { while (n < 50_000_000) { if (M._gx_step() === 1) break; n++; } }
  catch { return false; }
  return M._gx_read_x(0) === 1n;
}

const ok = depthOK(WANT_KB);
console.log("## guest stack probe: " + WANT_KB + " KB -> " + (ok ? "OK" : "FAILED"));
if (!ok) {
  console.error("## FATAL the built runtime does not give the guest " + WANT_KB + " KB of stack.");
  console.error("##       gx_vixl.cc must construct the Simulator with");
  console.error("##       SimStack(kGuestStackBytes).Allocate() -- without it VIXL");
  console.error("##       silently falls back to 8 KB and 002 breaks near n=256.");
  process.exit(1);
}
console.log("## guest stack verified in the ARTIFACT, not just the source");
