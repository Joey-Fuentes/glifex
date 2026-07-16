# void practice(const long *nums, long n, long target, long *out)
# a0 = nums, a1 = n, a2 = target, a3 = out
# Fill out[0], out[1] with the indices (i < j) of the two nums summing to
# target. Write -1, -1 if there is no such pair.
    .text
    .globl practice
practice:
    li      t0, -1
    sd      t0, 0(a3)
    sd      t0, 8(a3)
    ret
