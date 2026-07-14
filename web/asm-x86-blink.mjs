import blinkenlib from "./vendor/asm-x86_64/blinkenlib.js";

// Minimal port of the pieces of x86-64-playground's blink.ts that the spike needs:
// init the emscripten module, assemble+link via the guest as/ld under Blink, and
// (the novel part) drive a guest function directly -- set registers + guest memory,
// jump rip to the symbol, single-step to its ret, read rax. No C, no libc.

const CLKEYS = { // index into the clstruct (u32 each). Must match blinkenlib.h.
  version:0, codemem:1, stackmem:2, readaddr:3, readsize:4, writeaddr:5, writesize:6,
  flags:7, cs__base:8, rip:9, rsp:10, rbp:11, rsi:12, rdi:13,
  r8:14,r9:15,r10:16,r11:17,r12:18,r13:19,r14:20,r15:21, rax:22,rbx:23,rcx:24,rdx:25,
};
const SIGTRAP = 5, BLINK_PREEMPT = 40;

export class Blink {
  constructor(){ this.phase = "NONE"; this.log = ""; this._exitResolve = null; }

  async init(asmUrl, ldUrl){
    const self = this;
    this.Module = await blinkenlib({
      noInitialRun: true,
      print: (t) => { self.log += t + "\n"; self.hostOut = (self.hostOut||"") + t + "\n"; },
      printErr: (t) => { self.log += t + "\n"; self.hostErr = (self.hostErr||"") + t + "\n"; },
      preRun: (M) => {
        M.FS.init(
          () => null, // stdin EOF
          (c) => { self.log += String.fromCharCode(c); }, // stdout
          (c) => { self.log += String.fromCharCode(c); }, // stderr
        );
        M.FS.createPreloadedFile("/", "assembler", asmUrl, true, true);
        M.FS.createPreloadedFile("/", "linker", ldUrl, true, true);
      },
    });
    const M = this.Module;
    const sigcb = M.addFunction((sig,code)=>this._onSignal(sig,code), "vii");
    const exitcb = M.addFunction((code)=>this._onExit(code), "vi");
    M.callMain([sigcb.toString(), exitcb.toString()]);
    this.memory = M.wasmExports.memory;
    this.clsPtr = M._blinkenlib_get_clstruct();
    this.argcPtr = M._blinkenlib_get_argc_string();
    this.argvPtr = M._blinkenlib_get_argv_string();
    this.prognamePtr = M._blinkenlib_get_progname_string();
    this.phase = "READY";
  }

  get memView(){ return new DataView(this.memory.buffer); }           // refreshed each use (memory can grow)
  get structView(){ return new DataView(this.memory.buffer, this.clsPtr, 30*4); }

  _clsU32(key){ return this.structView.getUint32(CLKEYS[key]*4, true); } // -> host ptr to reg storage
  getReg(key){ return this.memView.getBigUint64(this._clsU32(key), true); }
  setReg(key, v){ this.memView.setBigUint64(this._clsU32(key), BigInt(v), true); }

  spy(vaddr){ const v=BigInt(vaddr); const lo=Number(v & 0xffffffffn), hi=Number((v>>32n)&0xffffffffn); return Number(this.Module._blinkenlib_spy_address(lo, hi)); }
  writeGuest(vaddr, bytes){ const h=this.spy(vaddr); if(!h) return; const mv=this.memView; for(let i=0;i<bytes.length;i++) mv.setUint8(h+i, bytes[i]); }
  fillGuest(vaddr, val, len){ const mv=this.memView; for(let i=0;i<len;i++){ const h=this.spy(BigInt(vaddr)+BigInt(i)); if(h) mv.setUint8(h, val); } }
  readGuestByte(vaddr){ const h=this.spy(vaddr); return h? this.memView.getUint8(h) : -1; }
  readGuestBytes(vaddr, n){ const out=new Uint8Array(n); const mv=this.memView; for(let i=0;i<n;i++){ const h=this.spy(BigInt(vaddr)+BigInt(i)); out[i]= h? mv.getUint8(h):0; } return out; }

  _writeArgStr(ptr, str){ const mv=this.memView; const n=Math.min(str.length,199); for(let i=0;i<n;i++) mv.setUint8(ptr+i, str.charCodeAt(i)); mv.setUint8(ptr+n,0); }
  _setEmuArgs(progname, cmd, argv){ this._writeArgStr(this.prognamePtr,progname); this._writeArgStr(this.argcPtr,cmd); this._writeArgStr(this.argvPtr,argv); }

  _onSignal(sig, code){
    console.log(`SIGNAL sig=${sig} code=${code} phase=${this.phase}`);
    if (sig === SIGTRAP && code === BLINK_PREEMPT){ requestAnimationFrame(()=>this.Module._blinkenlib_preempt_resume()); return; }
    // other signals during a program run == stop; the driven-call path uses stepi and won't rely on this
  }
  _onExit(code){
    console.log(`EXIT phase=${this.phase} code=${code} loglen=${this.log.length}`);
    if (this.phase === "ASSEMBLING"){
      if (code !== 0){ this.phase="READY"; this._exitResolve && this._exitResolve({ok:false, stage:"assemble", code, log:this.log}); return; }
      this.phase = "LINKING"; this.log="";
      const cmd = "/linker /program.o -o /program -e " + this._entry + (this._extraLink || "");
      requestAnimationFrame(()=>{ this._setEmuArgs("/linker", cmd, "");
        try { this.Module._blinkenlib_run_fast(); } catch(e){ console.log("THROW in linker run_fast:", String(e).slice(0,120)); this.phase="READY"; this._exitResolve && this._exitResolve({ok:false,stage:"link-throw",code:-1,log:this.log}); } });
      return;
    }
    if (this.phase === "LINKING"){ this.phase="READY"; this._exitResolve && this._exitResolve({ok:code===0, stage:"link", code, log:this.log}); return; }
    // program exit (toolchain-proof run)
    this._progExit = code; this._runResolve && this._runResolve(code);
  }

  assembleLinkEntry(asm, entry){
    this._entry = entry;
    this.log=""; this.phase="ASSEMBLING";
    this.Module.FS.writeFile("/assembly.s", asm);
    return new Promise((res)=>{ this._exitResolve=res;
      requestAnimationFrame(()=>{ this._setEmuArgs("/assembler","/assembler /assembly.s -o /program.o","");
        try { this.Module._blinkenlib_run_fast(); } catch(e){ console.log("THROW in assembler run_fast:", String(e).slice(0,120)); res({ok:false,stage:"assemble-throw",code:-1,log:this.log}); } });
    });
  }
  assembleLink(asm){ return this.assembleLinkEntry(asm, "clean"); }

  starti(){ this._setEmuArgs("/program","/program","");
    try { this.Module._blinkenlib_starti(); } catch(e){ console.log("THROW in starti: status="+(e&&e.status)+" name="+(e&&e.name)+" LOGTAIL="+JSON.stringify(this.log.slice(-260))); throw e; } }
  stepi(){ try { this.Module._blinkenlib_stepi(); } catch(e){ this._stepThrew=String(e).slice(0,140); throw e; } }
  runToExit(){ return new Promise((res)=>{ this._runResolve=res; this._setEmuArgs("/program","/program","");
    try { this.Module._blinkenlib_run(); } catch(e){ console.log("THROW in run:", String(e).slice(0,120)); res(-1); } }); }

  readProgram(){ return this.Module.FS.readFile("/program"); } // Uint8Array
  writeProgram(bytes){ const FS=this.Module.FS; try{FS.unlink("/program");}catch(e){} const s=FS.open("/program","w+"); FS.write(s,bytes,0,bytes.length,0); FS.close(s); FS.chmod("/program",0o777); }
}
