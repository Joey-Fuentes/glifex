// Compact, self-contained MOS 6502 core (documented opcodes) for the Glifex
// browser runtime. Step-driven, pluggable memory bus. No deps, single file.
// Flags: N V - B D I Z C. Binary ADC/SBC (decimal mode not needed for practice).
export class Cpu6502 {
  constructor(bus) { this.bus = bus; this.reset(); }
  reset() { this.a = 0; this.x = 0; this.y = 0; this.sp = 0xFD; this.pc = 0x0600;
    this.C = 0; this.Z = 0; this.I = 1; this.D = 0; this.B = 0; this.V = 0; this.N = 0; this.cycles = 0; this.halted = false; }
  rd(a) { return this.bus.read(a & 0xFFFF) & 0xFF; }
  wr(a, v) { this.bus.write(a & 0xFFFF, v & 0xFF); }
  rd16(a) { return this.rd(a) | (this.rd(a + 1) << 8); }
  push(v) { this.wr(0x100 + this.sp, v); this.sp = (this.sp - 1) & 0xFF; }
  pull() { this.sp = (this.sp + 1) & 0xFF; return this.rd(0x100 + this.sp); }
  setNZ(v) { v &= 0xFF; this.Z = v === 0 ? 1 : 0; this.N = (v & 0x80) ? 1 : 0; return v; }
  getP() { return (this.N<<7)|(this.V<<6)|0x20|(this.B<<4)|(this.D<<3)|(this.I<<2)|(this.Z<<1)|this.C; }
  setP(p) { this.N=(p>>7)&1; this.V=(p>>6)&1; this.B=(p>>4)&1; this.D=(p>>3)&1; this.I=(p>>2)&1; this.Z=(p>>1)&1; this.C=p&1; }
  branch(cond) { const off = this.rd(this.pc); this.pc = (this.pc + 1) & 0xFFFF;
    if (cond) { const t = (this.pc + (off < 0x80 ? off : off - 256)) & 0xFFFF; this.cycles += ((t & 0xFF00) !== (this.pc & 0xFF00)) ? 2 : 1; this.pc = t; } }
  // addressing: return effective address, advance pc
  imm() { const a = this.pc; this.pc = (this.pc + 1) & 0xFFFF; return a; }
  zp()  { const a = this.rd(this.pc); this.pc = (this.pc + 1) & 0xFFFF; return a; }
  zpX() { const a = (this.rd(this.pc) + this.x) & 0xFF; this.pc = (this.pc + 1) & 0xFFFF; return a; }
  zpY() { const a = (this.rd(this.pc) + this.y) & 0xFF; this.pc = (this.pc + 1) & 0xFFFF; return a; }
  abs() { const a = this.rd16(this.pc); this.pc = (this.pc + 2) & 0xFFFF; return a; }
  absX(){ const b = this.rd16(this.pc); this.pc = (this.pc + 2) & 0xFFFF; const a=(b+this.x)&0xFFFF; if((a&0xFF00)!==(b&0xFF00))this.cycles++; return a; }
  absY(){ const b = this.rd16(this.pc); this.pc = (this.pc + 2) & 0xFFFF; const a=(b+this.y)&0xFFFF; if((a&0xFF00)!==(b&0xFF00))this.cycles++; return a; }
  indX(){ const z = (this.rd(this.pc) + this.x) & 0xFF; this.pc = (this.pc + 1) & 0xFFFF; return this.rd(z) | (this.rd((z+1)&0xFF) << 8); }
  indY(){ const z = this.rd(this.pc); this.pc = (this.pc + 1) & 0xFFFF; const b = this.rd(z) | (this.rd((z+1)&0xFF) << 8); const a=(b+this.y)&0xFFFF; if((a&0xFF00)!==(b&0xFF00))this.cycles++; return a; }
  adc(m) { if (this.D) { /* rare: fall back to binary */ } const s = this.a + m + this.C;
    this.V = (~(this.a ^ m) & (this.a ^ s) & 0x80) ? 1 : 0; this.C = s > 0xFF ? 1 : 0; this.a = this.setNZ(s); }
  sbc(m) { this.adc(m ^ 0xFF); }
  cmp(r, m) { const t = r - m; this.C = r >= m ? 1 : 0; this.setNZ(t & 0xFF); }
  step() {
    if (this.halted) return 0; const start = this.cycles; const op = this.rd(this.pc); this.pc = (this.pc + 1) & 0xFFFF;
    const C = { LDA:(a)=>this.a=this.setNZ(this.rd(a)), LDX:(a)=>this.x=this.setNZ(this.rd(a)), LDY:(a)=>this.y=this.setNZ(this.rd(a)),
      STA:(a)=>this.wr(a,this.a), STX:(a)=>this.wr(a,this.x), STY:(a)=>this.wr(a,this.y) };
    switch (op) {
      // LDA
      case 0xA9: C.LDA(this.imm()); this.cycles+=2; break; case 0xA5: C.LDA(this.zp()); this.cycles+=3; break;
      case 0xB5: C.LDA(this.zpX()); this.cycles+=4; break; case 0xAD: C.LDA(this.abs()); this.cycles+=4; break;
      case 0xBD: C.LDA(this.absX()); this.cycles+=4; break; case 0xB9: C.LDA(this.absY()); this.cycles+=4; break;
      case 0xA1: C.LDA(this.indX()); this.cycles+=6; break; case 0xB1: C.LDA(this.indY()); this.cycles+=5; break;
      // LDX / LDY
      case 0xA2: C.LDX(this.imm()); this.cycles+=2; break; case 0xA6: C.LDX(this.zp()); this.cycles+=3; break;
      case 0xB6: C.LDX(this.zpY()); this.cycles+=4; break; case 0xAE: C.LDX(this.abs()); this.cycles+=4; break; case 0xBE: C.LDX(this.absY()); this.cycles+=4; break;
      case 0xA0: C.LDY(this.imm()); this.cycles+=2; break; case 0xA4: C.LDY(this.zp()); this.cycles+=3; break;
      case 0xB4: C.LDY(this.zpX()); this.cycles+=4; break; case 0xAC: C.LDY(this.abs()); this.cycles+=4; break; case 0xBC: C.LDY(this.absX()); this.cycles+=4; break;
      // STA / STX / STY
      case 0x85: C.STA(this.zp()); this.cycles+=3; break; case 0x95: C.STA(this.zpX()); this.cycles+=4; break;
      case 0x8D: C.STA(this.abs()); this.cycles+=4; break; case 0x9D: C.STA(this.absX()); this.cycles+=5; break;
      case 0x99: C.STA(this.absY()); this.cycles+=5; break; case 0x81: C.STA(this.indX()); this.cycles+=6; break; case 0x91: C.STA(this.indY()); this.cycles+=6; break;
      case 0x86: C.STX(this.zp()); this.cycles+=3; break; case 0x96: C.STX(this.zpY()); this.cycles+=4; break; case 0x8E: C.STX(this.abs()); this.cycles+=4; break;
      case 0x84: C.STY(this.zp()); this.cycles+=3; break; case 0x94: C.STY(this.zpX()); this.cycles+=4; break; case 0x8C: C.STY(this.abs()); this.cycles+=4; break;
      // transfers
      case 0xAA: this.x=this.setNZ(this.a); this.cycles+=2; break; case 0xA8: this.y=this.setNZ(this.a); this.cycles+=2; break;
      case 0x8A: this.a=this.setNZ(this.x); this.cycles+=2; break; case 0x98: this.a=this.setNZ(this.y); this.cycles+=2; break;
      case 0xBA: this.x=this.setNZ(this.sp); this.cycles+=2; break; case 0x9A: this.sp=this.x; this.cycles+=2; break;
      // stack
      case 0x48: this.push(this.a); this.cycles+=3; break; case 0x68: this.a=this.setNZ(this.pull()); this.cycles+=4; break;
      case 0x08: this.push(this.getP()|0x10); this.cycles+=3; break; case 0x28: this.setP(this.pull()); this.cycles+=4; break;
      // logic
      case 0x29: this.a=this.setNZ(this.a & this.rd(this.imm())); this.cycles+=2; break; case 0x25: this.a=this.setNZ(this.a & this.rd(this.zp())); this.cycles+=3; break;
      case 0x2D: this.a=this.setNZ(this.a & this.rd(this.abs())); this.cycles+=4; break;
      case 0x09: this.a=this.setNZ(this.a | this.rd(this.imm())); this.cycles+=2; break; case 0x05: this.a=this.setNZ(this.a | this.rd(this.zp())); this.cycles+=3; break;
      case 0x0D: this.a=this.setNZ(this.a | this.rd(this.abs())); this.cycles+=4; break;
      case 0x49: this.a=this.setNZ(this.a ^ this.rd(this.imm())); this.cycles+=2; break; case 0x45: this.a=this.setNZ(this.a ^ this.rd(this.zp())); this.cycles+=3; break;
      case 0x4D: this.a=this.setNZ(this.a ^ this.rd(this.abs())); this.cycles+=4; break;
      // ADC / SBC
      case 0x69: this.adc(this.rd(this.imm())); this.cycles+=2; break; case 0x65: this.adc(this.rd(this.zp())); this.cycles+=3; break;
      case 0x75: this.adc(this.rd(this.zpX())); this.cycles+=4; break; case 0x6D: this.adc(this.rd(this.abs())); this.cycles+=4; break;
      case 0x7D: this.adc(this.rd(this.absX())); this.cycles+=4; break; case 0x79: this.adc(this.rd(this.absY())); this.cycles+=4; break;
      case 0x61: this.adc(this.rd(this.indX())); this.cycles+=6; break; case 0x71: this.adc(this.rd(this.indY())); this.cycles+=5; break;
      case 0xE9: this.sbc(this.rd(this.imm())); this.cycles+=2; break; case 0xE5: this.sbc(this.rd(this.zp())); this.cycles+=3; break;
      case 0xF5: this.sbc(this.rd(this.zpX())); this.cycles+=4; break; case 0xED: this.sbc(this.rd(this.abs())); this.cycles+=4; break;
      case 0xFD: this.sbc(this.rd(this.absX())); this.cycles+=4; break; case 0xF9: this.sbc(this.rd(this.absY())); this.cycles+=4; break;
      // CMP / CPX / CPY
      case 0xC9: this.cmp(this.a,this.rd(this.imm())); this.cycles+=2; break; case 0xC5: this.cmp(this.a,this.rd(this.zp())); this.cycles+=3; break;
      case 0xCD: this.cmp(this.a,this.rd(this.abs())); this.cycles+=4; break; case 0xD5: this.cmp(this.a,this.rd(this.zpX())); this.cycles+=4; break;
      case 0xE0: this.cmp(this.x,this.rd(this.imm())); this.cycles+=2; break; case 0xE4: this.cmp(this.x,this.rd(this.zp())); this.cycles+=3; break; case 0xEC: this.cmp(this.x,this.rd(this.abs())); this.cycles+=4; break;
      case 0xC0: this.cmp(this.y,this.rd(this.imm())); this.cycles+=2; break; case 0xC4: this.cmp(this.y,this.rd(this.zp())); this.cycles+=3; break; case 0xCC: this.cmp(this.y,this.rd(this.abs())); this.cycles+=4; break;
      // INC/DEC memory
      case 0xE6: { const a=this.zp(); this.wr(a,this.setNZ(this.rd(a)+1)); this.cycles+=5; break; }
      case 0xF6: { const a=this.zpX(); this.wr(a,this.setNZ(this.rd(a)+1)); this.cycles+=6; break; }
      case 0xEE: { const a=this.abs(); this.wr(a,this.setNZ(this.rd(a)+1)); this.cycles+=6; break; }
      case 0xC6: { const a=this.zp(); this.wr(a,this.setNZ(this.rd(a)-1)); this.cycles+=5; break; }
      case 0xD6: { const a=this.zpX(); this.wr(a,this.setNZ(this.rd(a)-1)); this.cycles+=6; break; }
      case 0xCE: { const a=this.abs(); this.wr(a,this.setNZ(this.rd(a)-1)); this.cycles+=6; break; }
      case 0xE8: this.x=this.setNZ(this.x+1); this.cycles+=2; break; case 0xCA: this.x=this.setNZ(this.x-1); this.cycles+=2; break;
      case 0xC8: this.y=this.setNZ(this.y+1); this.cycles+=2; break; case 0x88: this.y=this.setNZ(this.y-1); this.cycles+=2; break;
      // shifts (accumulator + zp/abs)
      case 0x0A: this.C=(this.a>>7)&1; this.a=this.setNZ(this.a<<1); this.cycles+=2; break;
      case 0x4A: this.C=this.a&1; this.a=this.setNZ(this.a>>1); this.cycles+=2; break;
      case 0x2A: { const c=this.C; this.C=(this.a>>7)&1; this.a=this.setNZ((this.a<<1)|c); this.cycles+=2; break; }
      case 0x6A: { const c=this.C; this.C=this.a&1; this.a=this.setNZ((this.a>>1)|(c<<7)); this.cycles+=2; break; }
      // branches
      case 0x90: this.branch(!this.C); this.cycles+=2; break; case 0xB0: this.branch(this.C); this.cycles+=2; break;
      case 0xD0: this.branch(!this.Z); this.cycles+=2; break; case 0xF0: this.branch(this.Z); this.cycles+=2; break;
      case 0x10: this.branch(!this.N); this.cycles+=2; break; case 0x30: this.branch(this.N); this.cycles+=2; break;
      case 0x50: this.branch(!this.V); this.cycles+=2; break; case 0x70: this.branch(this.V); this.cycles+=2; break;
      // jumps
      case 0x4C: this.pc=this.abs(); this.cycles+=3; break;
      case 0x6C: { const p=this.abs(); this.pc=this.rd(p)|(this.rd((p&0xFF00)|((p+1)&0xFF))<<8); this.cycles+=5; break; }
      case 0x20: { const t=this.abs(); const r=(this.pc-1)&0xFFFF; this.push(r>>8); this.push(r&0xFF); this.pc=t; this.cycles+=6; break; }
      case 0x60: { const lo=this.pull(); const hi=this.pull(); this.pc=(((hi<<8)|lo)+1)&0xFFFF; this.cycles+=6; break; }
      case 0x40: { this.setP(this.pull()); const lo=this.pull(); const hi=this.pull(); this.pc=(hi<<8)|lo; this.cycles+=6; break; }
      // flags
      case 0x18: this.C=0; this.cycles+=2; break; case 0x38: this.C=1; this.cycles+=2; break;
      case 0x58: this.I=0; this.cycles+=2; break; case 0x78: this.I=1; this.cycles+=2; break;
      case 0xB8: this.V=0; this.cycles+=2; break; case 0xD8: this.D=0; this.cycles+=2; break;
      case 0xF8: throw new Error("decimal mode (SED) not supported yet");  // fail loud, not silently-wrong
      // BIT
      case 0x24: { const m=this.rd(this.zp()); this.Z=(this.a&m)===0?1:0; this.N=(m>>7)&1; this.V=(m>>6)&1; this.cycles+=3; break; }
      case 0x2C: { const m=this.rd(this.abs()); this.Z=(this.a&m)===0?1:0; this.N=(m>>7)&1; this.V=(m>>6)&1; this.cycles+=4; break; }
      case 0xEA: this.cycles+=2; break;                 // NOP
      case 0x00: this.halted = true; this.cycles+=7; break;  // BRK -> halt
      default: throw new Error("unimplemented opcode 0x" + op.toString(16).padStart(2,"0") + " at 0x" + ((this.pc-1)&0xFFFF).toString(16));
    }
    return this.cycles - start;
  }
}
export default Cpu6502;
