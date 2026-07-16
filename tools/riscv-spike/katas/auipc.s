# THE RELOCATION BOUNDARY. lla expands to auipc+addi -- RISC-V's adrp/:lo12:.
# On aarch64 the equivalent relocated freely to a malloc'd base because adrp
# encodes a page delta, which is why Bx-10's corpus needed no
# position-independence constraint. Whether auipc survives libriscv's own
# addressing is the question this answers.
    .text
    .globl kata
kata:
    lla     t0, myval
    ld      a0, 0(t0)
    ret
    .data
    .align 3
myval:
    .quad 0x1122334455667788
