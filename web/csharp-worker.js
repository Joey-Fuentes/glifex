/*
 * Glifex C# worker (Bx-5c) -- runs the vendored .NET-wasm + Roslyn runtime OFF
 * the main thread, so the ~1-3s Roslyn compile no longer freezes the UI. Boots
 * once per page session and reuses the runtime across runs (Runner.Run loads
 * each compiled assembly into a collectible AssemblyLoadContext and unloads it,
 * so memory stays bounded). Single-threaded (the runner disables Roslyn
 * concurrency), so no SharedArrayBuffer / cross-origin isolation is needed.
 *
 * WHY THE window SHIM (this is the whole reason Bx-5 first shipped on the main
 * thread): the .NET loader picks its boot path from `typeof window == "object"`.
 * A dedicated worker has no `window`, so the loader mis-routes to its internal
 * runtime-worker path -- the one meant for workers the runtime itself spawns as
 * children of a main-thread host -- which waits for a host handshake that never
 * comes, and dotnet.create() hangs forever (confirmed via trace: all assets
 * load 200, create() never resolves, across BOTH module and classic workers).
 * Defining a minimal `window` (= self) makes the loader take the normal
 * fetch-based web path, which works fine in a worker. The loader's `document`
 * uses are all guarded (`globalThis.document && ...`), so we deliberately do NOT
 * shim document -- those branches simply skip. MUST run before importing
 * dotnet.js, since env detection happens at import/create time.
 */
self.window = self;
try { self.window.location = self.location; } catch (_) {}

// MODULE worker (loadCsharp passes { type: "module" }) + the window shim above
// is the combination that boots. Emscripten sets ENVIRONMENT_IS_WEB from
// `typeof window` and ENVIRONMENT_IS_WORKER from `typeof importScripts`. A
// classic worker HAS importScripts -> WORKER=true, and the runtime's worker
// path hangs even with window shimmed (trace-confirmed). A module worker has NO
// importScripts -> WORKER=false; with window shimmed WEB=true -- exactly the
// main-thread flags, where the runtime is known to boot. Dynamic import() (used
// below for dotnet.js) is allowed in module workers. IMPORTANT: this worker
// uses addEventListener("message",...) NOT self.onmessage= -- with window
// shimmed, the .NET loader installs its OWN self.onmessage handler during boot,
// and assigning self.onmessage clobbers it, hanging dotnet.create() (verified in
// a real browser). addEventListener coexists with the loader's handler.

let exportsPromise = null;
let bootStage = "idle";
function getExports() {
  if (exportsPromise) return exportsPromise;
  exportsPromise = (async () => {
    const t0 = Date.now();
    const t = () => (Date.now() - t0) / 1000 + "s";
    bootStage = "import(dotnet.js)";
    console.log("[csharp-worker] " + bootStage + " @" + t());
    const mod = await import("./vendor/csharp/dotnet.js");
    bootStage = "dotnet.create()";
    console.log("[csharp-worker] " + bootStage + " @" + t());
    const api = await mod.dotnet.create();
    bootStage = "getAssemblyExports()";
    console.log("[csharp-worker] " + bootStage + " @" + t());
    const cfg = api.getConfig();
    const ex = await api.getAssemblyExports(cfg.mainAssemblyName);
    bootStage = "ready";
    console.log("[csharp-worker] runtime ready in worker @" + t());
    return ex;
  })().catch((e) => {
    exportsPromise = null;   // allow a retry on the next run
    throw new Error("boot failed at stage [" + bootStage + "]: " + String((e && e.message) || e));
  });
  return exportsPromise;
}

self.addEventListener("message", async (e) => {
  const d = e.data || {};
  if (d.id !== "run") return;
  try {
    const exports = await getExports();
    const support = d.support || {};
    const files = {
      "Harness.cs": support["Harness.cs"] || "",
      "ISolution.cs": support["ISolution.cs"] || "",
      "Practice.cs": d.source || "",
    };
    const list = d.cases || [];
    const t0 = performance.now();
    const out = String(exports.Runner.Run(JSON.stringify(files), JSON.stringify(list), "practice") || "");
    const dt = performance.now() - t0;

    if (out.startsWith("GLIFEX_COMPILE_ERROR"))
      return void self.postMessage({ id: "error", error: "C# compile error:\n" + out.slice(20).trim().slice(0, 800) });
    if (out.startsWith("GLIFEX_RUNTIME_ERROR"))
      return void self.postMessage({ id: "error", error: "C# runtime error:\n" + out.slice(20).trim().slice(0, 800) });

    const byI = new Map();
    const nsById = new Map();
    const heapById = new Map();
    for (const line of out.split("\n")) {
      const m = line.match(/\[(PASS|FAIL)\]\s+case\s+(\d+)(?:\s+expected=(.*?)\s+got=(.*))?/);
      if (m) byI.set(Number(m[2]), { ok: m[1] === "PASS", exp: m[3], got: m[4] });
      const mm = line.match(/\[METRIC\]\s+case\s+(\d+)\s+ns=(\d+)/);
      if (mm) nsById.set(Number(mm[1]), Number(mm[2]));
      const ms = line.match(/\[SPACE\]\s+case\s+(\d+)\s+heap=(\d+)/);
      if (ms) heapById.set(Number(ms[1]), Number(ms[2]));
    }
    if (byI.size === 0)
      return void self.postMessage({ id: "error", error: "no case results from C# harness:\n" + out.trim().slice(0, 600) });

    const results = list.map((c, i) => {
      const r = byI.get(i);
      const tNs = nsById.has(i) && nsById.get(i) > 0 ? nsById.get(i) : null;
      const row = r
        ? (r.ok
            ? { i, ok: true, got: c.expected, expected: c.expected, tNs }
            : { i, ok: false, got: r.got != null ? r.got : "(see output)", expected: r.exp != null ? r.exp : c.expected, tNs })
        : { i, ok: false, error: "no result for case", expected: c.expected };
      if (heapById.has(i)) row.space = heapById.get(i);   // allocation volume (approx)
      return row;
    });
    // C# space is GC allocation volume (no true peak-workspace counter), so flag
    // it approximate + "volume" -- the Lab renders the allocation-volume disclaimer.
    self.postMessage({ id: "result", results, nsPerCase: list.length ? (dt * 1e6) / list.length : 0, spaceApprox: true, spaceApproxKind: "volume" });
  } catch (err) {
    self.postMessage({ id: "error", error: String((err && err.message) || err) });
  }
});

self.addEventListener("error", (e) => {
  self.postMessage({ id: "error", error: "C# worker crashed (uncaught): " + String((e && e.message) || e) });
});
