// verify-dart-worker.mjs [vendor-dir]
//
// Drives the REAL web/dart-worker.js against the REAL vendored compiler, under
// node, before any browser wiring exists. Same idea as csharp-runtime-validate:
// prove the runner over every corpus source it will meet, then wire the UI.
//
// It IMPORTS the worker rather than re-deriving its synth. Bx-8b's Java rig
// learned this the expensive way: a rig that reimplements the thing it tests
// tests the rig. So the worker's own synth, its own escaping, its own remap and
// its own message handler are what run here -- the only things faked are the
// three the browser would provide (self, fetch, postMessage).
//
// This exists because CI could not otherwise see this file at all. web/vendor is
// cached on hashFiles('web/fetch-runtimes.mjs', 'tools/**', ci.yml) -- which does
// NOT include web/dart-worker.js -- so a change to the worker gets a cache hit,
// skips the vendor step, and would sail through green. That is precisely the gap
// that let the worker-isolation regression through (architecture.md, Decision
// 10). Hence: a SEPARATE step, outside the cache guard.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = process.argv[2] || "web/vendor/dart";
const fail = (m) => { console.error("verify-dart-worker: " + m); process.exit(1); };

// The worker's own import("./vendor/dart/gx_web.js") resolves against
// web/dart-worker.js, NOT against this argument -- so a different dir would fetch
// one set of artifacts and import another. Refuse rather than compare a compiler
// against someone else's platform.
if (resolve(dir) !== resolve("web/vendor/dart")) {
  fail("vendor-dir must be web/vendor/dart (got " + dir + ") -- the worker's own\n" +
       "  import() is relative to web/dart-worker.js and cannot be redirected.");
}

// ---- the three things a browser provides and node does not -----------------
// dart2js reaches its global through self. A browser worker has one; bare node
// does not, and without it the first await never resumes -- sync code runs, then
// silence. Sixteen rounds. See docs/dart2js-self-hosted.md section 7.
globalThis.self = globalThis;

const handlers = [];
// addEventListener, never self.onmessage. Assigning onmessage clobbered the
// loader's own handler and hung dotnet.create() in Bx-5.
globalThis.addEventListener = (type, fn) => { if (type === "message") handlers.push(fn); };

let deliver = null;
globalThis.postMessage = (msg) => { if (deliver) deliver(msg); };

globalThis.fetch = async (url) => {
  const name = String(url).split("/").pop();
  try {
    const buf = readFileSync(resolve(dir, name));
    return {
      ok: true,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      text: async () => buf.toString("utf8"),
    };
  } catch {
    return { ok: false, status: 404 };
  }
};

// ---- the real worker ------------------------------------------------------
await import("../../web/dart-worker.js");
if (handlers.length !== 1) fail("expected dart-worker.js to install exactly 1 message handler, got " + handlers.length);

const run = (source, cases) => new Promise((res) => {
  deliver = res;
  handlers[0]({ data: { id: "run", source, cases } });
});

const read = (p) => readFileSync(p, "utf8");
const cases = (id) => JSON.parse(read("problems/" + id + "/test_cases.json"));

let bad = 0;
const check = (cond, what) => {
  if (cond) console.log("  ok   " + what);
  else { console.log("  FAIL " + what); bad++; }
};

// ---- 1. every corpus source that exists, against its real cases ------------
// Correctness first, and against the real thing: a kata proves the compiler
// runs, not that the harness this worker synthesizes agrees with the CLI one.
for (const [id, variant] of [
  ["001-anagram-detection", "clean"],
  ["001-anagram-detection", "optimized"],
  ["002-two-sum", "clean"],
  ["002-two-sum", "optimized"],
]) {
  const cs = cases(id);
  const r = await run(read("problems/" + id + "/dart/" + variant + ".dart"), cs);
  if (r.id === "error") { console.log(id + " " + variant + ":\n" + r.error); check(false, id + " " + variant + " ran"); continue; }
  const passed = r.results.filter((x) => x.ok).length;
  check(passed === cs.length, id + " " + variant + " -- " + passed + "/" + cs.length + " cases pass");
  check(r.results.every((x) => x.tNs === null || x.tNs > 0), id + " " + variant + " -- every tNs is null or positive");
}

// ---- 2. practice, a stub -- must RUN, not crash ----------------------------
// Asserting it passes would be asserting the stub is a solution. The claim is
// only that a wrong answer is a per-case result, not a dead worker.
{
  const cs = cases("001-anagram-detection");
  const r = await run(read("problems/001-anagram-detection/dart/practice.dart"), cs);
  check(r.id === "result" && r.results.length === cs.length, "practice stub runs and reports every case");
}

// ---- 3. a solve that throws -----------------------------------------------
{
  const cs = cases("001-anagram-detection");
  const r = await run("dynamic solve(Map<String, dynamic> c) { throw StateError('boom'); }", cs);
  check(r.id === "result" && r.results.every((x) => !x.ok), "a throwing solve fails every case rather than killing the run");
  check(r.id === "result" && String(r.results[0].got).includes("boom"), "the throw's own message survives to the row");
}

// ---- 4. the user imports dart:convert themselves ---------------------------
// The harness PREPENDS import 'dart:convert';. If a duplicate import of the same
// library were an error, every learner who reached for jsonEncode would hit it --
// and no corpus file imports anything today, so nothing else in CI would ever
// find out. This is the assumption made explicit and handed to a compiler.
{
  const cs = cases("001-anagram-detection");
  const src = "import 'dart:convert';\n\ndynamic solve(Map<String, dynamic> c) {\n" +
              "  final s = (c['s'] as String).split('')..sort();\n" +
              "  final t = (c['t'] as String).split('')..sort();\n" +
              "  return jsonEncode(s) == jsonEncode(t);\n}\n";
  const r = await run(src, cs);
  if (r.id === "error") console.log("  (duplicate-import error was:)\n" + r.error);
  const passed = r.id === "result" ? r.results.filter((x) => x.ok).length : -1;
  check(passed === cs.length, "a source that imports dart:convert itself still compiles and passes");
}

// ---- 5. a dollar sign in the case data ------------------------------------
// dartStringLiteral escapes $ because Dart interpolates it and JSON.stringify
// does not escape it. Unescaped, this case would compile as an interpolation of
// whatever followed -- or fail pointing at generated code.
{
  const cs = [{ input: { s: "a$b", t: "b$a" }, expected: true }];
  const r = await run(read("problems/001-anagram-detection/dart/clean.dart"), cs);
  check(r.id === "result" && r.results[0] && r.results[0].ok === true, "a dollar sign in case data survives into Dart intact");
}

// ---- 6. a syntax error -- the learner-facing path --------------------------
// The diagnostics ARE the product here. This asserts they arrive, and that the
// offsets were moved back into the learner's coordinates rather than the
// generated program's.
{
  const r = await run("dynamic solve(Map<String, dynamic> c) {\n  return 1\n}\n", cases("001-anagram-detection"));
  check(r.id === "error", "a syntax error is reported as an error, not a result");
  check(r.id === "error" && /practice\.dart:\d+:\d+/.test(r.error), "diagnostics carry practice.dart:line:col, not a raw offset");
  check(r.id === "error" && !r.error.includes("org-dartlang-gx"), "the internal scheme never reaches the learner");
  check(r.id === "error" && !/\[verbose info\]/.test(r.error), "verbose narration is not in the learner's error");
  console.log("  --- the error a learner would see ---\n" + r.error.split("\n").map((l) => "  | " + l).join("\n"));
}

console.log(bad === 0 ? "verify-dart-worker: ok -- the real worker, the real compiler, the real corpus"
                      : "verify-dart-worker: " + bad + " CHECK(S) FAILED");
process.exit(bad === 0 ? 0 : 1);
