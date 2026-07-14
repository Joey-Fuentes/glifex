# long brute_force(long n) — naive recursion
    .text
    .globl brute_force
brute_force:
    cmp     $2, %rdi
    jl      .Lb_base
    push    %rbx
    push    %r12
    mov     %rdi, %rbx
    lea     -1(%rbx), %rdi
    call    brute_force
    mov     %rax, %r12
    lea     -2(%rbx), %rdi
    call    brute_force
    add     %r12, %rax
    pop     %r12
    pop     %rbx
    ret
.Lb_base:
    mov     %rdi, %rax
    ret
    .section .note.GNU-stack,"",@progbits
