using System.Collections.Generic;
using System.Text.Json;
class BruteForce : ISolution {
    public object Solve(Dictionary<string, object> c) {
        long n = ((JsonElement)c["n"]).GetInt64();
        // Obvious approach: the naive recursive definition. O(phi^n).
        return Fib(n);
    }
    static long Fib(long n) => n < 2 ? n : Fib(n - 1) + Fib(n - 2);
}
