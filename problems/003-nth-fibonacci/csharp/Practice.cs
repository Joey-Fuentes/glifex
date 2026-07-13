using System.Collections.Generic;
using System.Text.Json;
class Practice : ISolution {
    public object Solve(Dictionary<string, object> c) {
        long n = ((JsonElement)c["n"]).GetInt64();
        // Return the nth Fibonacci number: fib(0)=0, fib(1)=1, fib(2)=1, ...
        return 0;
    }
}
