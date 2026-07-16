// Honest stack probe: claim x0 bytes, FILL the whole region with a pattern,
// read it all back, return 1 only if every byte survived. A write that escapes
// into unrelated memory will not round-trip cleanly.
    .text
    .globl probe
probe:
    mov     x1, sp
    sub     sp, sp, x0
    mov     x2, sp
    mov     x3, x0
    lsr     x3, x3, #3               // qwords
    mov     x4, #0
1:  str     x4, [x2], #8
    add     x4, x4, #1
    subs    x3, x3, #1
    b.ne    1b
    mov     x2, sp                   // read back
    mov     x3, x0
    lsr     x3, x3, #3
    mov     x4, #0
2:  ldr     x5, [x2], #8
    cmp     x5, x4
    b.ne    3f
    add     x4, x4, #1
    subs    x3, x3, #1
    b.ne    2b
    mov     sp, x1
    mov     x0, #1
    ret
3:  mov     sp, x1
    mov     x0, #0
    ret
