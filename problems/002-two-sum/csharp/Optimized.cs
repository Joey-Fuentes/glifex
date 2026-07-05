using System.Collections.Generic;
using System.Text.Json;
class Optimized : ISolution {
    public object Solve(Dictionary<string, object> c) {
        var target = ((JsonElement)c["target"]).GetInt64();
        var seen = new Dictionary<long, int>();
        int i = 0;
        foreach (var el in ((JsonElement)c["nums"]).EnumerateArray()) {
            long n = el.GetInt64();
            if (seen.TryGetValue(target - n, out var j)) return new[] { j, i };
            seen[n] = i; i++;
        }
        return new int[0];
    }
}
