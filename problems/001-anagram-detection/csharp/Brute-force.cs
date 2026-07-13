using System.Linq;
using System.Collections.Generic;
class BruteForce : ISolution {
    public object Solve(Dictionary<string, object> c) {
        string s = c["s"].ToString(), t = c["t"].ToString();
        if (s.Length != t.Length) return false;
        // Obvious approach: for every character, compare its count in both strings.
        foreach (var ch in s)
            if (s.Count(x => x == ch) != t.Count(x => x == ch)) return false;
        return true;
    }
}
