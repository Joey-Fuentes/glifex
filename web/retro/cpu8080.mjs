// Compact, self-contained Intel 8080 core for the Glifex browser runtime.
// Step-driven, pluggable bus, instruction + T-state cycle counting.
// Timing: per-instruction T-state totals per the Intel 8080 Microcomputer
// Systems User's Manual (Sep 1975); conditional CALL 11/17, conditional
// RET 5/11 resolved from live flags. Reference clock for wall-time display
// is 2.000 MHz (original 8080; Altair 8800; ~Space Invaders).
// Flags: S Z 0 AC 0 P 1 CY. AC on subtraction follows the 8080's internal
// complement-add (set = NO borrow from bit 3); ANA sets AC = bit3 of (A|v);
// XRA/ORA clear AC. Validated against the CP/M diagnostic ROMs (see
// web/retro/test-roms/8080/). HLT (0x76) stops execution.
const CYC = [
  4,10, 7, 5, 5, 5, 7, 4,  4,10, 7, 5, 5, 5, 7, 4,  // 00
  4,10, 7, 5, 5, 5, 7, 4,  4,10, 7, 5, 5, 5, 7, 4,  // 10
  4,10,16, 5, 5, 5, 7, 4,  4,10,16, 5, 5, 5, 7, 4,  // 20
  4,10,13, 5,10,10,10, 4,  4,10,13, 5, 5, 5, 7, 4,  // 30
  5, 5, 5, 5, 5, 5, 7, 5,  5, 5, 5, 5, 5, 5, 7, 5,  // 40 MOV
  5, 5, 5, 5, 5, 5, 7, 5,  5, 5, 5, 5, 5, 5, 7, 5,  // 50
  5, 5, 5, 5, 5, 5, 7, 5,  5, 5, 5, 5, 5, 5, 7, 5,  // 60
  7, 7, 7, 7, 7, 7, 7, 7,  5, 5, 5, 5, 5, 5, 7, 5,  // 70 (76=HLT:7)
  4, 4, 4, 4, 4, 4, 7, 4,  4, 4, 4, 4, 4, 4, 7, 4,  // 80 ALU
  4, 4, 4, 4, 4, 4, 7, 4,  4, 4, 4, 4, 4, 4, 7, 4,  // 90
  4, 4, 4, 4, 4, 4, 7, 4,  4, 4, 4, 4, 4, 4, 7, 4,  // A0
  4, 4, 4, 4, 4, 4, 7, 4,  4, 4, 4, 4, 4, 4, 7, 4,  // B0
  5,10,10,10,11,11, 7,11,  5,10,10,10,11,17, 7,11,  // C0 (Ccc base 11, Rcc base 5)
  5,10,10,10,11,11, 7,11,  5,10,10,10,11,17, 7,11,  // D0
  5,10,10,18,11,11, 7,11,  5, 5,10, 4,11,17, 7,11,  // E0 (E3 XTHL 18, EB XCHG 4)
  5,10,10, 4,11,11, 7,11,  5, 5,10, 4,11,17, 7,11,  // F0 (F9 SPHL 5)
];
const PAR = new Uint8Array(256); // 1 = even parity (8080 P flag convention)
for (let i = 0; i < 256; i++) { let b = i, n = 0; while (b) { n ^= b & 1; b >>= 1; } PAR[i] = n ^ 1; }

export class Cpu8080 {
  constructor(bus) { this.bus = bus; this.reset(); }
  reset() {
    this.a = 0; this.b = 0; this.c = 0; this.d = 0; this.e = 0; this.h = 0; this.l = 0;
    this.fs = 0; this.fz = 0; this.fac = 0; this.fp = 0; this.fcy = 0;
    this.sp = 0xF000; this.pc = 0x0100; this.halted = false;
    this.insns = 0; this.cycles = 0; this.inte = 0;
  }
  rd(a) { return this.bus.read(a & 0xFFFF) & 0xFF; }
  wr(a, v) { this.bus.write(a & 0xFFFF, v & 0xFF); }
  get hl() { return (this.h << 8) | this.l; } set hl(v) { this.h = (v >> 8) & 0xFF; this.l = v & 0xFF; }
  get bc() { return (this.b << 8) | this.c; } set bc(v) { this.b = (v >> 8) & 0xFF; this.c = v & 0xFF; }
  get de() { return (this.d << 8) | this.e; } set de(v) { this.d = (v >> 8) & 0xFF; this.e = v & 0xFF; }
  get f() { return (this.fs << 7) | (this.fz << 6) | (this.fac << 4) | (this.fp << 2) | 0x02 | this.fcy; }
  set f(v) { this.fs = (v >> 7) & 1; this.fz = (v >> 6) & 1; this.fac = (v >> 4) & 1; this.fp = (v >> 2) & 1; this.fcy = v & 1; }
  szp(v) { this.fs = (v >> 7) & 1; this.fz = v === 0 ? 1 : 0; this.fp = PAR[v]; }
  imm8() { const v = this.rd(this.pc); this.pc = (this.pc + 1) & 0xFFFF; return v; }
  imm16() { const lo = this.imm8(); return lo | (this.imm8() << 8); }
  push16(v) { this.sp = (this.sp - 1) & 0xFFFF; this.wr(this.sp, (v >> 8) & 0xFF); this.sp = (this.sp - 1) & 0xFFFF; this.wr(this.sp, v & 0xFF); }
  pop16() { const lo = this.rd(this.sp); this.sp = (this.sp + 1) & 0xFFFF; const hi = this.rd(this.sp); this.sp = (this.sp + 1) & 0xFFFF; return (hi << 8) | lo; }
  getR(i) { switch (i) { case 0: return this.b; case 1: return this.c; case 2: return this.d; case 3: return this.e; case 4: return this.h; case 5: return this.l; case 6: return this.rd(this.hl); default: return this.a; } }
  setR(i, v) { v &= 0xFF; switch (i) { case 0: this.b = v; break; case 1: this.c = v; break; case 2: this.d = v; break; case 3: this.e = v; break; case 4: this.h = v; break; case 5: this.l = v; break; case 6: this.wr(this.hl, v); break; default: this.a = v; } }
  getRP(i) { switch (i) { case 0: return this.bc; case 1: return this.de; case 2: return this.hl; default: return this.sp; } }
  setRP(i, v) { v &= 0xFFFF; switch (i) { case 0: this.bc = v; break; case 1: this.de = v; break; case 2: this.hl = v; break; default: this.sp = v; } }
  cond(i) { switch (i) { case 0: return !this.fz; case 1: return !!this.fz; case 2: return !this.fcy; case 3: return !!this.fcy; case 4: return !this.fp; case 5: return !!this.fp; case 6: return !this.fs; default: return !!this.fs; } }
  addA(v, c) { // shared adder: ADD/ADC and (via complement) SUB/SBB/CMP set AC/CY here
    const r = this.a + v + c;
    this.fac = ((this.a & 0xF) + (v & 0xF) + c) > 0xF ? 1 : 0;
    this.fcy = r > 0xFF ? 1 : 0;
    const x = r & 0xFF; this.szp(x); return x;
  }
  alu(op, v) {
    switch (op) {
      case 0: this.a = this.addA(v, 0); break;                                        // ADD
      case 1: this.a = this.addA(v, this.fcy); break;                                 // ADC
      case 2: this.a = this.addA(~v & 0xFF, 1); this.fcy ^= 1; break;                 // SUB
      case 3: this.a = this.addA(~v & 0xFF, this.fcy ^ 1); this.fcy ^= 1; break;      // SBB
      case 4: this.fac = ((this.a | v) >> 3) & 1; this.a &= v; this.szp(this.a); this.fcy = 0; break; // ANA
      case 5: this.a ^= v; this.szp(this.a); this.fac = 0; this.fcy = 0; break;       // XRA
      case 6: this.a |= v; this.szp(this.a); this.fac = 0; this.fcy = 0; break;       // ORA
      default: { const s = this.a; this.addA(~v & 0xFF, 1); this.fcy ^= 1; this.a = s; break; } // CMP
    }
  }
  step() {
    if (this.halted) return;
    this.insns++;
    const op = this.imm8();
    this.cycles += CYC[op];
    const x = op >> 6, p = (op >> 4) & 3, q = (op >> 3) & 1, y = (op >> 3) & 7, z = op & 7;
    if (x === 1) { // MOV / HLT
      if (op === 0x76) { this.halted = true; return; }
      this.setR(y, this.getR(z)); return;
    }
    if (x === 2) { this.alu(y, this.getR(z)); return; } // ALU A,r
    if (x === 0) {
      switch (z) {
        case 0: return; // NOP (+ undocumented aliases 08/10/18/20/28/30/38)
        case 1:
          if (!q) { this.setRP(p, this.imm16()); return; }                            // LXI
          { const r = this.hl + this.getRP(p); this.fcy = r > 0xFFFF ? 1 : 0; this.hl = r & 0xFFFF; return; } // DAD (only CY)
        case 2:
          switch (y) {
            case 0: this.wr(this.bc, this.a); return;                                 // STAX B
            case 1: this.a = this.rd(this.bc); return;                                // LDAX B
            case 2: this.wr(this.de, this.a); return;                                 // STAX D
            case 3: this.a = this.rd(this.de); return;                                // LDAX D
            case 4: { const t = this.imm16(); this.wr(t, this.l); this.wr(t + 1, this.h); return; } // SHLD
            case 5: { const t = this.imm16(); this.l = this.rd(t); this.h = this.rd(t + 1); return; } // LHLD
            case 6: this.wr(this.imm16(), this.a); return;                            // STA
            default: this.a = this.rd(this.imm16()); return;                          // LDA
          }
        case 3: { const v = this.getRP(p); this.setRP(p, (v + (q ? -1 : 1)) & 0xFFFF); return; } // INX/DCX (no flags)
        case 4: { const v = this.getR(y), r = (v + 1) & 0xFF; this.fac = (v & 0xF) === 0xF ? 1 : 0; this.szp(r); this.setR(y, r); return; } // INR (CY untouched)
        case 5: { const v = this.getR(y), r = (v - 1) & 0xFF; this.fac = (v & 0xF) !== 0 ? 1 : 0; this.szp(r); this.setR(y, r); return; }   // DCR (CY untouched)
        case 6: this.setR(y, this.imm8()); return;                                    // MVI
        default: // z === 7
          switch (y) {
            case 0: { const v = this.a; this.a = ((v << 1) | (v >> 7)) & 0xFF; this.fcy = (v >> 7) & 1; return; } // RLC
            case 1: { const v = this.a; this.a = ((v >> 1) | ((v & 1) << 7)) & 0xFF; this.fcy = v & 1; return; }  // RRC
            case 2: { const v = this.a; this.a = ((v << 1) | this.fcy) & 0xFF; this.fcy = (v >> 7) & 1; return; } // RAL
            case 3: { const v = this.a; this.a = ((v >> 1) | (this.fcy << 7)) & 0xFF; this.fcy = v & 1; return; } // RAR
            case 4: { // DAA — decimal adjust via the real adder so AC/CY fall out naturally
              let adj = 0, cy = this.fcy;
              const lsb = this.a & 0xF, msb = this.a >> 4;
              if (this.fac || lsb > 9) adj += 0x06;
              if (this.fcy || msb > 9 || (msb >= 9 && lsb > 9)) { adj += 0x60; cy = 1; }
              this.a = this.addA(adj, 0); this.fcy = cy; return;
            }
            case 5: this.a ^= 0xFF; return;                                           // CMA (no flags)
            case 6: this.fcy = 1; return;                                             // STC
            default: this.fcy ^= 1; return;                                           // CMC
          }
      }
    }
    // x === 3
    switch (z) {
      case 0: if (this.cond(y)) { this.cycles += 6; this.pc = this.pop16(); } return; // Rcc 5/11
      case 1:
        if (!q) { const v = this.pop16(); if (p === 3) { this.a = v >> 8; this.f = v & 0xFF; } else this.setRP(p, v); return; } // POP
        switch (p) {
          case 0: this.pc = this.pop16(); return;                                     // RET (C9; D9 alias via q taken above? no: q=1 path)
          case 1: this.pc = this.pop16(); return;                                     // *RET (D9 alias)
          case 2: this.pc = this.hl; return;                                          // PCHL
          default: this.sp = this.hl; return;                                         // SPHL
        }
      case 2: { const t = this.imm16(); if (this.cond(y)) this.pc = t; return; }      // Jcc (10 always)
      case 3:
        switch (y) {
          case 0: this.pc = this.imm16(); return;                                     // JMP (+CB alias y=1)
          case 1: this.pc = this.imm16(); return;                                     // *JMP
          case 2: { const port = this.imm8(); if (this.bus.out) this.bus.out(port, this.a); return; }  // OUT
          case 3: { const port = this.imm8(); this.a = this.bus.in ? this.bus.in(port) & 0xFF : 0; return; } // IN
          case 4: { const t = this.pop16(); this.push16(this.hl); this.hl = t; return; } // XTHL (SP net-unmoved)
          case 5: { const t = this.de; this.de = this.hl; this.hl = t; return; }      // XCHG
          case 6: this.inte = 0; return;                                              // DI
          default: this.inte = 1; return;                                             // EI
        }
      case 4: { const t = this.imm16(); if (this.cond(y)) { this.cycles += 6; this.push16(this.pc); this.pc = t; } return; } // Ccc 11/17
      case 5:
        if (!q) { this.push16(p === 3 ? ((this.a << 8) | this.f) : this.getRP(p)); return; } // PUSH
        { const t = this.imm16(); this.push16(this.pc); this.pc = t; return; }        // CALL (+DD/ED/FD aliases)
      case 6: this.alu(y, this.imm8()); return;                                       // ALU A,d8
      default: this.push16(this.pc); this.pc = op & 0x38; return;                     // RST
    }
  }
}
export default Cpu8080;
