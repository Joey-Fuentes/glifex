#!/usr/bin/env node
// Retro CLI harness (6502 / SM83 / i8080). Mirrors web/retro-worker.js: it
// prepends the ISA ruledef + a bankdef at entry (the browser's PREAMBLE),
// assembles the variant's .s with the customasm CLI, then executes the bytes on
// the pure-JS CPU core -- inputs as bytes at inAddr, u16 LE result read from
// outAddr, a halt instruction ends the run. Prints "N/M passed"; exits 0 iff
// every case passes. The arch is inferred from this file's own directory name
// (asm-6502 / sm83 / i8080), so one harness serves all three tracks.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARCH = basename(HERE);
const RETRO = join(HERE, "..", "..", "..", "web", "retro");

// Values copied from runtimes.js's makeRetroLoader cfgs (kept in one place so
// behavior matches the browser exactly, not approximately).
const CFG = {
  "asm-6502": { core: "cpu6502.mjs", cls: "Cpu6502", ruledef: "6502.ruledef.asm", entry: 0x0600, inAddr: 0x10, outAddr: 0x12, maxSteps: 200000 },
  "sm83": { core: "cpuSm83.mjs", cls: "CpuSm83", ruledef: "sm83.ruledef.asm", entry: 0x0100, inAddr: 0xc000, outAddr: 0xc010, maxSteps: 200000 },
  "i8080": { core: "cpu8080.mjs", cls: "Cpu8080", ruledef: "8080.ruledef.asm", entry: 0x0100, inAddr: 0xc000, outAddr: 0xc010, maxSteps: 400000, initSp: 0xf000 },
}[ARCH];
if (!CFG) { console.error("harness.mjs: unknown retro arch dir '" + ARCH + "'"); process.exit(2); }

const variant = process.argv[2] || "practice";
const cases = JSON.parse(readFileSync(join(HERE, "..", "test_cases.json"), "utf8"));
const source = readFileSync(join(HERE, variant + ".s"), "utf8");
const ruledef = readFileSync(join(RETRO, CFG.ruledef), "utf8");

// --- assemble (customasm CLI), same PREAMBLE the browser worker prepends ---
const preamble = ruledef + "\n#bankdef prog { #addr 0x" + CFG.entry.toString(16) + ", #outp 0 }\n#bank prog\n";
const dir = mkdtempSync(join(tmpdir(), "glifex-retro-"));
const asmPath = join(dir, "full.asm");
const binPath = join(dir, "out.bin");
writeFileSync(asmPath, preamble + source);
let bytes;
try {
  execFileSync("customasm", [asmPath, "-f", "binary", "-o", binPath], { stdio: ["ignore", "ignore", "pipe"] });
  bytes = new Uint8Array(readFileSync(binPath));
} catch (e) {
  const msg = String((e && (e.stderr || e.message)) || e).replace(/\x1b\[[0-9;]*m/g, "");
  console.error(ARCH + " assembly failed: " + msg.slice(0, 600));
  process.exit(2);
}

const { [CFG.cls]: Core } = await import(join(RETRO, CFG.core));

let passed = 0;
for (let i = 0; i < cases.length; i++) {
  const c = cases[i];
  const vals = Array.isArray(c.input) ? c.input : Object.values(c.input);
  const ram = new Uint8Array(0x10000);
  bytes.forEach((b, k) => (ram[(CFG.entry + k) & 0xffff] = b));
  vals.forEach((v, k) => (ram[(CFG.inAddr + k) & 0xffff] = v & 0xff));
  const bus = {
    read: (a) => ram[a & 0xffff],
    write: (a, v) => { ram[a & 0xffff] = v & 0xff; },
    readWord: (a) => ram[a & 0xffff] | (ram[(a + 1) & 0xffff] << 8),
  };
  const cpu = new Core(bus);
  cpu.pc = CFG.entry;
  if (CFG.initSp !== undefined) cpu.sp = CFG.initSp;
  let steps = 0;
  let err = null;
  try {
    while (!cpu.halted) {
      if (steps++ > CFG.maxSteps) { err = "runaway (no halt within " + CFG.maxSteps + " steps)"; break; }
      cpu.step();
    }
  } catch (e) { err = String((e && e.message) || e); }
  if (err) { console.log("  [FAIL] case " + i + "  " + err); continue; }
  const got = ram[CFG.outAddr & 0xffff] | (ram[(CFG.outAddr + 1) & 0xffff] << 8);
  const ok = got === c.expected;
  if (ok) passed++;
  console.log("  [" + (ok ? "PASS" : "FAIL") + "] case " + i + (ok ? "" : "  expected=" + JSON.stringify(c.expected) + " got=" + got));
}
console.log(passed + "/" + cases.length + " passed");
process.exit(passed === cases.length ? 0 : 1);
