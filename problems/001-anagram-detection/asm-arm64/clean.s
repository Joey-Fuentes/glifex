// int practice(const char *s, const char *t)
// x0 = s, x1 = t. Counting table on the stack; returns 1 iff anagram.
    .text
    .globl clean
.globl _clean
clean:
_clean:
    sub     sp, sp, #1024        // int count[256]
    mov     x8, sp
    mov     x9, #128             // zero as 128 doublewords
1:  str     xzr, [x8], #8
    subs    x9, x9, #1
    b.ne    1b
2:  ldrb    w9, [x0], #1         // count s
    cbz     w9, 3f
    add     x10, sp, w9, uxtw #2
    ldr     w11, [x10]
    add     w11, w11, #1
    str     w11, [x10]
    b       2b
3:  ldrb    w9, [x1], #1         // discount t
    cbz     w9, 4f
    add     x10, sp, w9, uxtw #2
    ldr     w11, [x10]
    sub     w11, w11, #1
    str     w11, [x10]
    b       3b
4:  mov     x8, sp               // all counts must be zero
    mov     x9, #256
5:  ldr     w11, [x8], #4
    cbnz    w11, 6f
    subs    x9, x9, #1
    b.ne    5b
    mov     w0, #1
    add     sp, sp, #1024
    ret
6:  mov     w0, #0
    add     sp, sp, #1024
    ret
