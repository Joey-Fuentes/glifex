// Retro toolchain smoke: proves customasm (assemble) + cpu6502 (execute) work
// together in this environment. Run in CI and locally BEFORE the browser 6502
// runtime is switched on. Prints GLIFEX_RETRO_OK on success; non-zero on any gap.
//
// Deps (vendored by web/fetch-runtimes.mjs, or npm i @whscullin/cpu6502; customasm
// via `cargo install customasm`). This is the "prove-then-enable" gate.
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENTRY = 0x0600;
// nth-fib(n) in 6502: inputs at $10; result at $12; halt on BRK. Uses customasm's
// bundled 6502 instruction set (#include <std/6502.asm>) -- we author no opcodes.
const SRC = `#include <std/6502.asm>
#bankdef prog { #addr 0x0600, #size 0x200, #outp 0 }
#bank prog
        ldy #0          ; a = 0  (in Y for brevity via zp)
        lda #0
        sta $12         ; result = fib(0) placeholder
        ldx $10         ; n
        beq done
        lda #0          ; a
        sta $13         ; a
        lda #1
        sta $14         ; b
loop:   lda $13
        clc
        adc $14         ; a+b
        pha
        lda $14
        sta $13         ; a = b
        pla
        sta $14         ; b = a+b
        dex
        bne loop
        lda $13
        sta $12         ; result = a
done:   brk
`;

function assemble(src) {
  const dir = mkdtempSync(join(tmpdir(), "gxasm-"));
  const asm = join(dir, "p.asm"), out = join(dir, "p.bin");
  writeFileSync(asm, src);
  // customasm CLI: raw binary output. (std/6502.asm ships inside customasm.)
  execFileSync("customasm", [asm, "-f", "binary", "-o", out], { stdio: "pipe" });
  return new Uint8Array(readFileSync(out));
}

async function loadCpu() {
  // cpu6502 exposes a CPU6502 class + a pluggable Memory bus + CpuState (cycles).
  const mod = await import("@whscullin/cpu6502");
  return mod.default || mod.CPU6502 || mod;
}

function makeMemory(ram) {
  return { read: (a) => ram[a & 0xffff], write: (a, v) => { ram[a & 0xffff] = v & 0xff; } };
}

function run(CPU6502, bytes, n) {
  const ram = new Uint8Array(0x10000);
  bytes.forEach((b, i) => (ram[ENTRY + i] = b));
  ram[0x10] = n & 0xff;
  const cpu = new CPU6502({ memory: makeMemory(ram) });
  cpu.reset ? cpu.reset() : null;
  if (cpu.setPC) cpu.setPC(ENTRY); else if ("pc" in cpu) cpu.pc = ENTRY;
  let cycles = 0, steps = 0;
  for (;;) {
    if (steps++ > 100000) throw new Error("runaway (no BRK?)");
    const before = ram[(cpu.pc ?? cpu.getPC?.()) & 0xffff];
    const c = cpu.step ? cpu.step() : cpu.cycle();      // -> cycles for the step
    cycles += (typeof c === "number" ? c : (cpu.cycles ?? 0));
    if (before === 0x00) break;                          // BRK halt
  }
  return { result: ram[0x12], cycles };
}

const fib = (n) => { let a = 0, b = 1; for (let i = 0; i < n; i++) [a, b] = [b, (a + b) & 0xff]; return a; };

(async () => {
  const CPU6502 = await loadCpu();
  const bytes = assemble(SRC);
  console.log(`assembled ${bytes.length} bytes via customasm`);
  let allOk = true;
  for (const n of [0, 1, 5, 7, 10]) {
    const { result, cycles } = run(CPU6502, bytes, n);
    const ok = result === fib(n);
    allOk &&= ok;
    console.log(`  fib(${n}) = ${result} (expect ${fib(n)})  ${cycles} cyc  ${ok ? "ok" : "BAD"}`);
  }
  if (!allOk) { console.error("GLIFEX_RETRO_FAIL"); process.exit(1); }
  console.log("GLIFEX_RETRO_OK");
})().catch((e) => { console.error("GLIFEX_RETRO_FAIL:", e.message); process.exit(1); });
