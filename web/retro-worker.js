/*
 * Glifex retro CPU emulator worker (6502 / SM83 / i8080). Runs
 * assembly (via the vendored customasm.wasm) and emulation (the pure-JS
 * CPU core for whichever ISA this worker instance is dedicated to) off
 * the main thread, mirroring web/runtimes.js's makeRetroLoader() logic
 * exactly -- same assembler calls, same RAM/bus setup, same per-case
 * timing, same result shape. That logic isn't duplicated by accident:
 * it's copied here verbatim (not reimplemented from a description) so
 * behavior matches exactly, not approximately.
 *
 * Why this exists: L3 (docs/ROADMAP.md) closed the main-thread hang
 * risk for JavaScript (both the Complexity Lab's Analyze button and the
 * plain Run button) -- retro was the next, most directly testable
 * target (pure JS emulator cores, no vendored dependency for EXECUTION
 * itself, only for assembly). Only i8080 has real cycle counting today
 * (confirmed exact via cpu8080.test.mjs's SingleStepTests-derived
 * assertions) -- 6502/SM83 fall back to wall-clock timing, an
 * adaptive-repeat loop structurally similar to JS's own pre-fix
 * pattern. That similarity is a real, honest observation, not a
 * confirmed problem for retro specifically -- no evidence (smoke test
 * failures, reported issues) that it's actually caused trouble there,
 * unlike JS where the failure was directly reproduced and root-caused.
 * Deliberately out of scope here: this migration is about hang safety
 * (an assembly bug like an unconditional jump-to-self, or code that
 * genuinely runs past maxSteps before a runaway check catches it)
 *  -- NOT a retry of JS's measurement-noise fixes, which would be a
 * separate, later piece of work if it ever proves necessary.
 *
 * Module worker (not classic): the CPU cores (web/retro/cpu6502.mjs
 * etc.) are genuine ES modules (`export class Cpu6502`), which
 * importScripts() -- what the classic-script workers (js-lab-worker.js,
 * c-worker.js) use -- can't load. Spawned with `new Worker(url, {type:
 * "module"})` (see runtimes.js's callWorker, extended with an optional
 * workerOptions parameter specifically for this).
 *
 * One worker instance is dedicated to ONE cfg (one retro language) for
 * its whole lifetime -- makeRetroLoader's own closure owns a separate,
 * persistent { worker: null } state per language, so 6502/SM83/i8080
 * never share a worker instance. The assembler/core/ruledef load ONCE
 * per worker instance (cached below, keyed by cfg.name defensively,
 * though in practice a worker only ever sees one cfg) and are reused
 * across every subsequent 'run' message -- avoiding re-fetching
 * customasm.wasm or re-importing the core module on every single Run
 * click.
 *
 * Message in : { id:'run', cfg, source, cases }
 * Message out: { id:'result', ...same shape makeRetroLoader's run() already returns }
 *            | { id:'error', error }
 */

// bigIntSafe/eq copied verbatim from runtimes.js (see that file's own
// comment for why the replacer exists) -- not imported, since a module
// worker CAN import from a sibling .mjs but runtimes.js itself is a
// large, classic (non-module) IIFE script, not set up to be imported.
const bigIntSafe = (_, v) => (typeof v === "bigint" ? Number(v) : v);
const eq = (a, b) => {
  try {
    return JSON.stringify(a, bigIntSafe) === JSON.stringify(b, bigIntSafe);
  } catch {
    return false;
  }
};

const cache = {};   // cfg.name -> { casm, core, RULEDEF_OK, PREAMBLE, mkStr, rdStr }

async function loadForCfg(cfg) {
  if (cache[cfg.name]) return cache[cfg.name];
  const casm = (await WebAssembly.instantiate(
    await (await fetch("vendor/asm-6502/customasm.wasm")).arrayBuffer()
  )).instance.exports;
  const core = (await import(cfg.coreModule))[cfg.coreExport];
  const rres = await fetch(cfg.ruledefPath);
  const RULEDEF = rres.ok ? await rres.text() : "";
  const RULEDEF_OK = RULEDEF.includes(cfg.ruledefMarker);
  const PREAMBLE = RULEDEF + "\n#bankdef prog { #addr " + cfg.entry + ", #outp 0 }\n#bank prog\n";
  const enc = new TextEncoder(), dec = new TextDecoder();
  const mkStr = (str) => { const b = enc.encode(str); const q = casm.wasm_string_new(b.length); for (let i = 0; i < b.length; i++) casm.wasm_string_set_byte(q, i, b[i]); return q; };
  const rdStr = (q) => { const n = casm.wasm_string_get_len(q); const o = new Uint8Array(n); for (let i = 0; i < n; i++) o[i] = casm.wasm_string_get_byte(q, i); return dec.decode(o); };
  cache[cfg.name] = { casm, core, RULEDEF_OK, PREAMBLE, mkStr, rdStr };
  return cache[cfg.name];
}

function assemble(loaded, cfg, source) {
  const { casm, PREAMBLE, mkStr, rdStr } = loaded;
  const fp = mkStr("hexstr"), ap = mkStr(PREAMBLE + source), op = casm.wasm_assemble(fp, ap);
  const text = rdStr(op);
  casm.wasm_string_drop(fp); casm.wasm_string_drop(ap); casm.wasm_string_drop(op);
  const clean = text.replace(/\x1b\[[0-9;]*m/g, "");
  const hex = clean.split("\n").map((l) => l.trim()).filter((l) => l && /^[0-9a-fA-F]+$/.test(l)).join("");
  if (!hex || hex.length % 2) {
    const raw = clean.trim();
    if (!raw) return { error: "program assembled to 0 bytes -- did you write any instructions? (comments alone produce no code)" };
    return { error: raw.slice(0, 800) };
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return { bytes };
}

async function runRetro(cfg, source, cases) {
  const loaded = await loadForCfg(cfg);
  if (!loaded.RULEDEF_OK) return { error: cfg.name + " ruledef failed to load (" + cfg.ruledefPath + " missing or invalid) -- try a hard refresh; if it persists, the deploy is incomplete." };
  const asm = assemble(loaded, cfg, source);
  if (!asm.bytes) return { error: cfg.name + " assembly error: " + (asm.error || "unknown (no bytes, no message)") };
  const progEnd = cfg.entry + asm.bytes.length;
  const ioStart = Math.min(cfg.inAddr, cfg.outAddr);
  if (progEnd > 0x10000) return { error: cfg.name + ": program is " + asm.bytes.length + " bytes -- runs past the top of the 64K address space from entry 0x" + cfg.entry.toString(16) };
  if (cfg.entry < ioStart && progEnd > ioStart) return { error: cfg.name + ": program is " + asm.bytes.length + " bytes -- collides with the I/O region at 0x" + ioStart.toString(16) + " (max " + (ioStart - cfg.entry) + " bytes)" };
  const core = loaded.core;
  let totalInsns = 0, totalCycles = 0, hasCycles = false, peakSpace = 0;
  const results = cases.map((c, i) => {
    const vals = Array.isArray(c.input) ? c.input : Object.values(c.input);
    const ram = new Uint8Array(0x10000);
    asm.bytes.forEach((b, k) => (ram[(cfg.entry + k) & 0xffff] = b));
    vals.forEach((v, k) => (ram[(cfg.inAddr + k) & 0xffff] = v & 0xff));
    let touched = [];
    function runOnce() {
      for (const a of touched) ram[a] = 0;
      touched = [];
      const bus = {
        read: (a) => ram[a & 0xffff],
        write: (a, v) => { const addr = a & 0xffff; ram[addr] = v & 0xff; touched.push(addr); },
        readWord: (a) => ram[a & 0xffff] | (ram[(a + 1) & 0xffff] << 8),
      };
      const cpu = new core(bus);
      cpu.pc = cfg.entry;
      if (cfg.initSp !== undefined) cpu.sp = cfg.initSp;
      let steps = 0;
      while (!cpu.halted) {
        if (steps++ > cfg.maxSteps) throw new Error("runaway (no " + cfg.haltName + ")");
        cpu.step();
      }
      const got = ram[cfg.outAddr & 0xffff] | (ram[(cfg.outAddr + 1) & 0xffff] << 8);
      const space = new Set(touched.filter((a) => a < cfg.entry || a >= progEnd)).size;
      return { got, insns: steps, space, cycles: typeof cpu.cycles === "number" ? cpu.cycles : null };
    }
    let first;
    try {
      first = runOnce();
    } catch (e) {
      return { i, ok: false, error: String((e && e.message) || e), expected: c.expected };
    }
    if (first.space > peakSpace) peakSpace = first.space;
    totalInsns += first.insns;
    if (first.cycles != null) { totalCycles += first.cycles; hasCycles = true; }
    const row = { i, ok: eq(first.got, c.expected), got: first.got, expected: c.expected, insns: first.insns, space: first.space };
    if (first.cycles != null) {
      row.cycles = first.cycles;
    } else {
      const c0 = performance.now();
      let cdt = performance.now() - c0;
      if (cdt < 2) {
        let k = 1;
        while (cdt < 2 && k < 1048576) {
          k *= 2;
          const s0 = performance.now();
          for (let q = 0; q < k; q++) runOnce();
          cdt = performance.now() - s0;
        }
        row.tNs = cdt >= 1 ? (cdt * 1e6) / k : null;
      } else {
        row.tNs = cdt * 1e6;
      }
    }
    return row;
  });
  const insnsPerCase = cases.length ? totalInsns / cases.length : 0;
  const out = { results, instructions: Math.round(insnsPerCase), codeBytes: asm.bytes.length, spaceBytes: peakSpace };
  if (hasCycles && cfg.clockHz) {
    const cyclesPerCase = cases.length ? totalCycles / cases.length : 0;
    out.cycles = Math.round(cyclesPerCase);
    out.nsPerCase = cyclesPerCase * (1e9 / cfg.clockHz);
    out.clockHz = cfg.clockHz;
  } else {
    out.nsPerCase = insnsPerCase * 1000;
  }
  return out;
}

self.onmessage = async (e) => {
  const d = e.data || {};
  if (d.id !== "run") return;
  try {
    const out = await runRetro(d.cfg, d.source, d.cases);
    if (out.error) { self.postMessage({ id: "error", error: out.error }); return; }
    self.postMessage({ id: "result", ...out });
  } catch (err) {
    self.postMessage({ id: "error", error: String((err && err.message) || err) });
  }
};

self.onerror = (e) => {
  self.postMessage({ id: "error", error: "worker crashed (uncaught): " + String((e && e.message) || e) });
};
