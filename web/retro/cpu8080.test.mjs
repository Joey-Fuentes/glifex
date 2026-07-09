#!/usr/bin/env node
// Sandbox unit battery for the 8080 core. Hand-assembled byte programs;
// weights the classic 8080 traps: AC on subtraction (complement-add, set =
// NO borrow), ANA's AC = bit3(A|v), DAA's msb>=9&&lsb>9 case, even-parity P,
// PSW byte pattern (bit1=1, bits 3/5=0), and conditional CALL/RET dual timing.
// The CP/M ROMs are the exhaustive gate; this battery is the fast dev loop.
import { Cpu8080 } from "./cpu8080.mjs";

let pass = 0, fail = 0;
function run(bytes, setup) {
  const mem = new Uint8Array(65536); mem.set(bytes, 0x0100);
  const cpu = new Cpu8080({ read: (a) => mem[a], write: (a, v) => { mem[a] = v; } });
  cpu.pc = 0x0100; cpu.sp = 0xF000;
  if (setup) setup(cpu);
  let guard = 100000;
  while (!cpu.halted && guard--) cpu.step();
  if (guard <= 0) throw new Error("test program did not halt");
  return { cpu, mem };
}
function t(name, cond) { if (cond) { pass++; } else { fail++; console.log("FAIL: " + name); } }

// 1. MVI/MOV/HLT + ADD basics: 5 + 7 = 12, no carry, parity of 0x0C (2 bits) even
{ const { cpu } = run([0x3E, 0x05, 0x06, 0x07, 0x80, 0x76]); // MVI A,5; MVI B,7; ADD B; HLT
  t("add result", cpu.a === 0x0C); t("add P even", cpu.fp === 1);
  t("add S/Z/CY clear", cpu.fs === 0 && cpu.fz === 0 && cpu.fcy === 0);
  t("add AC clear (5+7 low-nibble 12 <= 15)", cpu.fac === 0); }
// 2. ADD AC: 0x0F + 0x01 -> AC set
{ const { cpu } = run([0x3E, 0x0F, 0xC6, 0x01, 0x76]); // MVI A,0F; ADI 01; HLT
  t("adi AC", cpu.fac === 1 && cpu.a === 0x10); }
// 3. SUB borrow semantics: 0x10 - 0x01 = 0x0F; borrow from bit3 -> AC=0; no full borrow -> CY=0
{ const { cpu } = run([0x3E, 0x10, 0xD6, 0x01, 0x76]);
  t("sui result", cpu.a === 0x0F); t("sui CY (no borrow)", cpu.fcy === 0);
  t("sui AC (8080: 0 = borrow from bit 3)", cpu.fac === 0); }
// 4. SUB full borrow: 0x00 - 0x01 = 0xFF, CY=1 (borrow), AC=0
{ const { cpu } = run([0x3E, 0x00, 0xD6, 0x01, 0x76]);
  t("sui borrow CY", cpu.fcy === 1 && cpu.a === 0xFF && cpu.fac === 0 && cpu.fs === 1); }
// 5. SBB with borrow-in: A=2, CY=1, SBI 1 -> 0
{ const { cpu } = run([0x3E, 0x02, 0x37, 0xDE, 0x01, 0x76]); // MVI A,2; STC; SBI 1
  t("sbi", cpu.a === 0x00 && cpu.fz === 1 && cpu.fcy === 0); }
// 6. ANA AC quirk: bit3 of (A|v)
{ const { cpu } = run([0x3E, 0x08, 0xE6, 0x08, 0x76]); t("ani AC=bit3(A|v) set", cpu.fac === 1 && cpu.a === 0x08); }
{ const { cpu } = run([0x3E, 0x04, 0xE6, 0x02, 0x76]); t("ani AC clear + Z", cpu.fac === 0 && cpu.fz === 1 && cpu.fcy === 0); }
// 7. XRA/ORA clear AC and CY
{ const { cpu } = run([0x3E, 0xFF, 0x37, 0xEE, 0x0F, 0x76]); t("xri", cpu.a === 0xF0 && cpu.fcy === 0 && cpu.fac === 0 && cpu.fs === 1); }
// 8. DAA basic BCD add: 15 + 27 = 42 BCD
{ const { cpu } = run([0x3E, 0x15, 0xC6, 0x27, 0x27, 0x76]); // ADI 27h; DAA
  t("daa 15+27=42", cpu.a === 0x42 && cpu.fcy === 0 && cpu.fac === 1); }
// 9. DAA msb>=9 && lsb>9 case: 0x9A -> +0x66 -> 0x00, CY=1
{ const { cpu } = run([0x3E, 0x9A, 0x27, 0x76]);
  t("daa 9A edge", cpu.a === 0x00 && cpu.fcy === 1 && cpu.fz === 1); }
// 10. Parity: 0x07 has 3 bits -> P=0 (odd)
{ const { cpu } = run([0x3E, 0x07, 0xB7, 0x76]); t("parity odd", cpu.fp === 0); } // ORA A
// 11. PSW byte: Z+CY set, others clear -> 0x43; PUSH PSW then inspect memory
{ const { cpu, mem } = run([0x3E, 0x00, 0xB7, 0x37, 0xF5, 0x76]); // ORA A (Z=1,P=1); STC; PUSH PSW
  t("psw byte pattern", mem[0xEFFE] === ((1 << 6) | (1 << 2) | 0x02 | 1) && mem[0xEFFF] === 0x00); }
// 12. POP PSW masks bits 3/5, forces bit1
{ const { cpu } = run([0x01, 0xFF, 0xFF, 0xC5, 0xF1, 0xF5, 0x76], (c) => {}); // LXI B,FFFF; PUSH B; POP PSW; PUSH PSW
  t("pop psw mask", (cpu.f & 0x28) === 0 && (cpu.f & 0x02) === 0x02 && cpu.a === 0xFF); }
// 13. INR/DCR leave CY; DCR AC rule
{ const { cpu } = run([0x37, 0x3E, 0x10, 0x3D, 0x76]); // STC; MVI A,10; DCR A
  t("dcr keeps CY", cpu.fcy === 1); t("dcr result", cpu.a === 0x0F);
  t("dcr AC (low nibble was 0 -> AC=0)", cpu.fac === 0); }
{ const { cpu } = run([0x3E, 0x0F, 0x3C, 0x76]); t("inr AC at 0x0F", cpu.fac === 1 && cpu.a === 0x10); }
// 14. DAD: only CY; 0x8000 + 0x8000 -> CY=1, HL=0
{ const { cpu } = run([0x21, 0x00, 0x80, 0x01, 0x00, 0x80, 0x09, 0x76]); // LXI H; LXI B; DAD B
  t("dad", cpu.hl === 0 && cpu.fcy === 1 && cpu.fz === 0); }
// 15. XCHG / XTHL / SPHL / PCHL
{ const { cpu, mem } = run([0x21, 0x34, 0x12, 0x11, 0x78, 0x56, 0xEB, 0xE5, 0x21, 0xCD, 0xAB, 0xE3, 0x76]);
  // LXI H,1234; LXI D,5678; XCHG (HL=5678,DE=1234); PUSH H; LXI H,ABCD; XTHL
  t("xchg", cpu.de === 0x1234);
  t("xthl hl<-stack", cpu.hl === 0x5678);
  t("xthl stack<-hl", mem[0xEFFE] === 0xCD && mem[0xEFFF] === 0xAB && cpu.sp === 0xEFFE); }
// 16. Conditional timing: JMP always 10; CALL 17/11; RET 11/5
{ // explicit timing measurements
  const mem = new Uint8Array(65536);
  mem.set([0x3E, 0x01, 0xB7, 0xC4, 0x00, 0x02, 0x76], 0x0100); mem[0x0200] = 0x76;
  const cpu = new Cpu8080({ read: (a) => mem[a], write: (a, v) => { mem[a] = v; } });
  cpu.pc = 0x0100; cpu.sp = 0xF000;
  { let g = 100000; while (!cpu.halted && g--) cpu.step(); if (g <= 0) throw new Error('manual test did not halt'); }
  t("cnz taken timing", cpu.cycles === 7 + 4 + 17 + 7 && cpu.pc === 0x0201);
}
{ const { cpu } = run([0xAF, 0xC4, 0x00, 0x02, 0x76]); // XRA A (Z); CNZ not taken
  t("cnz not-taken timing", cpu.cycles === 4 + 11 + 7); }
{ const mem = new Uint8Array(65536);
  mem.set([0xAF, 0xCD, 0x00, 0x02, 0x76], 0x0100); mem.set([0xC8, 0x76], 0x0200); // XRA A; CALL 0200 / RZ (taken); HLT never
  const cpu = new Cpu8080({ read: (a) => mem[a], write: (a, v) => { mem[a] = v; } });
  cpu.pc = 0x0100; cpu.sp = 0xF000;
  { let g = 100000; while (!cpu.halted && g--) cpu.step(); if (g <= 0) throw new Error('manual test did not halt'); }
  t("rz taken timing", cpu.cycles === 4 + 17 + 11 + 7 && cpu.pc === 0x0105);
}
// 17. Undocumented aliases: 0x08 NOP, 0xCB JMP, 0xD9 RET
{ const mem = new Uint8Array(65536);
  mem.set([0x08, 0xCB, 0x00, 0x02], 0x0100); mem.set([0xCD, 0x04, 0x02, 0x76, 0xD9], 0x0200); // *NOP; *JMP 0200; CALL 0204; HLT <- *RET
  const cpu = new Cpu8080({ read: (a) => mem[a], write: (a, v) => { mem[a] = v; } });
  cpu.pc = 0x0100; cpu.sp = 0xF000;
  { let g = 100000; while (!cpu.halted && g--) cpu.step(); if (g <= 0) throw new Error('manual test did not halt'); }
  t("undocumented aliases", cpu.pc === 0x0204 && cpu.insns === 5);
}
// 18. STA/LDA/SHLD/LHLD roundtrip
{ const { cpu, mem } = run([0x21, 0x34, 0x12, 0x22, 0x00, 0x40, 0x2A, 0x00, 0x40, 0x3E, 0x99, 0x32, 0x02, 0x40, 0x3A, 0x02, 0x40, 0x76]);
  t("shld/lhld", cpu.hl === 0x1234 && mem[0x4000] === 0x34 && mem[0x4001] === 0x12);
  t("sta/lda", cpu.a === 0x99); }
// 19. Rotates touch only CY
{ const { cpu } = run([0x3E, 0x81, 0xB7, 0x07, 0x76]); // ORA A sets S=1,P=1; RLC
  t("rlc", cpu.a === 0x03 && cpu.fcy === 1 && cpu.fs === 1); } // S untouched by RLC
{ const { cpu } = run([0x3E, 0x01, 0x0F, 0x76]); t("rrc", cpu.a === 0x80 && cpu.fcy === 1); }
{ const { cpu } = run([0x37, 0x3E, 0x00, 0x17, 0x76]); t("ral pulls CY", cpu.a === 0x01 && cpu.fcy === 0); }
// 20. RST vector + iterative fib(10)=55 with deterministic cycles
{ const mem = new Uint8Array(65536);
  mem.set([0xEF, 0x76], 0x0100); mem.set([0x3E, 0x2A, 0xC9], 0x0028); // RST 5 -> MVI A,2A; RET
  const cpu = new Cpu8080({ read: (a) => mem[a], write: (a, v) => { mem[a] = v; } });
  cpu.pc = 0x0100; cpu.sp = 0xF000;
  { let g = 100000; while (!cpu.halted && g--) cpu.step(); if (g <= 0) throw new Error('manual test did not halt'); }
  t("rst", cpu.a === 0x2A && cpu.pc === 0x0102);
}
{ // fib: B=n(10), DE=prev(0), HL=cur(1); loop: DAD? use ADD via registers
  const prog = [
    0x06, 0x0A,             // MVI B,10
    0x11, 0x00, 0x00,       // LXI D,0
    0x21, 0x01, 0x00,       // LXI H,1
    // loop: (HL,DE) = (HL+DE, HL)
    0xEB,                   // XCHG          ; DE=cur, HL=prev
    0x19,                   // DAD D         ; HL = prev+cur = next... wait HL=prev, DAD D adds cur -> HL=next
    0x05,                   // DCR B
    0xC2, 0x08, 0x01,       // JNZ loop(0x0108)
    0x76,                   // HLT           ; DE = fib(10)
  ];
  const { cpu } = run(prog);
  t("fib(10) DE=55", cpu.de === 55);
  t("fib deterministic cycles", cpu.cycles === 7 + 10 + 10 + 10 * (4 + 10 + 5) + 9 * 10 + 10 + 7);
}
console.log(`${pass}/${pass + fail} tests passed`);
process.exit(fail ? 1 : 0);
