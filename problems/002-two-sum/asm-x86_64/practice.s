# void practice(const long *nums, long n, long target, long *out) — stub
    .text
    .globl practice
practice:
    movq    $-1, (%rcx)
    movq    $-1, 8(%rcx)
    ret
    .section .note.GNU-stack,"",@progbits
