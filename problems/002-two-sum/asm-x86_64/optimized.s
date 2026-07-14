# void clean(const long *nums, long n, long target, long *out)
# Hash table (linear probing) in mmap'd memory. O(n) time, O(n) heap.
# rdi=nums, rsi=n, rdx=target, rcx=out
    .text
    .globl optimized
optimized:
    push    %rbx
    push    %rbp
    push    %r12
    push    %r13
    push    %r14
    push    %r15
    mov     %rdi, %r12           # nums
    mov     %rsi, %r13           # n
    mov     %rdx, %r14           # target
    mov     %rcx, %r15           # out
    # size = smallest power of two >= 2n+1, min 16
    mov     $16, %rbx
    lea     1(%r13,%r13), %rax   # 2n+1
.Losz:
    cmp     %rax, %rbx
    jge     .Losz_done
    add     %rbx, %rbx
    jmp     .Losz
.Losz_done:
    mov     %rbx, %rsi           # size
    shl     $4, %rsi             # size*16 bytes
    mov     $9, %rax             # mmap
    xor     %rdi, %rdi
    mov     $3, %rdx             # PROT_READ|PROT_WRITE
    mov     $0x22, %r10          # MAP_PRIVATE|MAP_ANONYMOUS
    mov     $-1, %r8
    xor     %r9, %r9
    syscall                      # rax = base (clobbers rcx, r11)
    mov     %rax, %rbp           # table base
    dec     %rbx                 # rbx = mask = size-1
    xor     %r8, %r8             # i = 0
.Lomain:
    cmp     %r13, %r8
    jge     .Lonone
    mov     (%r12,%r8,8), %r9    # x = nums[i]
    mov     %r14, %rdi
    sub     %r9, %rdi            # need = target - x
    mov     %rdi, %rax
    imul    $-1640531527, %rax, %rax   # x*0x9E3779B1 (mod 2^64)
    shr     $16, %rax
    and     %rbx, %rax
    mov     %rax, %rcx           # idx = hash(need)
.Lolook:
    mov     %rcx, %rax
    shl     $4, %rax
    add     %rbp, %rax           # entry
    mov     8(%rax), %rdx        # val
    test    %rdx, %rdx
    jz      .Loinsert             # empty slot -> need not present
    mov     (%rax), %rsi         # key
    cmp     %rdi, %rsi
    jne     .Lolook_next
    dec     %rdx                 # j = val-1
    mov     %rdx, (%r15)
    mov     %r8, 8(%r15)         # out = [j, i]
    jmp     .Lodone
.Lolook_next:
    inc     %rcx
    and     %rbx, %rcx
    jmp     .Lolook
.Loinsert:
    mov     %r9, %rax
    imul    $-1640531527, %rax, %rax
    shr     $16, %rax
    and     %rbx, %rax
    mov     %rax, %rcx           # idx = hash(x)
.Loins:
    mov     %rcx, %rax
    shl     $4, %rax
    add     %rbp, %rax
    mov     8(%rax), %rdx
    test    %rdx, %rdx
    jz      .Loins_do
    inc     %rcx
    and     %rbx, %rcx
    jmp     .Loins
.Loins_do:
    mov     %r9, (%rax)          # key = x
    lea     1(%r8), %rdx
    mov     %rdx, 8(%rax)        # val = i+1
    inc     %r8
    jmp     .Lomain
.Lonone:
    movq    $-1, (%r15)
    movq    $-1, 8(%r15)
.Lodone:
    pop     %r15
    pop     %r14
    pop     %r13
    pop     %r12
    pop     %rbp
    pop     %rbx
    ret
    .section .note.GNU-stack,"",@progbits
