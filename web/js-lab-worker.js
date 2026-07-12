/*
 * Glifex Complexity Lab -- JavaScript execution driver. Runs the Lab's
 * timing measurements (compile + adaptive-repeat sampling, via
 * js-runtime.js's existing compileJavaScript/measureJsCases) inside a
 * Worker instead of the main thread.
 *
 * L3 (docs/ROADMAP.md): "close the remaining hang exposure for runaway
 * user code at large n." Only C/C++ ran in Workers before this -- every
 * other language, including JS, ran directly on the main thread. A
 * user's solve() with an accidental infinite loop (or one that's
 * genuinely much slower than intended at a large tested n) would freeze
 * the whole tab, since the Lab's own measurement loop IS the main
 * thread's only work at that moment. Moving it here means a hang stays
 * contained to this Worker -- the page stays responsive, and the caller
 * can detect a stuck call (a message that never arrives) and
 * .terminate() this Worker outright, surfacing a clear message instead
 * of a frozen tab.
 *
 * One Worker is spawned per analyze() call (see lab.js) and reused
 * across every runOnce() within that single analysis -- not
 * respawned per call the way c-worker.js is, since JS has no
 * single-use-instance constraint the way Wasmer's WASIX runtime does
 * (confirmed the hard way this session, for C). compileJavaScript()
 * is called once per distinct source text and cached here, so the
 * SAME compiled function reference is reused across every rep -- same
 * benefit js-runtime.js's own compileJavaScript/measure split already
 * gives WITHIN one measure() call, just extended across the several
 * separate calls one analyze() makes (previously each went through
 * runJavaScript(), which re-compiles from scratch every time).
 *
 * Message in : { id:'measure', source, cases, opts }
 * Message out: { id:'result', results, nsPerCase } | { id:'error', error }
 */
importScripts("js-runtime.js");   // loads compileJavaScript into this worker's own global scope
                                    // (NOT self.GlifexJsRuntime -- that's only set when `window`
                                    // exists, which it doesn't in a Worker; confirmed directly
                                    // rather than assumed, since this got it wrong on the first
                                    // pass -- top-level functions from an importScripts()'d file
                                    // land in the worker's own global scope and are called bare)

let cachedSource = null;
let cachedCompiled = null;

self.onmessage = async (e) => {
  const d = e.data || {};
  if (d.id !== "measure") return;
  try {
    if (d.source !== cachedSource || !cachedCompiled) {
      cachedCompiled = compileJavaScript(d.source);
      cachedSource = d.source;
    }
    if (cachedCompiled.error) {
      self.postMessage({ id: "error", error: cachedCompiled.error });
      return;
    }
    const out = cachedCompiled.measure(d.cases, d.opts);
    // L4 (JS space): optional best-effort heap-growth proxy. Requested by
    // lab.js on a single rep (opts.space) and only attached where the
    // measureUserAgentSpecificMemory API can actually run (isolated,
    // Chromium, non-headless); otherwise results carry no .space and the
    // Lab simply omits the space tab. Never throws -- measureSpace returns
    // null wherever the API is unavailable. It's async, so this handler is.
    if (d.opts && d.opts.space && typeof cachedCompiled.measureSpace === "function") {
      const sp = await cachedCompiled.measureSpace(d.cases);
      if (sp) out.results.forEach((r, i) => { if (sp[i] != null) r.space = sp[i]; });
    }
    self.postMessage({ id: "result", results: out.results, nsPerCase: out.nsPerCase });
  } catch (err) {
    self.postMessage({ id: "error", error: String((err && err.message) || err) });
  }
};

self.onerror = (e) => {
  // Defense in depth, matching c-worker.js's own reasoning: an error
  // that somehow escapes the try/catch above (e.g. a syntax-level issue
  // importScripts itself can't recover from) still needs to reach the
  // caller as a clear, catchable message instead of leaving its
  // postMessage-based Promise pending forever.
  self.postMessage({ id: "error", error: "worker crashed (uncaught): " + String((e && e.message) || e) });
};
