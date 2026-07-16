# kata(a, b) -> a + b
# RISC-V: a0-a7 are args, a0 is the return, ret == jalr x0, ra, 0.
# NOTE the '#' -- RISC-V's as uses it for comments where aarch64 uses '//'.
# Every kata in an earlier round failed on exactly that.
    .text
    .globl kata
kata:
    add     a0, a0, a1
    ret
