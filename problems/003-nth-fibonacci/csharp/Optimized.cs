using System.Collections.Generic;
using System.Text.Json;
class Optimized : ISolution {
    public object Solve(Dictionary<string, object> c) {
        long n = ((JsonElement)c["n"]).GetInt64();
        // Same O(n) window slide as Clean, unrolled 2x (advances two Fib steps per
        // loop check). Constant-factor win, stays in the declared O(n) class.
        long a = 0, b = 1;
        if ((n & 1) == 1) { long t = a + b; a = b; b = t; n--; }
        while (n > 0) { long t = a + b; b = t + b; a = t; n -= 2; }
        return a;
    }
}
