using System.Collections.Generic;
using System.Text.Json;
class Clean : ISolution {
    public object Solve(Dictionary<string, object> c) {
        long n = ((JsonElement)c["n"]).GetInt64();
        long a = 0, b = 1;
        for (long i = 0; i < n; i++) { long t = a + b; a = b; b = t; }
        return a;
    }
}
