// long clean(long n) -- iterative
// x0 = n, returns fib(n) in x0. O(n) time, O(1) space.
    .text
    .globl clean
.globl _clean
clean:
_clean:
    cmp     x0, #2
    b.lt    2f                       // fib(0)=0, fib(1)=1 -- n is its own answer
    mov     x1, #0                   // prev = fib(0)
    mov     x2, #1                   // curr = fib(1)
    sub     x3, x0, #1               // n-1 iterations
1:  add     x4, x1, x2               // next = prev + curr
    mov     x1, x2
    mov     x2, x4
    subs    x3, x3, #1
    b.ne    1b
    mov     x0, x2
    ret
2:  ret
