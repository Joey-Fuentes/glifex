// Retro toolchain smoke (assemble half): prove customasm works in this
// environment by assembling a tiny 6502 program and checking the emitted bytes
// against known-correct machine code. No CPU core / no npm deps here -- execution
// (cpu6502) is proven when the browser runtime lands. Green => customasm is good.
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A minimal inline 6502 ruledef (just the 3 ops we test) keeps this self-contained
// and independent of customasm's bundled <std/6502.asm> path (which we pin in V2).
const SRC = `#ruledef {
    lda #{v: u8}  => 0xA9 @ v
    sta {a: u8}   => 0x85 @ a
    brk           => 0x00
}
lda #0x05
sta 0x12
brk
`;
const EXPECT = [0xA9, 0x05, 0x85, 0x12, 0x00];   // hand-verified 6502 machine code

const dir = mkdtempSync(join(tmpdir(), "gxasm-"));
const asm = join(dir, "p.asm"), out = join(dir, "p.bin");
writeFileSync(asm, SRC);

let bytes;
try {
  execFileSync("customasm", [asm, "-f", "binary", "-o", out], { stdio: ["ignore", "pipe", "pipe"] });
  bytes = [...new Uint8Array(readFileSync(out))];
} catch (e) {
  console.error("GLIFEX_RETRO_FAIL: customasm did not assemble.");
  console.error(String(e.stderr || e.message || e));
  process.exit(1);
}

const hex = (a) => a.map((b) => b.toString(16).padStart(2, "0")).join(" ");
console.log("customasm output:", hex(bytes));
console.log("expected 6502:   ", hex(EXPECT));
const ok = bytes.length === EXPECT.length && bytes.every((b, i) => b === EXPECT[i]);
if (!ok) { console.error("GLIFEX_RETRO_FAIL: byte mismatch"); process.exit(1); }
console.log("GLIFEX_RETRO_OK: customasm assembles 6502 correctly");
