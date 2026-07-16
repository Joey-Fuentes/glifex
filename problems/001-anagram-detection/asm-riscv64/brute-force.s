# int brute_force(const char *s, const char *t)
# Naive O(n*m): equal lengths, and every char of s occurs equally often in s
# and t. No table -- rescan both strings for each character of s.
    .text
    .globl brute_force
brute_force:
    mv      t0, a0                   # strlen(s)
    li      t1, 0
1:  lbu     t2, 0(t0)
    beqz    t2, 2f
    addi    t0, t0, 1
    addi    t1, t1, 1
    j       1b
2:  mv      t0, a1                   # strlen(t)
    li      t2, 0
3:  lbu     t3, 0(t0)
    beqz    t3, 4f
    addi    t0, t0, 1
    addi    t2, t2, 1
    j       3b
4:  bne     t1, t2, 9f               # different lengths -> not an anagram
    mv      t0, a0                   # for each char c of s
5:  lbu     t1, 0(t0)
    beqz    t1, 8f                   # end of s -> every count matched
    li      t2, 0                    # count c in s
    mv      t3, a0
6:  lbu     t4, 0(t3)
    beqz    t4, 61f
    bne     t4, t1, 62f
    addi    t2, t2, 1
62: addi    t3, t3, 1
    j       6b
61: li      t5, 0                    # count c in t
    mv      t3, a1
7:  lbu     t4, 0(t3)
    beqz    t4, 71f
    bne     t4, t1, 72f
    addi    t5, t5, 1
72: addi    t3, t3, 1
    j       7b
71: bne     t2, t5, 9f               # counts differ -> not an anagram
    addi    t0, t0, 1
    j       5b
8:  li      a0, 1
    ret
9:  li      a0, 0
    ret
