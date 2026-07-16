# void brute_force(const long *nums, long n, long target, long *out)
# a0=nums, a1=n, a2=target, a3=out
# Every pair, no allocation. O(n^2) time, O(1) space -- the baseline clean and
# optimized improve on.
    .text
    .globl brute_force
brute_force:
    li      t0, 0                    # i = 0
1:  bge     t0, a1, 4f
    addi    t1, t0, 1                # j = i + 1
2:  bge     t1, a1, 3f
    slli    t2, t0, 3
    add     t2, a0, t2
    ld      t3, 0(t2)                # nums[i]
    slli    t2, t1, 3
    add     t2, a0, t2
    ld      t4, 0(t2)                # nums[j]
    add     t3, t3, t4
    bne     t3, a2, 5f
    sd      t0, 0(a3)                # out[0] = i
    sd      t1, 8(a3)                # out[1] = j
    ret
5:  addi    t1, t1, 1
    j       2b
3:  addi    t0, t0, 1
    j       1b
4:  li      t0, -1
    sd      t0, 0(a3)
    sd      t0, 8(a3)
    ret
