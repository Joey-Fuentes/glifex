import { Blink } from "./asm-x86-blink.mjs";

const ASM_URL = "vendor/asm-x86_64/gnu-as.elf";
const LD_URL  = "vendor/asm-x86_64/gnu-ld.elf";

const bigIntSafe = (_, v) => (typeof v === "bigint" ? Number(v) : v);
function eq(a, b){ try { return JSON.stringify(a, bigIntSafe) === JSON.stringify(b, bigIntSafe); } catch { return false; } }

function u64le(v){ const b=new Uint8Array(8); let x=BigInt.asUintN(64, BigInt(v)); for(let i=0;i<8;i++){ b[i]=Number(x&0xffn); x>>=8n; } return b; }
function cstr(s){ const b=new Uint8Array(s.length+1); for(let i=0;i<s.length;i++) b[i]=s.charCodeAt(i)&0xff; b[s.length]=0; return b; }
function readLong(b, addr){ let v=0n; for(let i=7;i>=0;i--) v=(v<<8n)|BigInt(b.readGuestByte(addr+BigInt(i))&0xff); return BigInt.asIntN(64, v); }

// Per-problem SysV ABI adapters. marshal() writes inputs into guest memory and
// sets the argument registers; decode() reads the result into the expected JSON shape.
const ADAPTERS = {
  anagram: {
    marshal(b, base, inp){ const S=base-0x40n, T=base-0x80n; b.writeGuest(S, cstr(inp.s)); b.writeGuest(T, cstr(inp.t)); b.setReg("rdi",S); b.setReg("rsi",T); return {}; },
    decode(b){ return (b.getReg("rax") & 1n) === 1n; },              // int -> bool
  },
  twoSum: {
    marshal(b, base, inp){ const NUMS=base-0x400n, OUT=base-0x40n; const a=inp.nums;
      for(let k=0;k<a.length;k++) b.writeGuest(NUMS+BigInt(k*8), u64le(a[k]));
      b.writeGuest(OUT, u64le(-1)); b.writeGuest(OUT+8n, u64le(-1));
      b.setReg("rdi",NUMS); b.setReg("rsi",BigInt(a.length)); b.setReg("rdx",BigInt(inp.target)); b.setReg("rcx",OUT); return {OUT}; },
    decode(b, ctx){ return [Number(readLong(b,ctx.OUT)), Number(readLong(b,ctx.OUT+8n))]; },  // out[] -> [i,j]
  },
  fib: {
    marshal(b, base, inp){ b.setReg("rdi", BigInt(inp.n)); return {}; },
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
export async function driveProblem(source, cases){
  const m = source.match(/\.globl\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (!m) return { error: "no .globl symbol found in source" };
  const entry = m[1];
  const adapter = adapterFor(cases);

  const A = new Blink(); await A.init(ASM_URL, LD_URL);
  const build = await A.assembleLinkEntry(source, entry);
  if (!build.ok) return { error: (build.stage||"build")+" failed: " + (A.log||"").slice(-300).replace(/[^\x20-\x7e\n]/g,".") };
  const elf = A.readProgram();

  const b = new Blink(); await b.init(ASM_URL, LD_URL);
  b.writeProgram(elf); b.starti();
  const entryAddr = b.getReg("rip"), base = b.getReg("rsp");

  const SENTINEL=0xDEAD0000n, MAX=5000000, POISON=0x4000, SENT=base-0x800n;
  let totalInsns=0, peakStackMax=0, heapMax=0;
  const results=[];
  for (let i=0;i<cases.length;i++){
    const c=cases[i];
    b.fillGuest(SENT-BigInt(POISON), 0xA5, POISON);
    b.writeGuest(SENT, u64le(SENTINEL));
    b.setReg("rsp", SENT);
    const ctx = adapter.marshal(b, base, c.input);
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
    results.push({ i, ok: eq(got,c.expected), got, expected:c.expected, insns:steps, peakStack, heapBytes, ret, threw });
  }
  const n=cases.length||1;
  return { results, instructions:Math.round(totalInsns/n), spaceBytes:peakStackMax, heapBytes:heapMax, codeBytes:elf.length, entry };
}
