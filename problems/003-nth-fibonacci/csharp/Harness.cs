// Generated harness — do not edit. Reads ../test_cases.json, runs a variant via reflection.
using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Collections.Generic;

class Harness {
    // CLI entry point: the exit code signals pass/fail to the shell. The browser
    // runtime invokes Run(...) directly instead -- Environment.Exit tears down the
    // persistent wasm runtime, so the exit lives only here in Main. Both paths run
    // identical logic (Run); this is the CLI-vs-embedded seam, not a second harness.
    static void Main(string[] args) { Environment.Exit(Run(args)); }

    public static int Run(string[] args) {
        string variant = args.Length > 0 ? args[0] : "practice";
        // variant -> class name: hyphenated variants (brute-force) become PascalCase
        // (BruteForce), matching the source file's class. Single-word variants are
        // unchanged (practice -> Practice).
        string cls = string.Concat(variant.Split('-').Select(p => char.ToUpper(p[0]) + p.Substring(1)));
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
        return passed == cases.Count ? 0 : 1;
    }
}
