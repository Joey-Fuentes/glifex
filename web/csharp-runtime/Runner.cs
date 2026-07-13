// Glifex C# browser runtime -- managed side.
//
// Compiles the UNMODIFIED CLI Harness.cs together with ISolution.cs and the
// three variant files, exactly as the CLI does, then runs Harness.Main([variant]).
// The harness reads ../test_cases.json from the virtual FS and prints the same
// [PASS]/[FAIL] + "N/M passed" lines the C track's harness.c prints -- so
// csharp-worker.js parses this output the same way loadC() parses C output, and
// the browser verdict is identical to the CLI verdict by construction (one
// harness, no second implementation to drift).
//
// Proven viable by the csharp-bootstrap spike (5 CI iterations):
//   - dotnet-wasm + Roslyn boot + JSExport marshalling  (RAN_OK)
//   - virtual FS supports Harness.cs's File.ReadAllText("../test_cases.json") (FS_OK)
//   - Roslyn compiles in-wasm with WithConcurrentBuild(false) (single-threaded,
//     no COI) and byte-image references (a.Location is empty in wasm).
using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Collections.Generic;
using System.Runtime.Loader;
using System.Runtime.InteropServices.JavaScript;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

public partial class Runner {
    // OutputType=Exe needs an entry point; JS invokes Run via getAssemblyExports.
    public static void Main() { }

    // filesJson : { "Harness.cs": "...", "ISolution.cs": "...",
    //               "Practice.cs": "...", "Clean.cs": "...", "Optimized.cs": "..." }
    // casesJson : the problem's cases array, written verbatim to test_cases.json
    // variant   : "practice" | "clean" | "optimized" (passed to Harness.Main)
    //
    // Returns the harness's own stdout. Sentinel-prefixed strings signal the two
    // non-run outcomes so the worker can distinguish them from harness output:
    //   "GLIFEX_COMPILE_ERROR\n<diagnostics>"  -- user code did not compile
    //   "GLIFEX_RUNTIME_ERROR\n<type: message>" -- host-level failure
    [JSExport]
    public static string Run(string filesJson, string casesJson, string variant) {
        try {
            var files = JsonSerializer.Deserialize<Dictionary<string, string>>(filesJson);
            var trees = files
                .Select(kv => CSharpSyntaxTree.ParseText(kv.Value, path: kv.Key))
                .ToList();
            var refs = Basic.Reference.Assemblies.Net90.References.All
                .Cast<MetadataReference>();

            var comp = CSharpCompilation.Create("glifex_problem", trees, refs,
                new CSharpCompilationOptions(OutputKind.ConsoleApplication)
                    .WithConcurrentBuild(false));   // single-threaded: no monitors

            using var ms = new MemoryStream();
            var emit = comp.Emit(ms);
            if (!emit.Success) {
                var errs = emit.Diagnostics
                    .Where(d => d.Severity == DiagnosticSeverity.Error)
                    .Select(d => d.ToString());
                return "GLIFEX_COMPILE_ERROR\n" + string.Join("\n", errs);
            }

            // Recreate the CLI's on-disk layout: harness does
            // File.ReadAllText(Path.Combine("..","test_cases.json")) from its cwd,
            // so put the file at /work and run from /work/app.
            Directory.CreateDirectory("/work/app");
            File.WriteAllText("/work/test_cases.json", casesJson);
            Directory.SetCurrentDirectory("/work/app");

            ms.Seek(0, SeekOrigin.Begin);
            // Collectible context: the worker reuses one persistent runtime across
            // runs, so unload each compiled assembly instead of accumulating them.
            var alc = new AssemblyLoadContext("glifex-run", isCollectible: true);
            var sw = new StringWriter();
            var prev = Console.Out;
            Console.SetOut(sw);
            try {
                var asm = alc.LoadFromStream(ms);
                // Invoke Harness.Run(string[]) -- the inner method that RETURNS an
                // exit code. Invoking Main would call Environment.Exit, which tears
                // down the whole persistent wasm runtime (proven in CI: a failing
                // run terminated the process with ExitStatus, uncatchable in managed
                // code). Run prints the same [PASS]/[FAIL] lines and just returns.
                var runM = asm.GetType("Harness")
                    ?.GetMethod("Run", BindingFlags.Public | BindingFlags.Static);
                if (runM == null)
                    return "GLIFEX_RUNTIME_ERROR\nHarness.Run(string[]) not found";
                runM.Invoke(null, new object[] { new string[] { variant } });
            } finally {
                Console.SetOut(prev);
                alc.Unload();
            }
            return sw.ToString();
        } catch (Exception ex) {
            // Unwrap reflection's TargetInvocationException so the REAL error
            // (type + message) surfaces instead of "Arg_TargetInvocationException".
            var real = ex;
            while (real is TargetInvocationException && real.InnerException != null)
                real = real.InnerException;
            return "GLIFEX_RUNTIME_ERROR\n" + real.GetType().Name + ": " + real.Message;
        }
    }
}
