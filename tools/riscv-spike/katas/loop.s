# gate: branches + mul. Also a known-length stream for a step counter.
# kata(_, n) -> sum of squares 1..n
    .text
    .globl kata
kata:
    li      t0, 0                    # acc
1:  beqz    a1, 2f
    mul     t1, a1, a1
    add     t0, t0, t1
    addi    a1, a1, -1
    j       1b
2:  mv      a0, t0
    ret
