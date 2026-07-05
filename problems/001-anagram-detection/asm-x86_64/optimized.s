# int optimized(const char *s, const char *t)
# Early length check, then counting table with early exit on negative count.
    .text
    .globl optimized
optimized:
    mov     %rdi, %r9            # strlen(s)
    xor     %rax, %rax
.Llen_s:
    cmpb    $0, (%r9)
    je      .Llen_t
    inc     %r9
    jmp     .Llen_s
.Llen_t:
    sub     %rdi, %r9            # r9 = len(s)
    mov     %rsi, %r10
.Llt:
    cmpb    $0, (%r10)
    je      .Llt_done
    inc     %r10
    jmp     .Llt
.Llt_done:
    sub     %rsi, %r10           # r10 = len(t)
    cmp     %r9, %r10
    jne     .Lno
    sub     $1024, %rsp
    xor     %eax, %eax
    mov     $128, %ecx
    mov     %rsp, %r8
.Lz:
    movq    %rax, (%r8)
    add     $8, %r8
    dec     %ecx
    jnz     .Lz
.Lcs:
    movzbl  (%rdi), %eax
    test    %eax, %eax
    je      .Lct
    incl    (%rsp,%rax,4)
    inc     %rdi
    jmp     .Lcs
.Lct:
    movzbl  (%rsi), %eax
    test    %eax, %eax
    je      .Lyes
    decl    (%rsp,%rax,4)
    js      .Lno_pop             # went negative: not an anagram
    inc     %rsi
    jmp     .Lct
.Lyes:
    mov     $1, %eax
    add     $1024, %rsp
    ret
.Lno_pop:
    add     $1024, %rsp
.Lno:
    xor     %eax, %eax
    ret
    .section .note.GNU-stack,"",@progbits
