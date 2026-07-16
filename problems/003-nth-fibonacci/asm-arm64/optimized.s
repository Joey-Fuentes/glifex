// long optimized(long n) -- fast doubling, O(log n) time, O(1) space
//   fib(2k)   = fib(k) * (2*fib(k+1) - fib(k))
//   fib(2k+1) = fib(k)^2 + fib(k+1)^2
// Walk the bits of n from the MSB down, maintaining a = fib(k), b = fib(k+1).
    .text
    .globl optimized
.globl _optimized
optimized:
_optimized:
    cbz     x0, 4f                   // fib(0) = 0
    mov     x1, #0                   // a = fib(0)
    mov     x2, #1                   // b = fib(1)
    clz     x3, x0
    mov     x4, #63
    sub     x4, x4, x3               // x4 = index of the most significant set bit
1:  lsl     x5, x2, #1               // 2b
    sub     x5, x5, x1               // 2b - a
    mul     x5, x1, x5               // d = a * (2b - a)   == fib(2k)
    mul     x6, x1, x1               // a^2
    madd    x6, x2, x2, x6           // e = a^2 + b^2      == fib(2k+1)
    lsr     x7, x0, x4               // current bit of n
    tbz     x7, #0, 2f
    mov     x1, x6                   // bit set:   a = e
    add     x2, x5, x6               //            b = d + e
    b       3f
2:  mov     x1, x5                   // bit clear: a = d
    mov     x2, x6                   //            b = e
3:  subs    x4, x4, #1
    b.ge    1b                       // signed: stops after bit 0
    mov     x0, x1
    ret
4:  mov     x0, #0
    ret
