# void brute_force(const long *nums, long n, long target, long *out)
# rdi=nums, rsi=n, rdx=target, rcx=out
    .text
    .globl brute_force
brute_force:
    xor     %r8, %r8             # i = 0
.Lbo:
    cmp     %rsi, %r8
    jge     .Lbnone
    lea     1(%r8), %r9          # j = i+1
.Lbi:
    cmp     %rsi, %r9
    jge     .Lbi_done
    mov     (%rdi,%r8,8), %rax
    add     (%rdi,%r9,8), %rax
    cmp     %rdx, %rax
    jne     .Lbi_next
    mov     %r8, (%rcx)
    mov     %r9, 8(%rcx)
    ret
.Lbi_next:
    inc     %r9
    jmp     .Lbi
.Lbi_done:
    inc     %r8
    jmp     .Lbo
.Lbnone:
    movq    $-1, (%rcx)
    movq    $-1, 8(%rcx)
    ret
    .section .note.GNU-stack,"",@progbits
