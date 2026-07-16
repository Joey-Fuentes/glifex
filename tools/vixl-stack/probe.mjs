// probe.mjs <out-dir> <label> <elf>
// For one build: how deep can the guest stack actually go, does the GUARD still
// fire past the limit, what does gx_init cost, and do the katas still pass.
//
// The probe FILLS and READS BACK the whole claimed region. A probe that only
// touches [sp] "passes" at 4 MB by sailing past the guard into unrelated
// memory -- that is how the first attempt at this lied.
import { readFileSync } from "node:fs";
import path from "node:path";
const big = (v) => BigInt(v);

function loads(b){const d=new DataView(b.buffer,b.byteOffset||0,b.byteLength);
  const ph=Number(d.getBigUint64(0x20,true)),pe=d.getUint16(0x36,true),pn=d.getUint16(0x38,true);const o=[];
  for(let i=0;i<pn;i++){const q=ph+i*pe;if(d.getUint32(q,true)===1)o.push({off:Number(d.getBigUint64(q+8,true)),va:Number(d.getBigUint64(q+16,true)),fsz:Number(d.getBigUint64(q+32,true)),msz:Number(d.getBigUint64(q+40,true))});}return o;}
function sym(b,n){const d=new DataView(b.buffer,b.byteOffset||0,b.byteLength);
  const shoff=Number(d.getBigUint64(0x28,true)),shent=d.getUint16(0x3a,true),shnum=d.getUint16(0x3c,true);const dec=new TextDecoder();
  for(let i=0;i<shnum;i++){const sh=shoff+i*shent;if(d.getUint32(sh+4,true)===2){
    const so=Number(d.getBigUint64(sh+0x18,true)),ss=Number(d.getBigUint64(sh+0x20,true)),se=Number(d.getBigUint64(sh+0x38,true));
    const stroff=Number(d.getBigUint64(shoff+d.getUint32(sh+0x28,true)*shent+0x18,true));
    for(let o=so;o<so+ss;o+=se){const q=stroff+d.getUint32(o,true);let e=q;while(b[e]!==0)e++;
      if(dec.decode(b.subarray(q,e))===n)return Number(d.getBigUint64(o+8,true));}}}throw new Error(n);}

const OUT=process.argv[2], LABEL=process.argv[3], ELF=process.argv[4];
const t0=Date.now();
const M=await (await import(path.resolve(OUT,"gx_"+LABEL+".mjs"))).default();
const tLoad=Date.now()-t0;
const t1=Date.now();
if(M._gx_init()!==0){console.log("## FAIL gx_init");process.exit(1);}
const tInit=Date.now()-t1;
console.log("## build="+LABEL+"  requested_stack="+(M._gx_stack_size()||"default")+"  loadMs="+tLoad+"  gx_initMs="+tInit);

const elf=new Uint8Array(readFileSync(ELF));
const segs=loads(elf),minva=Math.min(...segs.map(s=>s.va));
const span=Math.max(...segs.map(s=>s.va+s.msz))-minva;
const raw=Number(M._malloc(span+8192)),base=(raw+4095)&~4095;
for(const s of segs){const dst=base+(s.va-minva);M.HEAPU8.fill(0,dst,dst+s.msz);M.HEAPU8.set(elf.subarray(s.off,s.off+s.fsz),dst);}
const entry=sym(elf,"probe")+(base-minva);

function tryDepth(kb){
  M._gx_reset();
  M._gx_write_x(0,big(kb*1024));
  M._gx_set_pc(big(entry));
  let steps=0;
  try{ while(steps<50000000){ if(M._gx_step()===1) break; steps++; } }
  catch(e){ return "TRAP"; }
  return M._gx_read_x(0)===1n ? "OK" : "CORRUPT";
}

// Walk up until it stops working. CORRUPT anywhere is the alarming outcome:
// it would mean a resized stack lost its guard and we traded a loud abort for
// silent memory corruption -- strictly worse than an 8 KB limit.
let lastOk=0, verdict="";
for(const kb of [4,8,16,32,64,128,256,512,1024,2048]){
  const r=tryDepth(kb);
  console.log("   "+String(kb).padStart(5)+" KB -> "+r);
  if(r==="OK") lastOk=kb;
  else { verdict=r; break; }
}
console.log("## RESULT "+LABEL+": usable="+lastOk+" KB, first failure="+(verdict||"none in range"));
if(verdict==="CORRUPT") console.log("## ALARM "+LABEL+" lost its guard -- silent corruption, do NOT ship this size");
