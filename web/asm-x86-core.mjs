import { Blink } from "./asm-x86-blink.mjs";

const ASM_URL = "vendor/asm-x86_64/gnu-as.elf";
const LD_URL  = "vendor/asm-x86_64/gnu-ld.elf";

const bigIntSafe = (_, v) => (typeof v === "bigint" ? Number(v) : v);
function eq(a, b){ try { return JSON.stringify(a, bigIntSafe) === JSON.stringify(b, bigIntSafe); } catch { return false; } }

function u64le(v){ const b=new Uint8Array(8); let x=BigInt.asUintN(64, BigInt(v)); for(let i=0;i<8;i++){ b[i]=Number(x&0xffn); x>>=8n; } return b; }
function cstr(s){ const b=new Uint8Array(s.length+1); for(let i=0;i<s.length;i++) b[i]=s.charCodeAt(i)&0xff; b[s.length]=0; return b; }
function readLong(b, addr){ let v=0n; for(let i=7;i>=0;i--) v=(v<<8n)|BigInt(b.readGuestByte(addr+BigInt(i))&0xff); return BigInt.asIntN(64, v); }

// Locate a .globl symbol's virtual address in a linked ELF64 by parsing its
// symbol table -- how we find the BSS scratch buffer (below).
function elfSymAddr(elf, name){
  const dv = new DataView(elf.buffer, elf.byteOffset || 0, elf.byteLength);
  if (elf[0]!==0x7f || elf[1]!==0x45 || elf[2]!==0x4c || elf[3]!==0x46) throw new Error("not an ELF");
  const shoff = Number(dv.getBigUint64(0x28, true));
  const shent = dv.getUint16(0x3a, true), shnum = dv.getUint16(0x3c, true);
  let symoff=0, symsize=0, syment=0, stroff=0;
  for (let i=0;i<shnum;i++){
    const sh = shoff + i*shent;
    if (dv.getUint32(sh+4, true) === 2){                 // SHT_SYMTAB
      symoff = Number(dv.getBigUint64(sh+0x18, true));
      symsize = Number(dv.getBigUint64(sh+0x20, true));
      syment = Number(dv.getBigUint64(sh+0x38, true));
      const link = dv.getUint32(sh+0x28, true);          // strtab section
      stroff = Number(dv.getBigUint64(shoff + link*shent + 0x18, true));
      break;
    }
  }
  if (!symoff || !syment) throw new Error("no .symtab");
  const dec = new TextDecoder();
  for (let o=symoff; o<symoff+symsize; o+=syment){
    const nameOff = stroff + dv.getUint32(o, true);
    let e=nameOff; while(elf[e]!==0) e++;
    if (dec.decode(elf.subarray(nameOff, e)) === name) return dv.getBigUint64(o+8, true);
  }
  throw new Error("symbol not found: "+name);
}

// Per-problem SysV ABI adapters. Inputs live in the BSS scratch region at `io`
// (the guest stack maps only one page -- far too small for Lab-scale inputs).
const ADAPTERS = {
  anagram: {
    marshal(b, io, inp){ const S=io, T=io+0x10000n; b.writeGuest(S, cstr(inp.s)); b.writeGuest(T, cstr(inp.t)); b.setReg("rdi",S); b.setReg("rsi",T); return {}; },
    decode(b){ return (b.getReg("rax") & 1n) === 1n; },              // int -> bool
  },
  twoSum: {
    marshal(b, io, inp){ const NUMS=io, OUT=io+0x30000n; const a=inp.nums;
      for(let k=0;k<a.length;k++) b.writeGuest(NUMS+BigInt(k*8), u64le(a[k]));
      b.writeGuest(OUT, u64le(-1)); b.writeGuest(OUT+8n, u64le(-1));
      b.setReg("rdi",NUMS); b.setReg("rsi",BigInt(a.length)); b.setReg("rdx",BigInt(inp.target)); b.setReg("rcx",OUT); return {OUT}; },
    decode(b, ctx){ return [Number(readLong(b,ctx.OUT)), Number(readLong(b,ctx.OUT+8n))]; },  // out[] -> [i,j]
  },
  fib: {
    marshal(b, io, inp){ b.setReg("rdi", BigInt(inp.n)); return {}; },
    decode(b){ return Number(BigInt.asUintN(64, b.getReg("rax"))); },  // rax -> number
  },
};
function adapterFor(cases){ const inp=cases[0].input;
  if ("s" in inp && "t" in inp) return ADAPTERS.anagram;
  if ("nums" in inp) return ADAPTERS.twoSum;
  if ("n" in inp) return ADAPTERS.fib;
  throw new Error("unknown problem shape: "+JSON.stringify(Object.keys(inp)));
}

// Build the user's .s in instance A (as+ld), then load+drive it in a FRESH
// instance B (the two-instance rule), single-stepping each case to a sentinel
// ret. Returns per-case results + exact instruction/stack/heap metrics.
// Lab-facing aliases: cycles=insns (det tier), space=heapBytes, spaceStack=peakStack.
export async function driveProblem(source, cases){
  const m = source.match(/\.globl\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (!m) return { error: "no .globl symbol found in source" };
  const entry = m[1];
  const adapter = adapterFor(cases);

  // Inputs go in a loader-mapped BSS buffer, not the stack (only one stack page
  // is mapped below rsp). 256KB comfortably holds every Lab ladder input.
  const srcAug = source + "\n\n.section .bss\n.align 16\n.globl __glifex_io\n__glifex_io:\n.zero 262144\n";

  const A = new Blink(); await A.init(ASM_URL, LD_URL);
  const build = await A.assembleLinkEntry(srcAug, entry);
  if (!build.ok) return { error: (build.stage||"build")+" failed: " + (A.log||"").slice(-300).replace(/[^\x20-\x7e\n]/g,".") };
  const elf = A.readProgram();
  let io;
  try { io = elfSymAddr(elf, "__glifex_io"); } catch(e){ return { error: "scratch buffer: "+e.message }; }

  const b = new Blink(); await b.init(ASM_URL, LD_URL);
  b.writeProgram(elf); b.starti();
  const entryAddr = b.getReg("rip"), base = b.getReg("rsp");

  // Working stack stays near rsp (the one mapped page); POISON stays inside it.
  const SENTINEL=0xDEAD0000n, MAX=5000000, POISON=0xE00, SENT=base-0x40n;
  let totalInsns=0, peakStackMax=0, heapMax=0;
  const results=[];

  // Warm-up: Blink's FIRST driven mmap in a session can return a region that
  // isn't zero-filled, but real MAP_ANONYMOUS is -- and the hash-table
  // solutions treat a zero slot as empty. Drive case 0 once, discarded, so that
  // first mmap is consumed before any measured case. (No-op for solutions that
  // never mmap; cheap either way.)
  if (cases.length){
    b.fillGuest(SENT-BigInt(POISON), 0xA5, POISON);
    b.writeGuest(SENT, u64le(SENTINEL));
    b.setReg("rsp", SENT);
    adapter.marshal(b, io, cases[0].input);
    b.setReg("rip", entryAddr);
    let st=0;
    try { while (st<MAX){ if (b.getReg("rip")===SENTINEL) break; b.stepi(); st++; } } catch(e){}
  }

  for (let i=0;i<cases.length;i++){
    const c=cases[i];
    b.fillGuest(SENT-BigInt(POISON), 0xA5, POISON);
    b.writeGuest(SENT, u64le(SENTINEL));
    b.setReg("rsp", SENT);
    const ctx = adapter.marshal(b, io, c.input);
    b.setReg("rip", entryAddr);
    let steps=0, ret=false, threw=null, heapBytes=0;
    try {
      while (steps<MAX){
        const rip=b.getReg("rip");
        if (rip===SENTINEL){ ret=true; break; }
        const op=b.readGuestBytes(rip,2);
        if (op[0]===0x0f && op[1]===0x05){ const num=b.getReg("rax")&0xffffffffn; if (num===9n) heapBytes+=Number(b.getReg("rsi")&0xffffffffffffffffn); }
        b.stepi(); steps++;
      }
    } catch(e){ threw="status="+(e&&e.status); }
    const got = adapter.decode(b, ctx);
    let deepest=SENT;
    for (let off=1;off<=POISON;off++){ const bv=b.readGuestByte(SENT-BigInt(off)); if (bv!==0xA5 && bv!==-1) deepest=SENT-BigInt(off); }
    const peakStack=Number(SENT-deepest);
    totalInsns+=steps; if(peakStack>peakStackMax)peakStackMax=peakStack; if(heapBytes>heapMax)heapMax=heapBytes;
    results.push({ i, ok: eq(got,c.expected), got, expected:c.expected, insns:steps, cycles:steps, peakStack, heapBytes, space:heapBytes, spaceStack:peakStack, ret, threw });
  }
  const n=cases.length||1;
  return { results, instructions:Math.round(totalInsns/n), spaceBytes:peakStackMax, heapBytes:heapMax, codeBytes:elf.length, entry };
}
