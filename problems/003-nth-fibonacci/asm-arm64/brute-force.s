// long brute_force(long n) -- naive recursion
// The obvious definition: fib(n) = fib(n-1) + fib(n-2).
// O(phi^n) time, O(n) call-stack depth.
    .text
    .globl brute_force
.globl _brute_force
brute_force:
_brute_force:
    cmp     x0, #2
    b.lt    2f                       // fib(0)=0, fib(1)=1
    stp     x29, x30, [sp, #-32]!    // AAPCS64 frame; x30 is the return address
    mov     x29, sp
    stp     x19, x20, [sp, #16]      // callee-saved: we clobber them across bl
    mov     x19, x0                  // keep n
    sub     x0, x19, #1
    bl      brute_force              // fib(n-1)
    mov     x20, x0
    sub     x0, x19, #2
    bl      brute_force              // fib(n-2)
    add     x0, x0, x20
    ldp     x19, x20, [sp, #16]
    ldp     x29, x30, [sp], #32
    ret
2:  ret
