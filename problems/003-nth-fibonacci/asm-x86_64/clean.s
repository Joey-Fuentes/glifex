# long clean(long n) — iterative
    .text
    .globl clean
clean:
    cmp     $2, %rdi
    jl      .Lc_base
    xor     %r8, %r8             # prev = fib(0)
    mov     $1, %r9             # curr = fib(1)
    mov     %rdi, %rcx          # i = n
    dec     %rcx                # n-1 iterations
.Lc_loop:
    mov     %r8, %rax
    add     %r9, %rax           # next = prev + curr
    mov     %r9, %r8            # prev = curr
    mov     %rax, %r9           # curr = next
    dec     %rcx
    jnz     .Lc_loop
    mov     %r9, %rax
    ret
.Lc_base:
    mov     %rdi, %rax
    ret
    .section .note.GNU-stack,"",@progbits
