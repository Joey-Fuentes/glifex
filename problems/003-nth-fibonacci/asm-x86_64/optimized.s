# long optimized(long n) — fast doubling, O(log n)
    .text
    .globl optimized
optimized:
    test    %rdi, %rdi
    jnz     .Lo_go
    xor     %eax, %eax
    ret
.Lo_go:
    mov     %rdi, %r11          # n
    bsr     %rdi, %rcx          # rcx = index of highest set bit
    xor     %r8, %r8            # a = fib(0) = 0
    mov     $1, %r9             # b = fib(1) = 1
.Lo_loop:
    lea     (%r9,%r9), %rax     # 2b
    sub     %r8, %rax           # 2b - a
    imul    %r8, %rax           # c = a*(2b - a)
    mov     %rax, %r10          # r10 = c
    mov     %r8, %rax
    imul    %r8, %rax           # a*a
    mov     %r9, %rdx
    imul    %r9, %rdx           # b*b
    add     %rdx, %rax          # d = a*a + b*b
    mov     %r11, %rdx
    shr     %cl, %rdx           # n >> i
    and     $1, %rdx
    jz      .Lo_even
    mov     %rax, %r8           # a = d
    add     %r10, %rax          # c + d
    mov     %rax, %r9           # b = c + d
    jmp     .Lo_next
.Lo_even:
    mov     %r10, %r8           # a = c
    mov     %rax, %r9           # b = d
.Lo_next:
    test    %rcx, %rcx
    jz      .Lo_done
    dec     %rcx
    jmp     .Lo_loop
.Lo_done:
    mov     %r8, %rax           # return a
    ret
    .section .note.GNU-stack,"",@progbits
