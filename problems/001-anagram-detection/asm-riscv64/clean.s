# int clean(const char *s, const char *t)
# a0 = s, a1 = t. Counting table on the stack; returns 1 iff anagram.
    .text
    .globl clean
clean:
    addi    sp, sp, -1024            # int count[256]
    mv      t0, sp
    li      t1, 128                  # zero as 128 doublewords
1:  sd      zero, 0(t0)
    addi    t0, t0, 8
    addi    t1, t1, -1
    bnez    t1, 1b
2:  lbu     t1, 0(a0)                # count s
    beqz    t1, 3f
    slli    t2, t1, 2
    add     t2, sp, t2
    lw      t3, 0(t2)
    addi    t3, t3, 1
    sw      t3, 0(t2)
    addi    a0, a0, 1
    j       2b
3:  lbu     t1, 0(a1)                # discount t
    beqz    t1, 4f
    slli    t2, t1, 2
    add     t2, sp, t2
    lw      t3, 0(t2)
    addi    t3, t3, -1
    sw      t3, 0(t2)
    addi    a1, a1, 1
    j       3b
4:  mv      t0, sp                   # all counts must be zero
    li      t1, 256
5:  lw      t3, 0(t0)
    bnez    t3, 6f
    addi    t0, t0, 4
    addi    t1, t1, -1
    bnez    t1, 5b
    li      a0, 1
    addi    sp, sp, 1024
    ret
6:  li      a0, 0
    addi    sp, sp, 1024
    ret
