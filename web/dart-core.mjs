// dart-core.mjs -- the Dart track's logic (Bx-13b). dart2js, itself compiled to
// JavaScript by dart2js, compiles the user's Dart to JS in the worker that
// imports this; the JS it emits then runs there too. No wasm, no filesystem, no
// server round trip. See docs/dart2js-self-hosted.md for how the compiler gets
// here.
//
// Split entry-from-logic like asm-x86-worker.js + asm-x86-core.mjs, which is
// what the module workers here do when the logic has to be importable:
// dart-worker.js is the thin Worker entry, this is the module. It has to be a
// module and it has to be .mjs, because verify-dart-worker.mjs imports THIS FILE
// rather than re-deriving it, and node reads the extension -- web/ has no
// package.json and CI's e2e job puts a typeless one at the repo root, under
// which node resolves .js as CommonJS and an export line will not parse.
//
// Behaviour: go-worker.js (fetch + compile + run, cases embedded, no COI), NOT
// rust-worker.js (bundled and remapped).
//
// MEASURED in the Bx-13b spike -- a throwaway push-triggered workflow driving a
// real module Worker against the real artifacts in real headless Chromium.
// None of this is inferred:
//   - a MODULE worker loads gx_web.js with await import(), main()'s side
//     effects run, and it sees globals installed before the import. The classic
//     + importScripts route works too; module is chosen to match go-worker.js.
//   - Dart needs NO cross-origin isolation: it compiled and ran on a plain
//     server with SharedArrayBuffer absent.
//   - compile is ~3.6s cold, ~2.7s warm, and is DETERMINISTIC for a given
//     source -- twice over, byte-identical. That is what makes the cache below
//     sound rather than merely convenient.

const BASE = "vendor/dart";

async function fetchBytes(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error("fetch " + path + " -> " + r.status);
  return new Uint8Array(await r.arrayBuffer());
}
async function fetchText(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error("fetch " + path + " -> " + r.status);
  return await r.text();
}

let readyPromise = null;

// One-time: fetch the platform, install the globals, load the compiler.
//
// ORDER IS LOAD-BEARING. gx_web.dart's main() sets gxCompileDart and then
// immediately calls gxReady(), so gxReady must already exist when the import
// evaluates. gxGetDill and gxGetLibrariesSpec are called later, at compile
// time, but they go in here too -- there is no second place to put them.
//
// No self = globalThis shim: in a worker, self IS the global. Bare node has no
// self and its scheduler never starts, which cost sixteen rounds; that is node's
// problem and verify-dart-worker.mjs installs the shim there.
async function initOnce() {
  const [dill, spec] = await Promise.all([
    fetchBytes(BASE + "/dart2js_platform.dill"),
    fetchText(BASE + "/libraries.json"),
  ]);
  let resolveReady;
  const ready = new Promise((res) => { resolveReady = res; });
  self.gxGetDill = () => dill;
  self.gxGetLibrariesSpec = () => spec;
  self.gxReady = () => resolveReady();
  await import("./" + BASE + "/gx_web.js");
  // A resolved import proves the bytes arrived and evaluated, not that the
  // compiler initialised. gxReady firing is the only honest evidence, and the
  // spike measured it firing in ~350ms.
  let timer;
  await Promise.race([
    ready,
    new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(
      "gx_web.js loaded but gxReady never fired within 60s -- the compiler did not initialise")), 60000); }),
  ]);
  clearTimeout(timer);
  if (typeof self.gxCompileDart !== "function") {
    throw new Error("gx_web.js initialised without setting gxCompileDart");
  }
  return true;
}

// Dart requires every import directive to precede the first declaration, so the
// one import the harness needs has to LEAD. It is the only thing that moves the
// user's text, and it moves it by exactly PREFIX.length characters -- which is
// arithmetic, and undone exactly in remapDiagnostics.
//
// Everything else is APPENDED: Dart does not care what order top-level
// declarations come in, so main() can sit below the code it calls. The user
// keeps their own imports and their own text, verbatim.
const PREFIX = "import 'dart:convert';\n";

// JSON's escaping is a subset of Dart's double-quoted string escaping with ONE
// exception, and it is the kind that does not announce itself: Dart interpolates
// $. JSON.stringify never escapes it, so a case containing a dollar sign -- a
// price, a regex, a template -- would compile as an interpolation of whatever
// identifier followed it, or fail with a baffling error pointing at generated
// code. go-worker.js can say "JSON string escaping is a subset of Go's"; Dart
// needs this one extra.
function dartStringLiteral(text) {
  return JSON.stringify(text).replace(/\$/g, "\\$");
}

// No pre-flight regex looking for solve(). go-worker.js needs an ENTRY_RE
// because Go permits several entry names; every Dart variant declares solve, so
// there is nothing to choose. And a regex hunting a declaration would just as
// happily match the word in a comment or a string -- the guard-reads-prose bug
// that fired three times in Bx-8b. If solve is missing, the compiler says so, at
// the right offset, in the learner's own terms.
function synth(source, cases) {
  const casesLit = dartStringLiteral(JSON.stringify(cases));
  const harness = [
    "",
    "",
    "// ---- glifex harness, appended -- not the user's code ----",
    "// Never read, so the compiler must keep every call that writes it: Dart has",
    "// no black_box, and without this dart2js is free to delete the repeat loop",
    "// below as dead code and time an empty loop.",
    "Object? _gxSink;",
    "",
    "const String _gxCasesJson = " + casesLit + ";",
    "",
    "// Repeat until the timed region is worth dividing, then divide. 2ms is the",
    "// target, and the loop is deliberately resolution-agnostic. sw.js stamps",
    "// COOP/COEP onto every response and index.html reloads once through it, so",
    "// this worker normally inherits an ISOLATED page and performance.now() is",
    "// high-res (~5us) -- an earlier draft of this comment claimed the opposite,",
    "// reasoning that a track needing no COI therefore does not get any. It does:",
    "// the site is isolated site-wide. But the bootstrap is best-effort, and sets",
    "// data-coi to off when a browser cannot isolate, where the clamp is ~100us.",
    "// 2ms is far above either, so the loop never has to know which it got.",
    "// The rep cap stops a genuinely slow solve being repeated into a timeout.",
    "const int _gxMinNs = 2000000;",
    "const int _gxMaxReps = 4194304;",
    "",
    "void main() {",
    "  final cases = jsonDecode(_gxCasesJson) as List;",
    "  var passed = 0;",
    "  for (var i = 0; i < cases.length; i++) {",
    "    final c = cases[i] as Map<String, dynamic>;",
    "    final expected = jsonEncode(c['expected']);",
    "    try {",
    "      final input = c['input'] as Map<String, dynamic>;",
    "      // Warm once and discard: the first call pays lazy init.",
    "      _gxSink = solve(input);",
    "      var reps = 1;",
    "      var ns = 0;",
    "      while (true) {",
    "        final sw = Stopwatch()..start();",
    "        for (var r = 0; r < reps; r++) { _gxSink = solve(input); }",
    "        sw.stop();",
    "        final el = sw.elapsedMicroseconds * 1000;",
    "        if (el >= _gxMinNs || reps >= _gxMaxReps) { ns = el ~/ reps; break; }",
    "        reps *= (el <= 0) ? 16 : 4;",
    "      }",
    "      final got = jsonEncode(solve(input));",
    "      if (got == expected) {",
    "        passed++;",
    "        print('  [PASS] case $i');",
    "      } else {",
    "        print('  [FAIL] case $i  expected=$expected got=$got');",
    "      }",
    "      print('[METRIC] case $i ns=$ns');",
    "    } catch (e) {",
    "      // A throw from the user's solve is a per-case result, not a dead run.",
    "      print('  [FAIL] case $i  expected=$expected got=threw: $e');",
    "      print('[METRIC] case $i ns=0');",
    "    }",
    "  }",
    "  print('$passed/${cases.length} passed');",
    "}",
    "",
  ].join("\n");
  return { program: PREFIX + source + harness };
}

// The compiler reports a CHARACTER OFFSET, not a line: gx_core.dart's reporter
// prints "@begin". An offset is useless to a learner, and this worker is the
// only place that still has the source to turn it into a position -- so it does.
//
// Three regions, and the offset says which: our prefix, the user's source, our
// appended harness. Only the middle one is theirs to fix.
const PREFIX_LINES = PREFIX.split("\n").length - 1;

// A Dart exception crossing a converted Future comes back BOXED. dart2js's own
// wrapper says what to do about it -- "Use the properties 'error' to fetch the
// boxed error and 'stack' to recover the stack trace" -- so read .error, and
// String() it to run the Dart object's toString. gx_web.dart throws a
// StateError, whose toString is "Bad state: <the diagnostics>".
//
// Measured in CI, not guessed: without this a learner's syntax error arrived as
// that wrapper sentence and nothing else. Every check around it passed, because
// an error DID arrive -- it just said nothing.
function dartErrorText(err) {
  // A Dart exception crossing gx_web.dart's .toJS bridge comes back BOXED. The
  // rejection reason's OWN toString is only the bridge's instruction:
  //   "Dart exception thrown from converted Future. Use the properties 'error'
  //    to fetch the boxed error and 'stack' to recover the stack trace."
  // That instruction is the fix. Earlier cuts read .error (which is {} -- empty
  // enumerable, un-decodable) and stopped there, MISSING '.stack'. The Dart
  // StateError's message -- the joined diagnostics -- renders at the TOP of
  // .stack. And .stack is NON-ENUMERABLE (like a JS Error's), which is why
  // Object.keys never saw it and every enumerable scan came up empty. So read
  // .stack (and .error.stack) directly, by name, exactly as the message says.
  const bad = (v) => typeof v !== "string" || !v || v === "[object Object]"
    || v === "null" || v === "undefined"
    || /Dart exception thrown from converted Future/.test(v);
  const strip = (v) => v.startsWith("Bad state: ") ? v.slice("Bad state: ".length) : v;
  // A stack is "<message>\n    at ...": the diagnostic is the lines before the
  // first stack frame. Keep those, drop the frames.
  const fromStack = (st) => {
    const lines = String(st).split("\n");
    const head = [];
    for (const l of lines) {
      if (/^\s*at\s/.test(l) || /^\s+\S+@/.test(l)) break;
      head.push(l);
    }
    const msg = head.join("\n").trim();
    return bad(msg) ? null : strip(msg);
  };

  if (typeof err === "string" && !bad(err)) return strip(err);

  // The two properties the bridge names, in order: 'error' then 'stack'.
  if (err && err.error != null) {
    const e = err.error;
    if (typeof e === "string" && !bad(e)) return strip(e);
    try { const t = e.toString(); if (!bad(t)) return strip(t); } catch (_) { /* keep trying */ }
    try { if (e.stack != null) { const m = fromStack(e.stack); if (m) return m; } } catch (_) { /* keep trying */ }
  }
  try { if (err && err.stack != null) { const m = fromStack(err.stack); if (m) return m; } } catch (_) { /* keep trying */ }

  // The rejection reason's own toString(), for a bridge that boxes without a
  // .error wrapper.
  if (err != null) {
    try { const t = err.toString(); if (!bad(t)) return strip(t); } catch (_) { /* keep trying */ }
  }

  // A plain JS Error's message (not the boxed-Future wrapper, which "bad" rejects).
  if (err && !bad(err.message)) return strip(err.message);

  // Last resort. Never "[object Object]": name the failure, and DESCRIBE the
  // boxed shape -- now INCLUDING non-enumerable 'stack'/'message', the very
  // properties an enumerable-only walk missed -- so any future undecodable shape
  // reports exactly what to read next instead of hiding it.
  const describe = (v, depth) => {
    if (v === null) return "null";
    const t = typeof v;
    if (t !== "object") return t + "(" + show(v) + ")";
    if (depth <= 0) return "object";
    let ks = [];
    try { ks = Array.from(new Set([...Object.keys(v), "stack", "message"])); } catch (_) { ks = ["<keys threw>"]; }
    let ts = "";
    try { const s = v.toString(); if (s !== "[object Object]") ts = " toString=" + JSON.stringify(String(s).slice(0, 120)); } catch (_) { ts = " toString=<threw>"; }
    const inner = ks.map((k) => { let cv; try { cv = v[k]; } catch (_) { return k + ":<threw>"; } if (cv === undefined) return null; return k + ":" + describe(cv, depth - 1); }).filter(Boolean).join(", ");
    return "object{" + inner + "}" + ts;
  };
  function show(x) {
    try { const s = typeof x === "string" ? x : JSON.stringify(x); return String(s).slice(0, 80); } catch (_) { return "<unprintable>"; }
  }
  let shape = "";
  try { shape = describe(err, 3); } catch (_) { shape = "<describe threw>"; }
  return "the Dart compiler reported an error this build could not decode. "
    + "Shape: " + shape + " -- please report this at the repo so the decoder can be taught it.";
}

function remapDiagnostics(text, source) {
  const shift = PREFIX.length;
  const userEnd = shift + source.length;
  const userLines = source.split("\n").length;
  return String(text)
    // gx_core.dart's reporter renders the position itself, as a CHARACTER
    // OFFSET ("@begin").
    .replace(/org-dartlang-gx:\/\/\/main\.dart@(\d+)/g, (_m, off) => {
      const o = Number(off);
      if (o < shift) return "practice.dart:1:1";
      if (o >= userEnd) return "<glifex harness>";
      const before = source.slice(0, o - shift);
      const line = before.split("\n").length;
      const col = (o - shift) - (before.lastIndexOf("\n") + 1) + 1;
      return "practice.dart:" + line + ":" + col;
    })
    // front_end's OWN formatted message renders "<uri>:<line>:<col>" and is
    // carried in the diagnostic text. Both forms appear in one report, so both
    // are handled. The prefix is exactly PREFIX_LINES lines, so this correction
    // is subtraction rather than arithmetic on offsets.
    .replace(/org-dartlang-gx:\/\/\/main\.dart:(\d+):(\d+)/g, (_m, l, c) => {
      const line = Number(l) - PREFIX_LINES;
      if (line < 1) return "practice.dart:1:1";
      if (line > userLines) return "<glifex harness>";
      return "practice.dart:" + line + ":" + c;
    })
    .replace(/org-dartlang-gx:\/\/\/main\.dart/g, "practice.dart");
}

// Compile is ~2.7-3.6s (measured), and lab.js calls run() once per ladder rung.
// The spike measured the compiler deterministic for a given source, which is
// what makes caching its output sound rather than just fast.
//
// Keyed on the whole synthesized program -- cases included, because the cases
// ARE in the program: go-worker.js embeds them and so does this. So the Lab,
// which varies cases per rung, still misses every time and pays a compile per
// rung. That is a known cost, not a solved one: taking cases out of the program
// needs a run-time channel into the compiled code (dart:js_interop), and whether
// js_interop survives the SELF-HOSTED compiler is unmeasured -- the spike only
// proved plain Dart plus print(). Bx-13b step 4 measures the ladder and decides.
// The Playground, which reruns one source against fixed cases, hits after the
// first.
const cache = new Map();
const CACHE_MAX = 4;

async function compileCached(program) {
  if (cache.has(program)) return cache.get(program);
  const js = await self.gxCompileDart(program);
  cache.set(program, js);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return js;
}

// Capture console.log around the RUN ONLY, never around the compile. dart2js
// talks on console.log -- the same channel the user's program prints to -- so a
// capture spanning the compile would read the compiler's narration as the user's
// output. gx_core.dart no longer prints verbose info for exactly this reason,
// but errors and warnings still go there, and the fix is to not span it.
function runProgram(js) {
  const printed = [];
  const log = console.log;
  console.log = (s) => printed.push(String(s));
  try { (0, eval)(js); } finally { console.log = log; }
  return printed.join("\n");
}

function parse(out, cases) {
  const byI = new Map(), nsById = new Map();
  for (const line of out.split("\n")) {
    const m = line.match(/\[(PASS|FAIL)\]\s+case\s+(\d+)(?:\s+expected=(.*?)\s+got=(.*))?/);
    if (m) byI.set(Number(m[2]), { ok: m[1] === "PASS", exp: m[3], got: m[4] });
    const mm = line.match(/\[METRIC\]\s+case\s+(\d+)\s+ns=(\d+)/);
    if (mm) nsById.set(Number(mm[1]), Number(mm[2]));
  }
  if (byI.size === 0) return { error: "no case results from the Dart harness:\n" + out.trim().slice(0, 600) };
  const results = cases.map((c, i) => {
    const r = byI.get(i);
    const tNs = nsById.has(i) && nsById.get(i) > 0 ? nsById.get(i) : null;
    if (!r) return { i, ok: false, error: "no result for case", expected: c.expected };
    return r.ok
      ? { i, ok: true, got: c.expected, expected: c.expected, tNs }
      : { i, ok: false, got: r.got != null ? r.got : "(see output)", expected: r.exp != null ? r.exp : c.expected, tNs };
  });
  return { results };
}

// The one entry point the worker needs. Everything above is exported too, for
// verify-dart-worker.mjs to probe directly -- but this is the whole run, so
// dart-worker.js stays a relay and has nothing of its own to get wrong. Same
// division as asm-x86-core.mjs's driveProblem.
export async function driveProblem(source, cases) {
  if (!readyPromise) readyPromise = initOnce();
  await readyPromise;
  const { program } = synth(source, cases);
  let js;
  try {
    js = await compileCached(program);
  } catch (err) {
    // gx_web.dart throws with the compiler's own diagnostics, boxed across .toJS.
    // dartErrorText reads them off the boxed error -- reading .stack, the property
    // the bridge's own message names ("Use the properties 'error' and 'stack'").
    // Then move the offsets back into the learner's coordinates.
    return { error: remapDiagnostics(dartErrorText(err), source) };
  }
  const parsed = parse(runProgram(js), cases);
  if (parsed.error) return { error: parsed.error };
  // No space metric. dart2js output is plain JS in this worker's heap, and Dart
  // has no in-language heap introspection to match Go's TotalAlloc -- whether the
  // JS probe (measureUserAgentSpecificMemory) applies is Bx-13b step 4's
  // question, to be answered with evidence. A number that measured nothing would
  // be worse than none.
  return { results: parsed.results, nsPerCase: 0 };
}

export { initOnce, synth, parse, remapDiagnostics, compileCached, runProgram, dartStringLiteral, dartErrorText, PREFIX };
