# long brute_force(long n) -- naive recursion
# The obvious definition: fib(n) = fib(n-1) + fib(n-2).
# O(phi^n) time, O(n) call-stack depth.
    .text
    .globl brute_force
brute_force:
    li      t0, 2
    blt     a0, t0, 2f               # fib(0)=0, fib(1)=1
    addi    sp, sp, -32              # ra + two callee-saved regs
    sd      ra, 24(sp)
    sd      s0, 16(sp)
    sd      s1, 8(sp)
    mv      s0, a0                   # keep n
    addi    a0, s0, -1
    call    brute_force              # fib(n-1)
    mv      s1, a0
    addi    a0, s0, -2
    call    brute_force              # fib(n-2)
    add     a0, a0, s1
    ld      s1, 8(sp)
    ld      s0, 16(sp)
    ld      ra, 24(sp)
    addi    sp, sp, 32
    ret
2:  ret
