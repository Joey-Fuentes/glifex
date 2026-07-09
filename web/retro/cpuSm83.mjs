// Compact, self-contained SM83 (Game Boy CPU) core for the Glifex browser
// runtime. Step-driven, pluggable bus, instruction counting. Implements the
// instruction set emittable by customasm's std sm83 ruledef (main table + CB
// prefix). HALT (0x76) stops execution. Flags: Z N H C (bits 7,6,5,4 of F).
export class CpuSm83 {
  constructor(bus) { this.bus = bus; this.reset(); }
  reset() {
    this.a = 0; this.f = 0; this.b = 0; this.c = 0; this.d = 0; this.e = 0;
    this.h = 0; this.l = 0; this.sp = 0xFFFE; this.pc = 0x0100;
    this.halted = false; this.insns = 0; this.ime = 0;
  }
  rd(a) { return this.bus.read(a & 0xFFFF) & 0xFF; }
  wr(a, v) { this.bus.write(a & 0xFFFF, v & 0xFF); }
  // 16-bit pairs
  get hl() { return (this.h << 8) | this.l; } set hl(v) { this.h = (v >> 8) & 0xFF; this.l = v & 0xFF; }
  get bc() { return (this.b << 8) | this.c; } set bc(v) { this.b = (v >> 8) & 0xFF; this.c = v & 0xFF; }
  get de() { return (this.d << 8) | this.e; } set de(v) { this.d = (v >> 8) & 0xFF; this.e = v & 0xFF; }
  get af() { return (this.a << 8) | this.f; } set af(v) { this.a = (v >> 8) & 0xFF; this.f = v & 0xF0; }
  // flags
  get FZ() { return (this.f >> 7) & 1; } get FN() { return (this.f >> 6) & 1; }
  get FH() { return (this.f >> 5) & 1; } get FC() { return (this.f >> 4) & 1; }
  setF(z, n, h, c) { this.f = ((z?1:0) << 7) | ((n?1:0) << 6) | ((h?1:0) << 5) | ((c?1:0) << 4); }
  imm8() { const v = this.rd(this.pc); this.pc = (this.pc + 1) & 0xFFFF; return v; }
  imm16() { const lo = this.imm8(); return lo | (this.imm8() << 8); }
  push16(v) { this.sp = (this.sp - 1) & 0xFFFF; this.wr(this.sp, (v >> 8) & 0xFF); this.sp = (this.sp - 1) & 0xFFFF; this.wr(this.sp, v & 0xFF); }
  pop16() { const lo = this.rd(this.sp); this.sp = (this.sp + 1) & 0xFFFF; const hi = this.rd(this.sp); this.sp = (this.sp + 1) & 0xFFFF; return (hi << 8) | lo; }
  // r8 index access (6 = [HL])
  getR(i) { switch (i) { case 0: return this.b; case 1: return this.c; case 2: return this.d; case 3: return this.e; case 4: return this.h; case 5: return this.l; case 6: return this.rd(this.hl); default: return this.a; } }
  setR(i, v) { v &= 0xFF; switch (i) { case 0: this.b = v; break; case 1: this.c = v; break; case 2: this.d = v; break; case 3: this.e = v; break; case 4: this.h = v; break; case 5: this.l = v; break; case 6: this.wr(this.hl, v); break; default: this.a = v; } }
  getRP(i) { switch (i) { case 0: return this.bc; case 1: return this.de; case 2: return this.hl; default: return this.sp; } }
  setRP(i, v) { v &= 0xFFFF; switch (i) { case 0: this.bc = v; break; case 1: this.de = v; break; case 2: this.hl = v; break; default: this.sp = v; } }
  cond(i) { switch (i) { case 0: return !this.FZ; case 1: return !!this.FZ; case 2: return !this.FC; default: return !!this.FC; } }
  alu(op, v) {
    const a = this.a;
    switch (op) {
      case 0: { const r = a + v; this.setF((r & 0xFF) === 0, 0, ((a & 0xF) + (v & 0xF)) > 0xF, r > 0xFF); this.a = r & 0xFF; break; }                       // ADD
      case 1: { const c = this.FC; const r = a + v + c; this.setF((r & 0xFF) === 0, 0, ((a & 0xF) + (v & 0xF) + c) > 0xF, r > 0xFF); this.a = r & 0xFF; break; } // ADC
      case 2: { const r = a - v; this.setF((r & 0xFF) === 0, 1, (a & 0xF) < (v & 0xF), r < 0); this.a = r & 0xFF; break; }                                   // SUB
      case 3: { const c = this.FC; const r = a - v - c; this.setF((r & 0xFF) === 0, 1, (a & 0xF) < ((v & 0xF) + c), r < 0); this.a = r & 0xFF; break; }      // SBC
      case 4: this.a &= v; this.setF(this.a === 0, 0, 1, 0); break;                                                                                          // AND
      case 5: this.a ^= v; this.setF(this.a === 0, 0, 0, 0); break;                                                                                          // XOR
      case 6: this.a |= v; this.setF(this.a === 0, 0, 0, 0); break;                                                                                          // OR
      default: { const r = a - v; this.setF((r & 0xFF) === 0, 1, (a & 0xF) < (v & 0xF), r < 0); break; }                                                     // CP
    }
  }
  cb() {
    const op = this.imm8(); const r = op & 7; const v = this.getR(r);
    const hi = op >> 6; const n = (op >> 3) & 7;
    if (hi === 1) { this.setF((v & (1 << n)) === 0, 0, 1, this.FC); return; }        // BIT
    if (hi === 2) { this.setR(r, v & ~(1 << n)); return; }                            // RES
    if (hi === 3) { this.setR(r, v | (1 << n)); return; }                             // SET
    let x = v, c = this.FC;
    switch (n) {
      case 0: x = ((v << 1) | (v >> 7)) & 0xFF; c = (v >> 7) & 1; break;              // RLC
      case 1: x = ((v >> 1) | ((v & 1) << 7)) & 0xFF; c = v & 1; break;               // RRC
      case 2: x = ((v << 1) | c) & 0xFF; c = (v >> 7) & 1; break;                     // RL
      case 3: x = ((v >> 1) | (c << 7)) & 0xFF; c = v & 1; break;                     // RR
      case 4: x = (v << 1) & 0xFF; c = (v >> 7) & 1; break;                           // SLA
      case 5: x = ((v >> 1) | (v & 0x80)) & 0xFF; c = v & 1; break;                   // SRA
      case 6: x = ((v << 4) | (v >> 4)) & 0xFF; c = 0; break;                         // SWAP
      default: x = (v >> 1) & 0xFF; c = v & 1; break;                                 // SRL
    }
    this.setR(r, x); this.setF(x === 0, 0, 0, c);
  }
  step() {
    if (this.halted) return;
    this.insns++;
    const op = this.imm8();
    const x = op >> 6, p = (op >> 4) & 3, q = (op >> 3) & 1, y = (op >> 3) & 7, z = op & 7;
    if (x === 1) { // LD r,r / HALT
      if (op === 0x76) { this.halted = true; return; }
      this.setR(y, this.getR(z)); return;
    }
    if (x === 2) { this.alu(y, this.getR(z)); return; }   // ALU A,r
    if (x === 0) {
      switch (z) {
        case 0:
          if (y === 0) return;                                                          // NOP
          if (y === 1) { const a = this.imm16(); this.wr(a, this.sp & 0xFF); this.wr(a + 1, this.sp >> 8); return; }  // LD [a16],SP
          if (y === 2) { this.imm8(); this.halted = true; return; }                    // STOP (treat as halt)
          if (y === 3) { const e = this.imm8(); this.pc = (this.pc + (e < 0x80 ? e : e - 256)) & 0xFFFF; return; }    // JR
          { const e = this.imm8(); if (this.cond(y - 4)) this.pc = (this.pc + (e < 0x80 ? e : e - 256)) & 0xFFFF; return; } // JR cc
        case 1:
          if (!q) { this.setRP(p, this.imm16()); return; }                             // LD rp,n16
          { const hl = this.hl, v = this.getRP(p); const r = hl + v;                   // ADD HL,rp
            this.setF(this.FZ, 0, ((hl & 0xFFF) + (v & 0xFFF)) > 0xFFF, r > 0xFFFF); this.hl = r & 0xFFFF; return; }
        case 2: { // LD [rp],A / LD A,[rp] with HLI/HLD
          const ind = () => { if (p === 2) { const a = this.hl; this.hl = (this.hl + 1) & 0xFFFF; return a; } if (p === 3) { const a = this.hl; this.hl = (this.hl - 1) & 0xFFFF; return a; } return this.getRP(p); };
          if (!q) { this.wr(ind(), this.a); } else { this.a = this.rd(ind()); } return;
        }
        case 3: { const v = this.getRP(p); this.setRP(p, (v + (q ? -1 : 1)) & 0xFFFF); return; }  // INC/DEC rp
        case 4: { const v = (this.getR(y) + 1) & 0xFF; this.setF(v === 0, 0, (v & 0xF) === 0, this.FC); this.setR(y, v); return; }   // INC r
        case 5: { const v = (this.getR(y) - 1) & 0xFF; this.setF(v === 0, 1, (v & 0xF) === 0xF, this.FC); this.setR(y, v); return; } // DEC r
        case 6: this.setR(y, this.imm8()); return;                                     // LD r,n8
        default: // z === 7: rotates on A / DAA / CPL / SCF / CCF
          switch (y) {
            case 0: { const v = this.a; this.a = ((v << 1) | (v >> 7)) & 0xFF; this.setF(0, 0, 0, (v >> 7) & 1); return; }  // RLCA
            case 1: { const v = this.a; this.a = ((v >> 1) | ((v & 1) << 7)) & 0xFF; this.setF(0, 0, 0, v & 1); return; }   // RRCA
            case 2: { const v = this.a, c = this.FC; this.a = ((v << 1) | c) & 0xFF; this.setF(0, 0, 0, (v >> 7) & 1); return; } // RLA
            case 3: { const v = this.a, c = this.FC; this.a = ((v >> 1) | (c << 7)) & 0xFF; this.setF(0, 0, 0, v & 1); return; } // RRA
            case 4: { // DAA
              let a = this.a, adj = 0, c = this.FC;
              if (this.FH || (!this.FN && (a & 0xF) > 9)) adj |= 0x06;
              if (c || (!this.FN && a > 0x99)) { adj |= 0x60; c = 1; }
              a = this.FN ? (a - adj) & 0xFF : (a + adj) & 0xFF;
              this.setF(a === 0, this.FN, 0, c); this.a = a; return;
            }
            case 5: this.a ^= 0xFF; this.setF(this.FZ, 1, 1, this.FC); return;          // CPL
            case 6: this.setF(this.FZ, 0, 0, 1); return;                                // SCF
            default: this.setF(this.FZ, 0, 0, this.FC ^ 1); return;                     // CCF
          }
      }
    }
    // x === 3
    switch (op) {
      case 0xC3: this.pc = this.imm16(); return;                                        // JP a16
      case 0xC9: this.pc = this.pop16(); return;                                        // RET
      case 0xCB: this.cb(); return;
      case 0xCD: { const t = this.imm16(); this.push16(this.pc); this.pc = t; return; } // CALL
      case 0xD9: this.pc = this.pop16(); this.ime = 1; return;                          // RETI
      case 0xE0: this.wr(0xFF00 + this.imm8(), this.a); return;                         // LDH [a8],A
      case 0xE2: this.wr(0xFF00 + this.c, this.a); return;                              // LDH [C],A
      case 0xE8: { const e = this.imm8(), s = e < 0x80 ? e : e - 256, sp = this.sp;     // ADD SP,e8
        this.setF(0, 0, ((sp & 0xF) + (e & 0xF)) > 0xF, ((sp & 0xFF) + (e & 0xFF)) > 0xFF); this.sp = (sp + s) & 0xFFFF; return; }
      case 0xE9: this.pc = this.hl; return;                                             // JP HL
      case 0xEA: this.wr(this.imm16(), this.a); return;                                 // LD [a16],A
      case 0xF0: this.a = this.rd(0xFF00 + this.imm8()); return;                        // LDH A,[a8]
      case 0xF2: this.a = this.rd(0xFF00 + this.c); return;                             // LDH A,[C]
      case 0xF3: this.ime = 0; return;                                                  // DI
      case 0xF8: { const e = this.imm8(), s = e < 0x80 ? e : e - 256, sp = this.sp;     // LD HL,SP+e8
        this.setF(0, 0, ((sp & 0xF) + (e & 0xF)) > 0xF, ((sp & 0xFF) + (e & 0xFF)) > 0xFF); this.hl = (sp + s) & 0xFFFF; return; }
      case 0xF9: this.sp = this.hl; return;                                             // LD SP,HL
      case 0xFA: this.a = this.rd(this.imm16()); return;                                // LD A,[a16]
      case 0xFB: this.ime = 1; return;                                                  // EI
    }
    if ((op & 0xC7) === 0xC6) { this.alu(y, this.imm8()); return; }                                  // ALU A,n8 (0b11 op 110)
    if ((op & 0xE7) === 0xC0) { if (this.cond(y & 3)) this.pc = this.pop16(); return; }              // RET cc
    if ((op & 0xCF) === 0xC1) { const i = (op >> 4) & 3; const v = this.pop16(); if (i === 3) this.af = v; else this.setRP(i, v); return; }  // POP
    if ((op & 0xE7) === 0xC2) { const t = this.imm16(); if (this.cond(y & 3)) this.pc = t; return; } // JP cc
    if ((op & 0xE7) === 0xC4) { const t = this.imm16(); if (this.cond(y & 3)) { this.push16(this.pc); this.pc = t; } return; } // CALL cc
    if ((op & 0xCF) === 0xC5) { const i = (op >> 4) & 3; this.push16(i === 3 ? this.af : this.getRP(i)); return; }             // PUSH
    if ((op & 0xC7) === 0xC7) { this.push16(this.pc); this.pc = op & 0x38; return; }                 // RST
    throw new Error("unimplemented opcode 0x" + op.toString(16).padStart(2, "0") + " at 0x" + ((this.pc - 1) & 0xFFFF).toString(16));
  }
}
export default CpuSm83;
