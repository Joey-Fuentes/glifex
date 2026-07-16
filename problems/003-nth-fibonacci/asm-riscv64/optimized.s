# long optimized(long n) -- fast doubling, O(log n) time, O(1) space
#   fib(2k)   = fib(k) * (2*fib(k+1) - fib(k))
#   fib(2k+1) = fib(k)^2 + fib(k+1)^2
# Walk the bits of n from the top down, maintaining a = fib(k), b = fib(k+1).
#
# NOTE FOR RV64G: there is no count-leading-zeros -- clz is in Zbb, not in the G
# set, unlike aarch64. A loop that searches for the MSB from bit 63 costs ~60
# wasted iterations and made this variant SLOWER than clean at the Lab's sizes
# (371 instructions vs clean's 102).
#
# No search is needed. A leading ZERO bit is a no-op for fast doubling: with
# a=0, b=1 it computes d = 0*(2*1-0) = 0 and e = 0^2 + 1^2 = 1, leaving a=0, b=1
# unchanged. And fib(93) is the largest Fibonacci number that fits in an
# unsigned 64-bit result, so n < 128 and the MSB is never above bit 6. Starting
# there costs 7 fixed iterations and no search at all.
    .text
    .globl optimized
optimized:
    beqz    a0, 4f                   # fib(0) = 0
    li      t0, 0                    # a = fib(0)
    li      t1, 1                    # b = fib(1)
    # Find the MSB index without clz: a 3-step unrolled binary search. Costs ~9
    # instructions and buys back the iterations a fixed start would waste --
    # fib(93) is the largest that fits in u64, so n < 128 and the MSB is <= 6.
    mv      t6, a0
    li      t2, 0
    li      t3, 16
    bltu    t6, t3, 1f
    addi    t2, t2, 4
    srli    t6, t6, 4
1:  li      t3, 4
    bltu    t6, t3, 2f
    addi    t2, t2, 2
    srli    t6, t6, 2
2:  li      t3, 2
    bltu    t6, t3, 3f
    addi    t2, t2, 1
3:  slli    t3, t1, 1                # 2b
    sub     t3, t3, t0               # 2b - a
    mul     t3, t0, t3               # d = a * (2b - a)   == fib(2k)
    mul     t4, t0, t0               # a^2
    mul     t5, t1, t1               # b^2
    add     t4, t4, t5               # e = a^2 + b^2      == fib(2k+1)
    srl     t5, a0, t2               # current bit of n
    andi    t5, t5, 1
    beqz    t5, 5f
    mv      t0, t4                   # bit set:   a = e
    add     t1, t3, t4               #            b = d + e
    j       6f
5:  mv      t0, t3                   # bit clear: a = d
    mv      t1, t4                   #            b = e
6:  addi    t2, t2, -1
    bgez    t2, 3b
    mv      a0, t0
    ret
4:  li      a0, 0
    ret
