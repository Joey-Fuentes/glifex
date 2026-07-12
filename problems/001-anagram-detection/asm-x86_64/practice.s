# int practice(const char *s, const char *t)
# rdi = s, rsi = t. Stub: always returns 0 (not an anagram).
    .text
    .globl practice
practice:
    xor     %eax, %eax
    ret
    .section .note.GNU-stack,"",@progbits
