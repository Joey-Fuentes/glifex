# long clean(long n) -- iterative
# a0 = n, returns fib(n) in a0. O(n) time, O(1) space.
    .text
    .globl clean
clean:
    li      t0, 2
    blt     a0, t0, 2f               # fib(0)=0, fib(1)=1 -- n is its own answer
    li      t1, 0                    # prev = fib(0)
    li      t2, 1                    # curr = fib(1)
    addi    t3, a0, -1               # n-1 iterations
1:  add     t4, t1, t2               # next = prev + curr
    mv      t1, t2
    mv      t2, t4
    addi    t3, t3, -1
    bnez    t3, 1b
    mv      a0, t2
    ret
2:  ret
