// Generated harness — do not edit. Reads ../test_cases.json, runs the solution.
using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Diagnostics;
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
        // Find the solution by INTERFACE, not by class name. Every variant exposes
        // the same entry point (ISolution.Solve), matching the problem statement's
        // solve(...). In the browser only ONE ISolution class is compiled (the
        // editor / "practice" slot), so we run whatever it is named -- paste any
        // variant with no rename. In the CLI all variant files compile together, so
        // several ISolution types exist: pick the one matching the variant arg.
        var sols = Assembly.GetExecutingAssembly().GetTypes()
            .Where(t => typeof(ISolution).IsAssignableFrom(t) && !t.IsInterface && !t.IsAbstract)
            .ToList();
        Type chosen;
        if (sols.Count <= 1) {
            chosen = sols.FirstOrDefault();
        } else {
            string cls = string.Concat(variant.Split('-').Select(p => char.ToUpper(p[0]) + p.Substring(1)));
            chosen = sols.FirstOrDefault(t => t.Name == cls) ?? sols[0];
        }
        if (chosen == null) {
            Console.WriteLine("error: no class implementing ISolution found");
            return 1;
        }
        var sol = (ISolution)Activator.CreateInstance(chosen);
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
            {
                // Always emit per-case time + space for the Complexity Lab (cheap:
                // the Run button pays ~2ms/case, Analyze needs it). TIME: adaptively repeat the pure Solve past the clock grain
                // (>= 2ms total), report per-call ns. Compile + startup are excluded
                // by construction. Same model as the C harness -> "[METRIC] case i ns=X".
                long reps = 1, el = 0;
                double nsPerTick = 1e9 / Stopwatch.Frequency;
                while (true) {
                    long a = Stopwatch.GetTimestamp();
                    for (long r = 0; r < reps; r++) sol.Solve(input);
                    long b = Stopwatch.GetTimestamp();
                    el = (long)((b - a) * nsPerTick);
                    if (el >= 2000000L || reps >= 1048576) break;
                    reps *= 2;
                }
                Console.WriteLine($"[METRIC] case {i} ns={el / reps}");
                // SPACE: bytes allocated by one Solve = allocation VOLUME (an upper
                // bound on peak; a managed GC runtime exposes no true peak-workspace
                // counter). The Lab labels this "allocation volume (approx)".
                long b0 = GC.GetTotalAllocatedBytes(true);
                sol.Solve(input);
                long heap = GC.GetTotalAllocatedBytes(true) - b0;
                Console.WriteLine($"[SPACE] case {i} heap={heap}");
            }
        }
        Console.WriteLine($"{passed}/{cases.Count} passed");
        return passed == cases.Count ? 0 : 1;
    }
}
