// asm-riscv64-blink.mjs -- run the guest riscv64 `as` and `ld` under Blink.
//
// Blink emulates x86-64 and never executes riscv64. What it runs is the
// TOOLCHAIN: riscv64-as.elf and riscv64-ld.elf are x86-64 musl-static binaries
// that EMIT riscv64. The emitted code is executed by libriscv (see
// asm-riscv64-core.mjs). Two emulators, deliberately -- Blink is already
// vendored and already proven at exactly this job by Bx-7 and Bx-10.
//
// SIMPLER than asm-arm64-blink.mjs: that one had to parse PT_LOADs and symbols
// out of the linked ELF so VIXL could be handed raw bytes at a 4K-aligned base.
// libriscv takes the ELF whole and owns its own memory, so there are no ELF
// readers here at all.
//
// -z max-page-size=4096 is kept for the same reason as Bx-10: ld defaults to a
// 64 KB page and inflates the image.
//
// Full findings: docs/libriscv-riscv64.md.

import blinkenlib from "./vendor/asm-riscv64/blinkenlib.js";

const SIGTRAP = 5, BLINK_PREEMPT = 40;

export class RiscvBlink {
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
    if (sig === SIGTRAP && code === BLINK_PREEMPT) {
      requestAnimationFrame(() => this.Module._blinkenlib_preempt_resume());
      return;
    }
    // Anything else is a dead guest. Resolve, or the caller hangs to its timeout
    // with the reason trapped inside this.log.
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

  // -march=rv64gc: the G is the base+FD set, the C is compressed. The assembler
  // compresses AUTOMATICALLY -- plain "add a0,a0,a1 / ret" becomes two 2-byte
  // instructions -- which is why the vendored libriscv MUST be built with
  // RISCV_EXT_C=ON. With it OFF, libriscv rejects the ELF at LOAD.
  assemble(asm) {
    this.log = ""; this.phase = "ASSEMBLING";
    this.Module.FS.writeFile("/assembly.s", asm);
    return this._run("/assembler", "/assembler -march=rv64gc -mabi=lp64d /assembly.s -o /program.o");
  }

  // RISC-V needs the link even for purely local branches: linker RELAXATION
  // means the assembler emits R_RISCV_RVC_BRANCH / R_RISCV_RVC_JUMP relocations
  // the linker resolves. No aarch64 analogue.
  link(entry) {
    this.log = ""; this.phase = "LINKING";
    return this._run("/linker",
      "/linker /program.o -o /program -e " + entry + " -z max-page-size=4096");
  }

  readLinked() { return this.Module.FS.readFile("/program"); }
}
