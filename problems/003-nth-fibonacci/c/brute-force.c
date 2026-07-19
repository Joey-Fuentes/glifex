#define solve __glifex_ref_bruteforce
#include "solution.h"

/* O(phi^n): the definition read literally -- fib(n) = fib(n-1) + fib(n-2),
   recomputing the same subproblems exponentially many times. The obvious
   starting point clean.c/optimized.c improve on. */
static long long fib(long long n) {
    if (n < 2) return n;
    return fib(n - 1) + fib(n - 2);
}

JVal *solve(JVal *c) {
    long long n = (long long)jget(c, "n")->num;
    return jnum_((double)fib(n));
}
