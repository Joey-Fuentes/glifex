# kata(_, n) -> sum of squares 1..n. The same kata that ran on the Pixel under
# Bx-10 and returned 55 as an exit code.
    .text
    .globl kata
kata:
    li      t0, 0
1:  beqz    a1, 2f
    mul     t1, a1, a1
    add     t0, t0, t1
    addi    a1, a1, -1
    j       1b
2:  mv      a0, t0
    ret
