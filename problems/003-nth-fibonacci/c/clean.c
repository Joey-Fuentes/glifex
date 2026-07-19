#define solve __glifex_ref_clean
#include "solution.h"

/* O(n) time, O(1) space: slide a two-element window (a, b) = (fib(k), fib(k+1))
   forward n times. The straightforward linear solution. */
JVal *solve(JVal *c) {
    long long n = (long long)jget(c, "n")->num;
    long long a = 0, b = 1;
    for (long long i = 0; i < n; i++) {
        long long t = a + b;
        a = b;
        b = t;
    }
    return jnum_((double)a);
}
