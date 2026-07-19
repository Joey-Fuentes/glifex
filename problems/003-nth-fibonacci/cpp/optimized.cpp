#include "solution.hpp"

// Same O(n) window-slide as clean.cpp, unrolled 2x: peel one step when n is odd
// so the remaining count is even, then advance two Fibonacci steps per
// iteration-counter check. A genuine constant-factor win that stays in the
// manifest's declared O(n) class (mirrors python/optimized.py and the 8080
// optimized.s peel-odd + unrolled-pair trick).
Value optimized(const Input& c) {
    long long n = (long long)c.obj.at("n")->num;
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
    return jnum((double)a);
}
