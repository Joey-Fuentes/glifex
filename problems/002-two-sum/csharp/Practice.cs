using System.Collections.Generic;
using System.Text.Json;
class Practice : ISolution {
    public object Solve(Dictionary<string, object> c) {
        var target = ((JsonElement)c["target"]).GetInt64();
        var nums = (JsonElement)c["nums"];
        // Return the indices [i, j] (i < j) of the two numbers in nums that add up to target.
        return new int[0];
    }
}
