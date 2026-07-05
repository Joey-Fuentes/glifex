# int practice(const char *s, const char *t)
# rdi = s, rsi = t. Counting table on the stack; returns 1 iff anagram.
    .text
    .globl clean
clean:
    sub     $1024, %rsp          # int count[256]
    xor     %eax, %eax
    mov     $128, %ecx           # zero 1024 bytes as 128 quadwords
    mov     %rsp, %r8
.Lzero:
    movq    %rax, (%r8)
    add     $8, %r8
    dec     %ecx
    jnz     .Lzero
.Lcount_s:
    movzbl  (%rdi), %eax
    test    %eax, %eax
    je      .Lcount_t
    incl    (%rsp,%rax,4)
    inc     %rdi
    jmp     .Lcount_s
.Lcount_t:
    movzbl  (%rsi), %eax
    test    %eax, %eax
    je      .Lcheck
    decl    (%rsp,%rax,4)
    inc     %rsi
    jmp     .Lcount_t
.Lcheck:
    mov     $256, %ecx
    mov     %rsp, %r8
.Lchk:
    cmpl    $0, (%r8)
    jne     .Lfail
    add     $4, %r8
    dec     %ecx
    jnz     .Lchk
    mov     $1, %eax
    add     $1024, %rsp
    ret
.Lfail:
    xor     %eax, %eax
    add     $1024, %rsp
    ret
    .section .note.GNU-stack,"",@progbits
