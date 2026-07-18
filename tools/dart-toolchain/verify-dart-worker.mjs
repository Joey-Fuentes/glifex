// verify-dart-worker.mjs [vendor-dir]
//
// Drives the REAL web/dart-core.mjs against the REAL vendored compiler, under
// node, before any browser wiring exists. Same idea as csharp-runtime-validate:
// prove the runner over every corpus source it will meet, then wire the UI.
//
// It IMPORTS the core rather than re-deriving its synth. Bx-8b's Java rig learned
// this the expensive way: a rig that reimplements the thing it tests tests the
// rig. So the real synth, the real escaping, the real remap and the real
// driveProblem are what run here -- the only things faked are the two the
// browser would provide (self, fetch).
//
// It drives driveProblem, not a Worker message handler, because that is where
// the split puts everything: dart-worker.js is a relay of the shape
// asm-x86-worker.js already ships three times over, and driveProblem is the
// whole run.
//
// This exists because CI could not otherwise see this code at all. web/vendor is
// cached on hashFiles('web/fetch-runtimes.mjs', 'tools/**', ci.yml) -- which does
// NOT include web/dart-core.mjs -- so a change to it gets a cache hit, skips the
// vendor step, and would sail through green. That is precisely the gap that let
// the worker-isolation regression through (architecture.md, Decision 10). Hence:
// a SEPARATE step, outside the cache guard.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = process.argv[2] || "web/vendor/dart";
const fail = (m) => { console.error("verify-dart-worker: " + m); process.exit(1); };

// The core's own import("./vendor/dart/gx_web.js") resolves against
// web/dart-core.mjs, NOT against this argument -- so a different dir would fetch
// one set of artifacts and import another. Refuse rather than compare a compiler
// against someone else's platform.
if (resolve(dir) !== resolve("web/vendor/dart")) {
  fail("vendor-dir must be web/vendor/dart (got " + dir + ") -- the core's own\n" +
       "  import() is relative to web/dart-core.mjs and cannot be redirected.");
}

// ---- the three things a browser provides and node does not ------------------
// dart2js reaches its global through self. A browser worker has one; bare node
// does not, and without it the first await never resumes -- sync code runs, then
// silence. Sixteen rounds. See docs/dart2js-self-hosted.md section 7.
globalThis.self = globalThis;

// And it reaches Uri.base through self.location.href. A browser worker has a
// WorkerLocation; bare node has nothing, so Uri.base throws
// "Unsupported operation" -- which front_end calls while FORMATTING a
// diagnostic, so the format of a real compile error crashed and the crash
// replaced the error. Measured in CI: every check passed except the one syntax
// error, which came back as "[crash] The compiler crashed", the front_end's
// errors-mask-errors behaviour that docs/dart2js-self-hosted.md warns about.
//
// This is the RIG being unlike a browser, not the track being broken: a real
// worker has location and never takes this path. It is the same shim as self
// above, for the same reason. The scheme is deliberately not org-dartlang-gx --
// format() relativises the diagnostic URI against Uri.base, and a different
// scheme cannot relativise, so the diagnostic stays absolute and readable.
// The browser path is not proved by this file; e2e/dart-smoke.spec.js is where
// that gets proved.
globalThis.location = { href: "https://glifex.invalid/verify/" };

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

// ---- the real core ----------------------------------------------------------
const { driveProblem } = await import("../../web/dart-core.mjs");
if (typeof driveProblem !== "function") fail("dart-core.mjs does not export driveProblem");

const read = (p) => readFileSync(p, "utf8");
const cases = (id) => JSON.parse(read("problems/" + id + "/test_cases.json"));

let bad = 0;
// On failure, SHOW what was actually seen. A bare "FAIL <label>" sent a whole
// debugging session in circles: the compiler prints its diagnostic to stderr
// (GitHub prefixes it "Error:"), which looked like the value under test, while
// the real r.error was something else entirely. A check that hides its actual
// makes a correct failure look like a contradiction. So every FAIL now prints
// the actual, quoted and truncated, right under the label.
const show = (v) => {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  const s = typeof v === "string" ? v : (() => { try { return JSON.stringify(v); } catch (_) { return String(v); } })();
  const oneLine = s.replace(/\n/g, "\\n");
  return oneLine.length > 300 ? oneLine.slice(0, 300) + "..." : oneLine;
};
const check = (cond, what, actual) => {
  if (cond) { console.log("  ok   " + what); return; }
  console.log("  FAIL " + what);
  if (actual !== undefined) console.log("         actual: " + show(actual));
  bad++;
};

// ---- 1. every corpus source that exists, against its real cases ------------
// Correctness first, and against the real thing: a kata proves the compiler
// runs, not that the harness this core synthesizes agrees with the CLI one.
for (const [id, variant] of [
  ["001-anagram-detection", "clean"],
  ["001-anagram-detection", "optimized"],
  ["002-two-sum", "clean"],
  ["002-two-sum", "optimized"],
]) {
  const cs = cases(id);
  const r = await driveProblem(read("problems/" + id + "/dart/" + variant + ".dart"), cs);
  if (r.error) { check(false, id + " " + variant + " ran without a compile error", r.error); continue; }
  const passed = r.results.filter((x) => x.ok).length;
  // On a count mismatch, show the failing rows -- not just "0/7". The rows carry
  // got/expected, so a wrong answer, a missing result, and an empty run are
  // distinguishable at a glance instead of guessed at.
  const failingRows = r.results.filter((x) => !x.ok).map((x) => "case " + x.i + " got=" + show(x.got) + " expected=" + show(x.expected) + (x.error ? " (" + x.error + ")" : ""));
  check(passed === cs.length, id + " " + variant + " -- " + passed + "/" + cs.length + " cases pass",
        passed === cs.length ? undefined : failingRows.join(" | "));
  check(r.results.every((x) => x.tNs === null || x.tNs > 0),
        id + " " + variant + " -- every tNs is null or positive",
        r.results.map((x) => x.tNs));
  check(r.nsPerCase === 0, id + " " + variant + " -- reports the nsPerCase the worker relays", r.nsPerCase);
}

// ---- 2. practice, a stub -- must RUN, not crash ----------------------------
// Asserting it passes would be asserting the stub is a solution. The claim is
// only that a wrong answer is a per-case result, not a dead run.
{
  const cs = cases("001-anagram-detection");
  const r = await driveProblem(read("problems/001-anagram-detection/dart/practice.dart"), cs);
  check(!r.error && r.results.length === cs.length, "practice stub runs and reports every case");
}

// ---- 3. a solve that throws -----------------------------------------------
{
  const cs = cases("001-anagram-detection");
  const r = await driveProblem("dynamic solve(Map<String, dynamic> c) { throw StateError('boom'); }", cs);
  check(!r.error && r.results.every((x) => !x.ok), "a throwing solve fails every case rather than killing the run");
  check(!r.error && String(r.results[0].got).includes("boom"), "the throw's own message survives to the row");
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
  const r = await driveProblem(src, cs);
  if (r.error) console.log("  (duplicate-import error was:)\n" + r.error);
  const passed = r.error ? -1 : r.results.filter((x) => x.ok).length;
  check(passed === cs.length, "a source that imports dart:convert itself still compiles and passes");
}

// ---- 5. a dollar sign in the case data ------------------------------------
// dartStringLiteral escapes $ because Dart interpolates it and JSON.stringify
// does not escape it. Unescaped, this case would compile as an interpolation of
// whatever followed -- or fail pointing at generated code.
{
  const cs = [{ input: { s: "a$b", t: "b$a" }, expected: true }];
  const r = await driveProblem(read("problems/001-anagram-detection/dart/clean.dart"), cs);
  check(!r.error && r.results[0] && r.results[0].ok === true, "a dollar sign in case data survives into Dart intact");
}

// ---- 6. a syntax error -- the learner-facing path --------------------------
// The diagnostics ARE the product here. This asserts they arrive, and that the
// offsets were moved back into the learner's coordinates rather than the
// generated program's.
{
  const r = await driveProblem("dynamic solve(Map<String, dynamic> c) {\n  return 1\n}\n", cases("001-anagram-detection"));
  // Print r.error FIRST, so the actual value under test is visible ABOVE the
  // checks -- not buried below them. The compiler also prints its own diagnostic
  // to stderr (GitHub prefixes it "Error:"); that is a DIFFERENT string from
  // r.error, and confusing the two cost a long debugging detour. This banner is
  // unambiguously the value the checks below assert on.
  console.log("  --- r.error (the value the syntax-error checks assert on) ---");
  console.log(String(r.error).split("\n").map((l) => "  | " + l).join("\n"));
  console.log("  --- (any 'Error:'-prefixed line ABOVE is the compiler's own stderr, not r.error) ---");
  // POSITIVE assertions first. An "absent X" check passes vacuously on garbage --
  // [object Object] passed three of the checks below until this was added, the
  // exact vacuous-pass trap this file was written to avoid. So first demand the
  // diagnostic actually SAYS something: the compiler's words, a real position.
  // Each failing check now prints r.error as its actual, so a FAIL is legible on
  // its own line rather than needing the banner to interpret it.
  check(typeof r.error === "string" && /Expected/.test(r.error),
        "the error carries the compiler's own diagnostic text (\"Expected ...\")", r.error);
  check(typeof r.error === "string" && /practice\.dart:\d+:\d+/.test(r.error),
        "the error carries a real remapped position practice.dart:line:col", r.error);
  check(typeof r.error === "string" && r.error !== "[object Object]",
        "the error is a decoded string, never a boxed [object Object]", r.error);
  check(!!r.error && !/Dart exception thrown from converted Future/.test(r.error),
        "not dart2js's boxed-exception wrapper sentence", r.error);
  check(!!r.error && !/\[crash\]/.test(r.error),
        "a syntax error is a diagnostic, not a compiler crash", r.error);
  check(!!r.error && !r.error.includes("org-dartlang-gx"),
        "the internal scheme never reaches the learner", r.error);
  check(!!r.error && !/\[verbose info\]/.test(r.error),
        "verbose narration is not in the learner's error", r.error);
}

console.log(bad === 0 ? "verify-dart-worker: ok -- the real core, the real compiler, the real corpus"
                      : "verify-dart-worker: " + bad + " CHECK(S) FAILED");
process.exit(bad === 0 ? 0 : 1);
