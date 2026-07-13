using System.Linq;
using System.Collections.Generic;
using System.Text.Json;
class BruteForce : ISolution {
    public object Solve(Dictionary<string, object> c) {
        long target = ((JsonElement)c["target"]).GetInt64();
        var nums = ((JsonElement)c["nums"]).EnumerateArray().Select(e => e.GetInt64()).ToArray();
        // Check every pair -- the obvious first approach, O(n^2).
        for (int i = 0; i < nums.Length; i++)
            for (int j = i + 1; j < nums.Length; j++)
                if (nums[i] + nums[j] == target) return new[] { i, j };
        return new int[0];
    }
}
