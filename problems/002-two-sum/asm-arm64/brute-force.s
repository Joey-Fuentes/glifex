// void brute_force(const long *nums, long n, long target, long *out)
// x0=nums, x1=n, x2=target, x3=out
// Every pair, no allocation. O(n^2) time, O(1) space -- the baseline clean
// and optimized improve on.
    .text
    .globl brute_force
.globl _brute_force
brute_force:
_brute_force:
    mov     x4, #0                   // i = 0
1:  cmp     x4, x1
    b.ge    4f
    add     x5, x4, #1               // j = i + 1
2:  cmp     x5, x1
    b.ge    3f
    ldr     x6, [x0, x4, lsl #3]     // nums[i]
    ldr     x7, [x0, x5, lsl #3]     // nums[j]
    add     x6, x6, x7
    cmp     x6, x2
    b.ne    5f
    str     x4, [x3]                 // out[0] = i
    str     x5, [x3, #8]             // out[1] = j
    ret
5:  add     x5, x5, #1
    b       2b
3:  add     x4, x4, #1
    b       1b
4:  mov     x6, #-1
    str     x6, [x3]
    str     x6, [x3, #8]
    ret
