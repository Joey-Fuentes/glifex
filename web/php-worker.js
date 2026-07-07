/*
 * Glifex PHP worker. Runs php-wasm (via the vendored es.js) off the
 * main thread.
 *
 * Same class of unbounded-hang risk as the other L3 migrations: a
 * genuine infinite loop in a user's PHP solve() (e.g. `while (true)
 * {}`) has no built-in step-count safeguard -- php-wasm is itself
 * compiled to WebAssembly, and the underlying claim (an unbounded
 * interpreter loop hangs its calling thread) is the same one directly
 * confirmed for WAT's raw WebAssembly execution.
 *
 * Module worker, matching how vendor/php/es.js is already loaded on
 * the main thread: `import("./vendor/php/es.js")`, a genuine ES
 * module dynamic import, not importScripts. This exact
 * mechanism -- a module worker doing `import()` on a vendored ES
 * module -- is the SAME one retro-worker.js already uses and has
 * directly, empirically confirmed working.
 *
 * IMPORTANT, found by testing against the real vendored file (not by
 * inspection alone): the library was not written with Worker contexts
 * in mind. Its PhpBase constructor does an UNGUARDED `window &&
 * window.phpSettings` read (no typeof check) on every single call,
 * before any PHP runs -- this threw "window is not defined" in a real
 * Worker on the very first test. It separately does an unguarded
 * `document.currentScript` read. See the polyfill immediately below,
 * added and verified against the real file, not assumed.
 *
 * A fresh PhpWeb instance is created on EVERY message (matching the
 * ORIGINAL main-thread behavior exactly -- see its own comment,
 * preserved below: reusing one hits "Cannot redeclare solve()" since
 * php-wasm keeps memory across run() calls). The WORKER itself still
 * persists across multiple 'run' messages (avoiding repeated worker-
 * spawn overhead for what's a very frequent action) -- only the
 * PhpWeb instance inside it is fresh every time, an orthogonal
 * lifecycle decision from the worker's own.
 *
 * Message in : { id:'run', source, cases }
 * Message out: { id:'result', results, nsPerCase }
 *            | { id:'error', error }
 */

// Minimal, targeted stand-ins -- not full DOM shims, just enough that
// the specific unguarded property reads above don't throw. locateFile
// is always explicitly provided (see runPhp() below), so
// scriptDirectory (derived from document.currentScript) is never
// actually used for anything -- this only needs to stop the crash,
// not provide working values.
if (typeof window === "undefined") self.window = {};
if (typeof document === "undefined") self.document = {};
if (typeof navigator === "undefined") self.navigator = {};

// bigIntSafe/eq copied verbatim from runtimes.js.
const bigIntSafe = (_, v) => (typeof v === "bigint" ? Number(v) : v);
const eq = (a, b) => {
  try {
    return JSON.stringify(a, bigIntSafe) === JSON.stringify(b, bigIntSafe);
  } catch {
    return false;
  }
};

const BEGIN = "@@GLIFEX_BEGIN@@", END = "@@GLIFEX_END@@";
const b64 = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

// runPhp() copied+adapted verbatim from runtimes.js's loadPhp().run().
async function runPhp(PhpWeb, source, cases) {
  let out = "";
  const php = new PhpWeb({
    print: (s) => { out += s; },
    printErr: () => {},
    locateFile: () => "vendor/php/php-web.wasm",
  });
  await new Promise((res) => php.addEventListener("ready", res, { once: true }));
  const stripped = source.replace(/\?>\s*$/, "");
  const script = stripped + "\n" +
    "$__g = json_decode(base64_decode('" + b64(JSON.stringify(cases)) + "'), true);\n" +
    "$__o = [];\n" +
    "foreach ($__g as $__i => $__c) {\n" +
    "  try {\n" +
    "    $__t0 = microtime(true);\n" +
    "    $__got = solve($__c['input']);\n" +
    "    $__dt = microtime(true) - $__t0;\n" +
    "    $__k = 1;\n" +
    "    if ($__dt < 0.002) {\n" +
    "      while ($__dt < 0.002 && $__k < 1048576) {\n" +
    "        $__k = $__k * 2;\n" +
    "        $__s0 = microtime(true);\n" +
    "        for ($__q = 0; $__q < $__k; $__q++) { $__sink = solve($__c['input']); }\n" +
    "        $__dt = microtime(true) - $__s0;\n" +
    "      }\n" +
    "      $__tval = $__dt >= 0.001 ? (int)round(($__dt * 1e9) / $__k) : null;\n" +
    "    } else {\n" +
    "      $__tval = (int)round($__dt * 1e9);\n" +
    "    }\n" +
    "    $__o[] = ['i' => $__i, 'got' => $__got, 't' => $__tval];\n" +
    "  }\n" +
    "  catch (\\Throwable $__e) { $__o[] = ['i' => $__i, 'err' => $__e->getMessage()]; }\n" +
    "}\n" +
    'echo "\n' + BEGIN + '" . json_encode($__o) . "' + END + '\n";' + "\n";
  const t0 = performance.now();
  try {
    await php.run(script);
  } catch (e) {
    return { error: "PHP runtime error: " + String(e.message || e) };
  }
  const dt = performance.now() - t0;
  const a = out.indexOf(BEGIN), z = out.indexOf(END);
  if (a === -1 || z === -1) return { error: "PHP produced no result (a fatal error?): " + out.trim().slice(0, 300) };
  let rows;
  try {
    rows = JSON.parse(out.slice(a + BEGIN.length, z));
  } catch (err) {
    return { error: "could not parse PHP output: " + String(err.message || err) };
  }
  const byI = new Map(rows.map((r) => [r.i, r]));
  const results = cases.map((c, i) => {
    const r = byI.get(i);
    if (!r) return { i, ok: false, error: "no result for case", expected: c.expected };
    if ("err" in r) return { i, ok: false, error: String(r.err), expected: c.expected };
    return { i, ok: eq(r.got, c.expected), got: r.got, expected: c.expected, tNs: r.t != null && r.t > 0 ? r.t : null };
  });
  const nsPerCase = cases.length ? (dt * 1e6) / cases.length : 0;
  return { results, nsPerCase };
}

let PhpWebPromise = null;
async function getPhpWeb() {
  if (PhpWebPromise) return PhpWebPromise;
  PhpWebPromise = import("./vendor/php/es.js").then((m) => m.PhpWeb);
  return PhpWebPromise;
}

self.onmessage = async (e) => {
  const d = e.data || {};
  if (d.id !== "run") return;
  try {
    const PhpWeb = await getPhpWeb();
    const out = await runPhp(PhpWeb, d.source, d.cases);
    if (out.error) { self.postMessage({ id: "error", error: out.error }); return; }
    self.postMessage({ id: "result", ...out });
  } catch (err) {
    self.postMessage({ id: "error", error: String((err && err.message) || err) });
  }
};

self.onerror = (e) => {
  self.postMessage({ id: "error", error: "worker crashed (uncaught): " + String((e && e.message) || e) });
};
