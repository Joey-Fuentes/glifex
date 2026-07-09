#!/usr/bin/env node
// CP/M diagnostic harness for the Glifex 8080 core.
// Loads a .COM at 0x0100, stubs BDOS (C=2 putchar, C=9 print-$-string) by
// intercepting PC=0x0005, halts on JMP 0x0000 (warm boot). Reports insns,
// T-state cycles, peak stack depth, and working-set bytes (writes outside
// the program image). Usage:
//   node harness8080.mjs <rom.com> [--expect-cycles N] [--quiet]
//   node harness8080.mjs --suite <dir>          # fast three
//   node harness8080.mjs --suite <dir> --full   # + 8080EXM (long)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Cpu8080 } from "./cpu8080.mjs";

const EXPECT = { // known-good totals (superzazu/8080 reference harness)
  "TST8080.COM": 4924, "8080PRE.COM": 7817,
  "CPUTEST.COM": 255653383, "8080EXM.COM": 23803381171, // cycle totals fit JS numbers (< 2**53)
};

export function runCom(bytes, { onChar = () => {}, maxCycles = 30_000_000_000 } = {}) {
  // Stub convention matches superzazu/8080's reference harness so the
  // published known-good cycle totals apply verbatim:
  //   0x0000: OUT 0        -> end of test (warm-boot target)
  //   0x0005: OUT 1; RET   -> BDOS call (C=2 putchar, C=9 print $-string)
  const mem = new Uint8Array(65536);
  mem.set(bytes, 0x0100);
  mem[0x0000] = 0xD3; mem[0x0001] = 0x00;
  mem[0x0005] = 0xD3; mem[0x0006] = 0x01; mem[0x0007] = 0xC9;
  const progEnd = 0x0100 + bytes.length;
  const written = new Uint8Array(65536);
  let done = false;
  const bus = {
    read: (a) => mem[a],
    write: (a, v) => { mem[a] = v; written[a] = 1; },
    out: (port, _a) => {
      if (port === 0) { done = true; return; }
      const c = cpu.c;
      if (c === 2) onChar(cpu.e);
      else if (c === 9) { let a = cpu.de; while (mem[a] !== 0x24) { onChar(mem[a]); a = (a + 1) & 0xFFFF; } }
    },
  };
  const cpu = new Cpu8080(bus);
  cpu.pc = 0x0100; cpu.sp = 0xF000;
  let minSp = cpu.sp;
  while (!done && !cpu.halted) {
    cpu.step();
    if (cpu.sp < minSp && cpu.sp > 0x0100) minSp = cpu.sp; // ignore wild wraps
    if (cpu.cycles > maxCycles) throw new Error("cycle budget exceeded -- runaway program?");
  }
  let ws = 0;
  for (let a = 0; a < 65536; a++) if (written[a] && (a < 0x0100 || a >= progEnd)) ws++;
  return { insns: cpu.insns, cycles: cpu.cycles, peakStack: 0xF000 - minSp, workingSet: ws };
}

function runFile(path, quiet) {
  const name = path.split("/").pop().toUpperCase();
  let out = "";
  const t0 = Date.now();
  const r = runCom(readFileSync(path), { onChar: (ch) => { out += String.fromCharCode(ch); if (!quiet) process.stdout.write(String.fromCharCode(ch)); } });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  if (!quiet) process.stdout.write("\n");
  const bad = /FAILED|ERROR/i.test(out) && !/CPU IS OPERATIONAL|complete/i.test(out);
  const exp = EXPECT[name];
  const cycOk = exp === undefined || r.cycles === exp;
  console.log(`[${name}] insns=${r.insns} cycles=${r.cycles}${exp !== undefined ? ` (expected=${exp} ${cycOk ? "OK" : "MISMATCH"})` : ""} peakStack=${r.peakStack} ws=${r.workingSet} wall=${dt}s`);
  if (bad) throw new Error(`${name}: diagnostic reported failure`);
  if (!cycOk) throw new Error(`${name}: cycle total mismatch (got ${r.cycles}, expected ${exp})`);
}

const args = process.argv.slice(2);
if (args[0] === "--suite") {
  const dir = args[1];
  const quiet = args.includes("--quiet");
  const roms = ["TST8080.COM", "8080PRE.COM", "CPUTEST.COM"];
  if (args.includes("--full")) roms.push("8080EXM.COM");
  for (const r of roms) runFile(join(dir, r), quiet);
  console.log(`suite PASS (${roms.length} ROMs)`);
} else if (args[0] && !args[0].startsWith("--")) {
  runFile(args[0], args.includes("--quiet"));
} else {
  console.log("usage: harness8080.mjs <rom.com> | --suite <dir> [--full] [--quiet]");
  process.exit(2);
}
