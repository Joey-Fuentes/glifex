// void practice(const long *nums, long n, long target, long *out)
// x0 = nums, x1 = n, x2 = target, x3 = out
// Fill out[0], out[1] with the indices (i < j) of the two nums summing to
// target. Write -1, -1 if there is no such pair.
    .text
    .globl practice
.globl _practice
practice:
_practice:
    mov     x4, #-1                  // TODO: replace with your solution
    str     x4, [x3]
    str     x4, [x3, #8]
    ret
