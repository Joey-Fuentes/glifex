#define solve __glifex_ref_optimized
#include "solution.h"

/* Same O(n) window-slide as clean.c, unrolled 2x: peel one step when n is odd
   so the remaining count is even, then advance two Fibonacci steps per
   iteration-counter check. A genuine constant-factor win that stays in the
   manifest's declared O(n) class (mirrors python/optimized.py and the 8080
   optimized.s peel-odd + unrolled-pair trick). */
JVal *solve(JVal *c) {
    long long n = (long long)jget(c, "n")->num;
    long long a = 0, b = 1;
    if (n & 1) {
        long long t = a + b;
        a = b;
        b = t;
        n -= 1;
    }
    while (n > 0) {
        long long t = a + b;
        b = t + b;
        a = t;
        n -= 2;
    }
    return jnum_((double)a);
}
