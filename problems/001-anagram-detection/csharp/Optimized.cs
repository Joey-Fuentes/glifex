using System;
using System.Collections.Generic;
class Optimized : ISolution {
    public object Solve(Dictionary<string, object> c) {
        string s = c["s"].ToString(), t = c["t"].ToString();
        if (s.Length != t.Length) return false;
        var count = new Dictionary<char, int>();
        foreach (var ch in s) count[ch] = count.GetValueOrDefault(ch) + 1;
        foreach (var ch in t) {
            if (!count.ContainsKey(ch) || count[ch] == 0) return false;
            count[ch]--;
        }
        return true;
    }
}
