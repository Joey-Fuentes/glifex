import java.util.*;
// Brute force: the naive recursive definition. Exponential O(phi^n) time,
// linear call-stack depth. The obvious statement of the problem, and the
// baseline the O(n) Clean/Optimized improve on. Non-public (file is Brute-force.java).
class BruteForce implements Solution {
    public Object solve(Map<String, Object> c) {
        long n = ((Number) c.get("n")).longValue();
        return fib(n);
    }
    static long fib(long n) {
        return n < 2 ? n : fib(n - 1) + fib(n - 2);
    }
}
