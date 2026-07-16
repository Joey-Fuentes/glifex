// gate: does anything execute at all, and does ret terminate?
// RISC-V: a0-a7 are args, a0 is the return. ret == jalr x0, ra, 0.
// kata(a, b) -> a + b
    .text
    .globl kata
kata:
    add     a0, a0, a1
    ret
