/*
 * Glifex Java worker (Bx-8) -- runs OFF the main thread. Compiles the user's Java
 * solution ONCE with teavm-javac (OpenJDK javac + TeaVM, compiled to WebAssembly),
 * caches the compiled module, and drives every case by feeding inputs at RUNTIME as
 * main() args. Cases are NOT baked into the source: teavm-javac's javac overflows its
 * compile stack on large/branchy source, so the compiled program is kept small and
 * fixed-size while the (many, large, lab-swept) inputs arrive at run time. Each case is
 * timed with System.nanoTime (adaptive reps) so the Complexity Lab gets a per-case tNs.
 *
 * Module worker (import()), single-threaded, no SharedArrayBuffer / cross-origin
 * isolation. The compiler is booted once per session and reused; the compiled app is
 * cached per source so the Lab's size-sweep (repeated run() with the same solution but
 * different inputs) only compiles on the first call.
 *
 * KNOWN LIMIT: teavm-javac's javac has a low compile ceiling. Ordinary constructs
 * (HashMap/generics, Arrays.sort/asList, List.of, recursion) can overflow it; when that
 * happens the compile throws and we report a clean error rather than hanging the tab.
 */
import { load } from "./vendor/java/compiler.wasm-runtime.js";

const US = "\u0001";   // field separator within a case (proven to generate cleanly)
const GS = "\u0002";   // element separator within an array field
const MARK = "GLX";    // printable marker for a per-case result line (control chars break TeaVM generateWebAssembly)

let bootP = null;
function boot() {
  if (bootP) return bootP;
  bootP = (async () => {
    async function bin(u) {
      const r = await fetch(u);
      if (!r.ok) throw new Error("fetch " + u + " -> " + r.status);
      return new Int8Array(await r.arrayBuffer());
    }
    const teavm = await load("./vendor/java/compiler.wasm");
    const compiler = teavm.exports.createCompiler();
    compiler.setSdk(await bin("./vendor/java/compile-classlib-teavm.bin"));
    compiler.setTeaVMClasslib(await bin("./vendor/java/runtime-classlib-teavm.bin"));
    return { load, compiler };
  })().catch((e) => { bootP = null; throw e; });
  return bootP;
}

// Encode a JS value to the wire format the generated harness decodes.
function encVal(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(encVal).join(GS);
  return String(v);
}
function encodeCase(input, order) {
  return order.map((k) => encVal(input && input[k])).join(US);
}

// Java's String.valueOf, mirrored in JS, so we can compare the guest's printed output.
function javaStr(v) {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "[" + v.map(javaStr).join(", ") + "]";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

// Generate the MINIMAL, type-specific decode for THIS problem's input shape. A generic
// (multi-branch) decoder overflows teavm-javac, so we emit only what this shape needs.
function genDecode(sample) {
  const keys = Object.keys(sample || {});
  const lines = keys.map((k, idx) => {
    const v = sample[k];
    const f = "p[" + idx + "]";
    const key = JSON.stringify(k);
    if (Array.isArray(v)) {
      const el = v.length ? v[0] : "";
      const parse =
        (typeof el === "number" && Number.isInteger(el)) ? "Long.valueOf(xs[j])" :
        (typeof el === "number") ? "Double.valueOf(xs[j])" :
        (typeof el === "boolean") ? "(xs[j].equals(\"1\")?Boolean.TRUE:Boolean.FALSE)" :
        "xs[j]";
      return "List<Object> a" + idx + "=new ArrayList<>(); if(" + f + ".length()>0){ String[] xs=" + f +
        ".split(\"" + GS + "\",-1); for(int j=0;j<xs.length;j++) a" + idx + ".add(" + parse + "); } in.put(" + key + ",a" + idx + ");";
    }
    if (typeof v === "boolean") return "in.put(" + key + ", " + f + ".equals(\"1\")?Boolean.TRUE:Boolean.FALSE);";
    if (typeof v === "number" && Number.isInteger(v)) return "in.put(" + key + ", Long.valueOf(" + f + "));";
    if (typeof v === "number") return "in.put(" + key + ", Double.valueOf(" + f + "));";
    return "in.put(" + key + ", " + f + ");";
  });
  return { decode: lines.join("\n      "), order: keys };
}

// Transform the user's source (drop the Solution interface dependency -- we call solve()
// directly) and inject a fixed harness main() that decodes each arg, runs solve, and
// adaptive-rep times it.
function buildProgram(userSource, decodeBody) {
  let src = String(userSource || "");
  if (!/import\s+java\.util\./.test(src)) src = "import java.util.*;\n" + src;
  src = src.replace(/\bimplements\s+Solution\b/, "");
  const harness =
        '  public static void main(String[] __a){\n' +
    '    Practice __sol=new Practice();\n' +
    '    for(int __i=0;__i<__a.length;__i++){\n' +
    '      String[] p=__a[__i].split("' + US + '",-1);\n' +
    '      Map<String,Object> in=new LinkedHashMap<>();\n' +
    '      ' + decodeBody + '\n' +
    '      Object got=__sol.solve(in);\n' +
    '      long __best=Long.MAX_VALUE;\n' +
    '      for(int __r=0;__r<5;__r++){ long __t=System.nanoTime(); for(int __k=0;__k<50;__k++) __sol.solve(in); long __d=(System.nanoTime()-__t)/50; if(__d<__best)__best=__d; }\n' +
    '      System.out.println("' + MARK + '\\t"+__i+"\\t"+__best+"\\t"+String.valueOf(got));\n' +
    '    }\n' +
    '  }\n';
  const idx = src.lastIndexOf("}");
  if (idx < 0) return src + "\n" + harness;
  return src.slice(0, idx) + harness + "}\n";
}

const cache = { source: null, app: null, order: null };

self.addEventListener("message", async (e) => {
  const d = e.data || {};
  if (d.id !== "run") return;
  try {
    const cases = d.cases || [];
    if (cases.length === 0) return void self.postMessage({ id: "error", error: "No test cases were provided." });

    const { load: loadWasm, compiler } = await boot();

    if (cache.source !== d.source) {
      const { decode, order } = genDecode(cases[0] && cases[0].input);
      const program = buildProgram(d.source, decode);
      try { compiler.clearSourceFiles(); } catch (_) {}
      try { compiler.clearOutputFiles(); } catch (_) {}
      const diags = [];
      const reg = compiler.onDiagnostic((x) => {
        if (x && (x.severity === "error")) diags.push((x.lineNumber ? "line " + x.lineNumber + ": " : "") + (x.message || ""));
      });
      compiler.addSourceFile("Practice.java", program);
      let ok;
      try {
        ok = compiler.compile();
      } catch (ce) {
        return void self.postMessage({
          id: "error",
          error: "The in-browser Java compiler ran out of room compiling this solution. This is a known limit of the Java runtime with some constructs (e.g. HashMap/generics, Arrays.sort/asList, recursion) -- try a simpler approach.",
        });
      } finally {
        try { reg && reg.destroy && reg.destroy(); } catch (_) {}
      }
      if (!ok) return void self.postMessage({ id: "error", error: "Java compile error:\n" + diags.slice(0, 6).join("\n").slice(0, 800) });
      if (!compiler.generateWebAssembly({ outputName: "app", mainClass: "Practice" }))
        return void self.postMessage({ id: "error", error: "Java code generation failed (TeaVM)." });
      const app = await loadWasm(compiler.getWebAssemblyOutputFile("app.wasm"));
      cache.source = d.source; cache.app = app; cache.order = order;
    }

    const args = cases.map((c) => encodeCase(c.input, cache.order));
    let cap = "";
    const orig = console.log;
    console.log = (...a) => { cap += a.map(String).join(" ") + "\n"; };
    const t0 = performance.now();
    try { const r = cache.app.exports.main(args); if (r && r.then) await r; }
    finally { console.log = orig; }
    const wall = performance.now() - t0;

    const byI = new Map();
    for (const line of cap.split("\n")) {
      if (!line.startsWith(MARK + "\t")) continue;
      const parts = line.split("\t");
      byI.set(Number(parts[1]), { ns: Number(parts[2]), got: parts.slice(3).join("\t") });
    }
    if (byI.size === 0)
      return void self.postMessage({ id: "error", error: "The Java program produced no results:\n" + cap.trim().slice(0, 600) });

    const results = cases.map((c, i) => {
      const r = byI.get(i);
      if (!r) return { i, ok: false, error: "no result for case", expected: c.expected };
      const ok = c.expected === undefined ? true : (javaStr(c.expected) === r.got);
      return { i, ok, got: ok ? c.expected : r.got, expected: c.expected, tNs: r.ns > 0 ? r.ns : null };
    });
    self.postMessage({ id: "result", results, nsPerCase: cases.length ? (wall * 1e6) / cases.length : 0 });
  } catch (err) {
    self.postMessage({ id: "error", error: String((err && err.message) || err) });
  }
});

self.addEventListener("error", (e) => {
  self.postMessage({ id: "error", error: "Java worker crashed (uncaught): " + String((e && e.message) || e) });
});
