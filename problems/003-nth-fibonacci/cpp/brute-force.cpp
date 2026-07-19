#include "solution.hpp"

// O(phi^n): the definition read literally -- fib(n) = fib(n-1) + fib(n-2),
// recomputing the same subproblems exponentially many times. The obvious
// starting point clean.cpp/optimized.cpp improve on.
static long long fib(long long n) {
    if (n < 2) return n;
    return fib(n - 1) + fib(n - 2);
}

Value bruteforce(const Input& c) {
    long long n = (long long)c.obj.at("n")->num;
    return jnum((double)fib(n));
}
