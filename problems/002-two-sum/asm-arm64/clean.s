// void clean(const long *nums, long n, long target, long *out)
// x0=nums, x1=n, x2=target, x3=out
//
// Single-pass hash map with linear probing, in a STACK-allocated table:
// cap = next power of two >= 2n, 16 bytes per slot (key, index+1). A slot with
// index 0 is empty, so index+1 is stored and 0 is the sentinel -- nums may
// legitimately contain 0.
//
// O(n) time, O(n) space. The table is on the stack rather than the heap
// because the browser runs this on VIXL, which simulates a CPU and not a
// kernel -- there is no mmap behind an svc. The guest stack is 1 MB
// (docs/vixl-arm64.md), and 2n slots at n=1024 is 32 KB.
    .text
    .globl clean
.globl _clean
clean:
_clean:
    stp     x29, x30, [sp, #-16]!
    mov     x29, sp
    lsl     x4, x1, #1               // 2n
    cmp     x4, #16
    b.ge    1f
    mov     x4, #16                  // floor: tiny inputs still get a table
1:  sub     x5, x4, #1
    clz     x5, x5
    mov     x6, #64
    sub     x6, x6, x5
    mov     x4, #1
    lsl     x4, x4, x6               // cap = next pow2 >= 2n
    sub     x7, x4, #1               // mask
    lsl     x8, x4, #4               // cap * 16 bytes
    sub     x9, sp, x8
    bic     x9, x9, #15              // 16-byte aligned table base
    mov     sp, x9
    mov     x10, x9                  // zero it
    mov     x11, x4
2:  stp     xzr, xzr, [x10], #16
    subs    x11, x11, #1
    b.ne    2b
    mov     x10, #0                  // i = 0
3:  cmp     x10, x1
    b.ge    8f
    ldr     x11, [x0, x10, lsl #3]   // v = nums[i]
    sub     x12, x2, x11             // want = target - v
    and     x14, x12, x7             // probe for want
4:  add     x15, x9, x14, lsl #4
    ldr     x16, [x15, #8]
    cbz     x16, 5f                  // empty slot -> want not seen yet
    ldr     x17, [x15]
    cmp     x17, x12
    b.ne    6f
    sub     x16, x16, #1             // stored index+1
    str     x16, [x3]                // out[0] = earlier index
    str     x10, [x3, #8]            // out[1] = i
    b       9f
6:  add     x14, x14, #1
    and     x14, x14, x7
    b       4b
5:  and     x14, x11, x7             // insert v -> i
7:  add     x15, x9, x14, lsl #4
    ldr     x16, [x15, #8]
    cbz     x16, 10f
    add     x14, x14, #1
    and     x14, x14, x7
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
