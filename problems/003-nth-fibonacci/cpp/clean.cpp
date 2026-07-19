#include "solution.hpp"

// O(n) time, O(1) space: slide a two-element window (a, b) = (fib(k), fib(k+1))
// forward n times. The straightforward linear solution.
Value clean(const Input& c) {
    long long n = (long long)c.obj.at("n")->num;
    long long a = 0, b = 1;
    for (long long i = 0; i < n; i++) {
        long long t = a + b;
        a = b;
        b = t;
    }
    return jnum((double)a);
}
