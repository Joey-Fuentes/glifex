// void optimized(const long *nums, long n, long target, long *out)
// x0=nums, x1=n, x2=target, x3=out
//
// Same single-pass hash map as clean, but with a Fibonacci (multiply-shift)
// hash instead of masking the low bits. Masking clusters badly on the inputs
// this problem attracts -- consecutive or evenly-spaced values collide into
// adjacent slots and linear probing degrades. Multiplying by the 64-bit golden
// ratio and taking the HIGH bits spreads them, so the probe chains stay short.
// Same O(n) time and O(n) space; fewer instructions per lookup in practice.
    .text
    .globl optimized
.globl _optimized
optimized:
_optimized:
    stp     x29, x30, [sp, #-16]!
    mov     x29, sp
    lsl     x4, x1, #1
    cmp     x4, #16
    b.ge    1f
    mov     x4, #16
1:  sub     x5, x4, #1
    clz     x5, x5
    mov     x6, #64
    sub     x6, x6, x5               // bits = ceil(log2(2n))
    mov     x4, #1
    lsl     x4, x4, x6               // cap = 1 << bits
    mov     x7, #64
    sub     x7, x7, x6               // shift = 64 - bits
    lsl     x8, x4, #4
    sub     x9, sp, x8
    bic     x9, x9, #15
    mov     sp, x9
    mov     x10, x9
    mov     x11, x4
2:  stp     xzr, xzr, [x10], #16
    subs    x11, x11, #1
    b.ne    2b
    ldr     x13, =0x9E3779B97F4A7C15 // 2^64 / phi -- PC-relative literal pool
    sub     x4, x4, #1               // mask, for wrapping the probe
    mov     x10, #0
3:  cmp     x10, x1
    b.ge    8f
    ldr     x11, [x0, x10, lsl #3]   // v = nums[i]
    sub     x12, x2, x11             // want = target - v
    mul     x14, x12, x13
    lsr     x14, x14, x7             // slot = (want * phi) >> shift
4:  add     x15, x9, x14, lsl #4
    ldr     x16, [x15, #8]
    cbz     x16, 5f
    ldr     x17, [x15]
    cmp     x17, x12
    b.ne    6f
    sub     x16, x16, #1
    str     x16, [x3]
    str     x10, [x3, #8]
    b       9f
6:  add     x14, x14, #1
    and     x14, x14, x4
    b       4b
5:  mul     x14, x11, x13
    lsr     x14, x14, x7             // slot for v itself
7:  add     x15, x9, x14, lsl #4
    ldr     x16, [x15, #8]
    cbz     x16, 10f
    add     x14, x14, #1
    and     x14, x14, x4
    b       7b
10: str     x11, [x15]
    add     x16, x10, #1
    str     x16, [x15, #8]
    add     x10, x10, #1
    b       3b
8:  mov     x16, #-1
    str     x16, [x3]
    str     x16, [x3, #8]
9:  mov     sp, x29
    ldp     x29, x30, [sp], #16
    ret
