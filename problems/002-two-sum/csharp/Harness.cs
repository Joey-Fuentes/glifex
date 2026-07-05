// Generated harness — do not edit. Reads ../test_cases.json, runs a variant via reflection.
using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Collections.Generic;

class Harness {
    static void Main(string[] args) {
        string variant = args.Length > 0 ? args[0] : "practice";
        string cls = char.ToUpper(variant[0]) + variant.Substring(1);
        var sol = (ISolution)Activator.CreateInstance(Type.GetType(cls));
        var raw = File.ReadAllText(Path.Combine("..", "test_cases.json"));
        var cases = JsonSerializer.Deserialize<List<JsonElement>>(raw);
        int passed = 0;
        for (int i = 0; i < cases.Count; i++) {
            var input = JsonSerializer.Deserialize<Dictionary<string, object>>(cases[i].GetProperty("input").GetRawText());
            var got = sol.Solve(input);
            var exp = JsonSerializer.Serialize(cases[i].GetProperty("expected"));
            bool ok = JsonSerializer.Serialize(got) == exp;
            if (ok) { passed++; Console.WriteLine($"  [PASS] case {i}"); }
            else Console.WriteLine($"  [FAIL] case {i}  expected={exp} got={got}");
        }
        Console.WriteLine($"{passed}/{cases.Count} passed");
        if (passed != cases.Count) Environment.Exit(1);
    }
}
