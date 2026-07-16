// asm-arm64-blink.mjs -- run the guest aarch64 `as` and `ld` under Blink.
//
// Blink emulates x86-64 and always will; it never executes arm64. What it runs
// here is the TOOLCHAIN: aarch64-as.elf and aarch64-ld.elf are x86-64
// musl-static binaries that EMIT aarch64. The emitted code is executed by VIXL
// (see asm-arm64-core.mjs). Two emulators, deliberately -- Blink is already
// vendored and already proven at exactly this job by Bx-7, so the assembler
// half costs no new technology.
//
// Structurally this is web/asm-x86-blink.mjs with one difference: Bx-7 links to
// a runnable x86-64 program and drives it inside Blink, whereas we stop at the
// linked ELF and hand it to VIXL.
//
// Full findings: docs/vixl-arm64.md.

import blinkenlib from "./vendor/asm-arm64/blinkenlib.js";

const SIGTRAP = 5, BLINK_PREEMPT = 40;

export class ArmBlink {
  constructor() { this.log = ""; this.phase = "NONE"; }

  async init(asmUrl, ldUrl) {
    const self = this;
    this.Module = await blinkenlib({
      noInitialRun: true,
      print: (t) => { self.log += t + "\n"; },
      printErr: (t) => { self.log += t + "\n"; },
      preRun: (M) => {
        M.FS.init(
          () => null,
          (c) => { self.log += String.fromCharCode(c); },
          (c) => { self.log += String.fromCharCode(c); },
        );
        M.FS.createPreloadedFile("/", "assembler", asmUrl, true, true);
        M.FS.createPreloadedFile("/", "linker", ldUrl, true, true);
      },
    });
    const M = this.Module;
    const sigcb = M.addFunction((sig, code) => this._onSignal(sig, code), "vii");
    const exitcb = M.addFunction((code) => this._onExit(code), "vi");
    M.callMain([sigcb.toString(), exitcb.toString()]);
    this.memory = M.wasmExports.memory;
    this.argcPtr = M._blinkenlib_get_argc_string();
    this.argvPtr = M._blinkenlib_get_argv_string();
    this.prognamePtr = M._blinkenlib_get_progname_string();
    this.phase = "READY";
  }

  get memView() { return new DataView(this.memory.buffer); }
  _writeArgStr(ptr, str) {
    const mv = this.memView, n = Math.min(str.length, 199);
    for (let i = 0; i < n; i++) mv.setUint8(ptr + i, str.charCodeAt(i));
    mv.setUint8(ptr + n, 0);
  }
  _setEmuArgs(progname, cmd, argv) {
    this._writeArgStr(this.prognamePtr, progname);
    this._writeArgStr(this.argcPtr, cmd);
    this._writeArgStr(this.argvPtr, argv);
  }

  _onSignal(sig, code) {
    // SIGTRAP/BLINK_PREEMPT is Blink's normal yield -- resume it and carry on.
    if (sig === SIGTRAP && code === BLINK_PREEMPT) {
      requestAnimationFrame(() => this.Module._blinkenlib_preempt_resume());
      return;
    }
    // Any other signal is a dead guest. Resolve, or the caller hangs to its
    // timeout with the reason trapped inside this.log.
    this.log += "[signal sig=" + sig + " code=" + code + "]\n";
    this._exitResolve && this._exitResolve("SIGNAL" + sig);
  }
  _onExit(code) { this._exitResolve && this._exitResolve(code); }

  _run(progname, cmd) {
    return new Promise((res) => {
      this._exitResolve = res;
      requestAnimationFrame(() => {
        this._setEmuArgs(progname, cmd, "");
        try { this.Module._blinkenlib_run_fast(); }
        catch (e) { this.log += "THROW " + e + "\n"; res(-1); }
      });
    });
  }

  assemble(asm) {
    this.log = ""; this.phase = "ASSEMBLING";
    this.Module.FS.writeFile("/assembly.s", asm);
    return this._run("/assembler", "/assembler /assembly.s -o /program.o");
  }

  // -z max-page-size=4096 is not cosmetic: ld defaults to a 64 KB page on
  // aarch64 and parks .data a full page above .text, which took the span VIXL
  // must allocate from 4296 bytes to 65736 for a 200-byte program.
  link(entry) {
    this.log = ""; this.phase = "LINKING";
    return this._run("/linker",
      "/linker /program.o -o /program -z max-page-size=4096 -e " + entry);
  }

  readLinked() { return this.Module.FS.readFile("/program"); }
}

// ---- ELF64 readers. These replace objcopy/nm in the browser. ----

export function elfLoads(buf) {
  const d = new DataView(buf.buffer, buf.byteOffset || 0, buf.byteLength);
  if (!(buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46))
    throw new Error("not an ELF");
  const ph = Number(d.getBigUint64(0x20, true));
  const pe = d.getUint16(0x36, true), pn = d.getUint16(0x38, true);
  const out = [];
  for (let i = 0; i < pn; i++) {
    const o = ph + i * pe;
    if (d.getUint32(o, true) === 1) {  // PT_LOAD
      out.push({
        off: Number(d.getBigUint64(o + 8, true)),
        va: Number(d.getBigUint64(o + 16, true)),
        fsz: Number(d.getBigUint64(o + 32, true)),
        msz: Number(d.getBigUint64(o + 40, true)),
      });
    }
  }
  if (!out.length) throw new Error("no PT_LOAD segments");
  return out;
}

export function elfSymAddr(buf, name) {
  const d = new DataView(buf.buffer, buf.byteOffset || 0, buf.byteLength);
  const shoff = Number(d.getBigUint64(0x28, true));
  const shent = d.getUint16(0x3a, true), shnum = d.getUint16(0x3c, true);
  const dec = new TextDecoder();
  for (let i = 0; i < shnum; i++) {
    const sh = shoff + i * shent;
    if (d.getUint32(sh + 4, true) === 2) {  // SHT_SYMTAB
      const so = Number(d.getBigUint64(sh + 0x18, true));
      const ss = Number(d.getBigUint64(sh + 0x20, true));
      const se = Number(d.getBigUint64(sh + 0x38, true));
      const stroff = Number(d.getBigUint64(shoff + d.getUint32(sh + 0x28, true) * shent + 0x18, true));
      for (let o = so; o < so + ss; o += se) {
        const n = stroff + d.getUint32(o, true);
        let e = n; while (buf[e] !== 0) e++;
        if (dec.decode(buf.subarray(n, e)) === name) return Number(d.getBigUint64(o + 8, true));
      }
    }
  }
  throw new Error("symbol not found: " + name);
}
