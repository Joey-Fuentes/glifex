# void practice(const long *nums, long n, long target, long *out)
# rdi=nums, rsi=n, rdx=target, rcx=out
# Fill out[0], out[1] with the indices (i < j) of the two nums summing to target.
    .text
    .globl practice
practice:
    movq    $-1, (%rcx)          # TODO: replace with your solution
    movq    $-1, 8(%rcx)
    ret
    .section .note.GNU-stack,"",@progbits
