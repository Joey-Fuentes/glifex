// THE relocation boundary probe. auipc/addi is RISC-V's adrp/:lo12: -- a
// PC-relative pair against .data, so it carries R_RISCV_* relocs and needs a
// LINK. On aarch64 the equivalent relocated freely to a malloc'd base because
// adrp encodes a page delta; whether auipc behaves the same way is exactly the
// question, not an assumption.
// kata() -> the quad at myval
    .text
    .globl kata
kata:
    lla     t0, myval                // expands to auipc + addi
    ld      a0, 0(t0)
    ret
    .data
    .align 3
myval:
    .quad 0x1122334455667788
