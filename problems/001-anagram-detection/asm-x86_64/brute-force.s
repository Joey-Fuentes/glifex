# int brute_force(const char *s, const char *t)
# Naive O(n*m): equal lengths, and every char of s occurs equally often in s and t.
    .text
    .globl brute_force
brute_force:
    push    %rbx
    push    %r12
    push    %r13
    push    %r14
    mov     %rdi, %r12           # s
    mov     %rsi, %r13           # t
    # len(s)
    xor     %rax, %rax
.Lls:
    cmpb    $0, (%r12,%rax)
    je      .Lls_done
    inc     %rax
    jmp     .Lls
.Lls_done:
    mov     %rax, %r14           # r14 = len(s)
    # len(t)
    xor     %rax, %rax
.Llt:
    cmpb    $0, (%r13,%rax)
    je      .Llt_done
    inc     %rax
    jmp     .Llt
.Llt_done:
    cmp     %rax, %r14           # len(s) == len(t)?
    jne     .Lno
    xor     %rbx, %rbx           # i = 0
.Louter:
    cmp     %r14, %rbx
    jge     .Lyes
    movzbl  (%r12,%rbx), %edi    # c = s[i]
    # count c in s
    xor     %rcx, %rcx           # cs
    xor     %rax, %rax
.Lcs:
    cmp     %r14, %rax
    jge     .Lcs_done
    movzbl  (%r12,%rax), %edx
    cmp     %edi, %edx
    jne     .Lcs_next
    inc     %rcx
.Lcs_next:
    inc     %rax
    jmp     .Lcs
.Lcs_done:
    # count c in t
    xor     %r8, %r8             # ct
    xor     %rax, %rax
.Lct:
    cmp     %r14, %rax
    jge     .Lct_done
    movzbl  (%r13,%rax), %edx
    cmp     %edi, %edx
    jne     .Lct_next
    inc     %r8
.Lct_next:
    inc     %rax
    jmp     .Lct
.Lct_done:
    cmp     %rcx, %r8
    jne     .Lno
    inc     %rbx
    jmp     .Louter
.Lyes:
    mov     $1, %eax
    jmp     .Ldone
.Lno:
    xor     %eax, %eax
.Ldone:
    pop     %r14
    pop     %r13
    pop     %r12
    pop     %rbx
    ret
    .section .note.GNU-stack,"",@progbits
