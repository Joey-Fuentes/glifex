// Runtime loaders + executors for non-JavaScript languages in the playground.
//
// THE OFFLINE RULE: nothing here ever fetches from a CDN at run time. Runtimes
// load from web/vendor/<lang>/ (populated once by `node web/fetch-runtimes.mjs`).
// If a runtime isn't vendored, the language reports "not installed" and the app
// keeps working. That's what keeps offline === hosted.
//
// Each loader returns a runner: { run(source, cases) -> {results|error} } for
// languages, or { query(schema, seed, sql) -> rows } for the database engine.

const Runtimes = (() => {
  const cache = {};          // lang -> Promise<runner|null>
  const loadErrors = {};     // lang -> error message (loader threw)
  // JSON.stringify throws on a raw BigInt (i64 WASM exports return BigInt
  // at the JS boundary, not Number) -- a replacer that converts it to a
  // Number keeps the comparison exact for any in-range value (every
  // current i64 use case does: 003-nth-fibonacci's WAT track stays within
  // Number.MAX_SAFE_INTEGER by design, see lab-config.mjs) and lets a
  // BigInt scalar compare equal to the oracle's plain Number expected
  // value without any loader-level conversion. Never throws: a BigInt
  // that ISN'T a simple scalar (e.g. 002-two-sum's WAT track packs a
  // pair into one i64) will still safely compare as "not equal" here
  // rather than crash, falling through to cfg.validate() as intended.
  const bigIntSafe = (_, v) => (typeof v === "bigint" ? Number(v) : v);
  const eq = (a, b) => {
    try {
      return JSON.stringify(a, bigIntSafe) === JSON.stringify(b, bigIntSafe);
    } catch {
      return false;
    }
  };

  function script(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("missing " + src));
      document.head.appendChild(s);
    });
  }

  async function vendored(lang) {
    try {
      // no-cache (not force-cache): a fossilized 404 from before vendoring must
      // never win. Offline still works -- the SW's SWR path serves its cached copy.
      const r = await fetch(`vendor/${lang}/manifest.json`, { cache: "no-cache" });
      return r.ok;
    } catch { return false; }
  }

  // Shared worker-call helper: spawn-or-reuse a Worker, send ONE message,
  // await a response with a timeout, and clean up correctly on error/
  // timeout so a stuck worker never gets silently reused. Extracted after
  // noticing this exact mechanic -- addEventListener("message"/"error"),
  // Promise.race against a timer, terminate-and-clear on failure -- had
  // been independently hand-rolled, nearly identically, in c-worker.js's
  // caller code (in this same file) and lab.js's runJsInWorker(). Neither
  // duplicate was wrong, but a shared helper means the NEXT language
  // migrated to a Worker (WAT, retro, ...) is mostly configuration, not
  // re-deriving this mechanic a third time.
  //
  // `state` is a plain { worker: null } object the CALLER owns (module-
  // level, however long a "session" means for that caller) -- this
  // function creates the Worker if `state.worker` is null, reuses it
  // otherwise, and clears `state.worker` on any error/timeout. Both
  // lifecycle policies this codebase actually needs fall out of how the
  // CALLER manages that object's lifetime, not from anything in here:
  // pass the SAME state object across many calls for a persistent worker
  // (lab.js's JS/retro Lab measurements, one worker per analyze()
  // session, matching cpp-worker.js's own persist-across-calls pattern);
  // pass a FRESH `{ worker: null }` every single call for a spawn-per-
  // call worker (what C specifically needs, confirmed the hard way this
  // session -- Wasmer's entrypoint.run() behaves like a single-use
  // process invocation, so reusing one across calls hangs).
  //
  // `workerOptions` (optional, passed straight through to `new
  // Worker(scriptUrl, workerOptions)`) is what makes "mostly
  // configuration" literally true for the retro CPU cores: they're
  // genuine ES modules (`export class Cpu6502`), which importScripts()
  // -- what a classic-script worker like js-lab-worker.js or c-worker.js
  // uses -- can't load. Passing `{ type: "module" }` here is the entire
  // difference; nothing else about the call changes.
  async function callWorker(state, scriptUrl, message, timeoutMs, timeoutMessage, workerOptions) {
    if (!state.worker) state.worker = new Worker(scriptUrl, workerOptions);
    const worker = state.worker;
    try {
      return await Promise.race([
        new Promise((resolve, reject) => {
          const cleanup = () => { worker.removeEventListener("message", onmsg); worker.removeEventListener("error", onerr); };
          const onmsg = (e) => { cleanup(); resolve(e.data || {}); };
          const onerr = (e) => { cleanup(); reject(new Error(String((e && e.message) || e))); };
          worker.addEventListener("message", onmsg);
          worker.addEventListener("error", onerr);
          worker.postMessage(message);
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)),
      ]);
    } catch (e) {
      // A genuinely stuck or crashed worker needs a FRESH one for the
      // next call -- this one may still be wedged. Terminate and clear
      // so the caller's next callWorker() (with the same state object)
      // spawns clean rather than reusing something possibly still stuck.
      worker.terminate();
      if (state.worker === worker) state.worker = null;
      throw e;
    }
  }
  if (typeof window !== "undefined") window.callWorker = callWorker;

  // opts.skipAggregate: the Lab already has its own per-case tNs data and
  // never reads nsPerCase, so it skips the (potentially expensive -- up to
  // 4096 * cases.length additional calls) aggregate fallback below.
  function caseLoop(callSolve, cases, opts) {
    const skipAggregate = !!(opts && opts.skipAggregate);
    const spaceOf = opts && opts.spaceOf;   // common hook: optional native peak-workspace measurer (e.g. Python tracemalloc); attaches `space` per case
    const results = [];
    const t0 = performance.now();
    for (let i = 0; i < cases.length; i++) {
      try {
        const c0 = performance.now();
        let sink = callSolve(cases[i].input);
        const got = sink;
        let cdt = performance.now() - c0;
        // L1-caseloop: per-case wall sample for the Complexity Lab; adaptive
        // repeat past the clock grain (solve is pure by the corpus contract).
        // Keeping `sink` (not just `got`) means every call's return value is
        // actually used afterward -- discarding it entirely let the engine
        // dead-code-eliminate most of the repeated calls on cheap,
        // side-effect-free functions. caseLoop itself (a stable function
        // reference, never a legitimate solve() output) is the anti-DCE
        // sentinel: the comparison can never be true, but the engine can't
        // prove that statically, so it can't optimize the store away.
        let tNs;
        if (cdt < 2) {
          let k = 1;
          while (cdt < 2 && k < 1048576) { k *= 2; const s0 = performance.now(); for (let q = 0; q < k; q++) { sink = callSolve(cases[i].input); } cdt = performance.now() - s0; }
          tNs = cdt >= 1 ? (cdt * 1e6) / k : null;
        } else { tNs = cdt * 1e6; }
        if (sink === caseLoop) console.log(sink); // unreachable; keeps `sink` observably used
        const row = { i, ok: eq(got, cases[i].expected), got, expected: cases[i].expected, tNs };
        if (spaceOf) { try { const sp = spaceOf(callSolve, cases[i].input); if (sp != null) { if (typeof sp === "number") { if (sp >= 0) row.space = sp; } else { if (sp.heap != null && sp.heap >= 0) row.space = sp.heap; if (sp.stack != null && sp.stack >= 0) row.spaceStack = sp.stack; } } } catch (e) {} }
        results.push(row);
      } catch (e) {
        results.push({ i, ok: false, error: String(e.message || e), expected: cases[i].expected });
      }
    }
    let nsPerCase = cases.length ? ((performance.now() - t0) * 1e6) / cases.length : 0;
    // Fast runtimes (e.g. transpiled TS) can finish under the ~0.1ms clock
    // grain and read 0 -- adaptively repeat until measurable (capped: WASM
    // per-case marshaling makes unbounded repeats expensive).
    if (!skipAggregate && nsPerCase === 0 && results.every((r) => r.ok) && cases.length) {
      let iters = 2, dt = 0;
      while (dt < 5 && iters <= 4096) {
        const s = performance.now();
        for (let k = 0; k < iters; k++) for (const c of cases) { try { callSolve(c.input); } catch {} }
        dt = performance.now() - s;
        if (dt < 5) iters *= 2;
      }
      if (dt > 0) nsPerCase = (dt * 1e6) / (iters * cases.length);
    }
    return { results, nsPerCase };
  }

  // -- TypeScript: vendored compiler transpiles, then runs as JS --------
  async function loadTypeScript() {
    if (!(await vendored("typescript"))) return null;
    // L3: transpile+execute moved off the main thread into
    // ts-worker.js. Same class of hang risk as plain JavaScript
    // (already fixed by L3's earlier JS work) -- once transpiled,
    // this is just `new Function(...)` executing ordinary JS, no
    // different from js-runtime.js's own compileJavaScript(). See
    // ts-worker.js's own header comment for the fuller reasoning.
    //
    // One persistent worker for the whole page session (like the JS
    // Run button's jsRunWorkerState, not like retro's per-language
    // state -- there's only one TypeScript language). Classic worker
    // (importScripts), not module -- matches how
    // vendor/typescript/typescript.js is already loaded on the main
    // thread (a plain script, not an ES module).
    const tsWorkerState = { worker: null };
    const TS_TIMEOUT_MS = 20000;
    return {
      async run(source, cases) {
        try {
          const res = await window.callWorker(
            tsWorkerState, "ts-worker.js", { id: "run", source, cases },
            TS_TIMEOUT_MS, "Your code took too long to finish (over 20s) -- likely an infinite loop or code much slower than expected on these inputs.");
          if (res.id === "error") return { error: res.error };
          const { id, ...out } = res;
          return out;
        } catch (e) {
          return { error: String((e && e.message) || e) };
        }
      },
    };
  }

  // -- Python: Pyodide (CPython on WASM) --------------------------------
  async function loadPython() {
    if (!(await vendored("python"))) return null;
    // L3: Pyodide setup+execute moved off the main thread into
    // python-worker.js. Same class of unbounded-hang risk as the
    // other L3 migrations: a genuine infinite loop in a user's Python
    // solve() has no built-in step-count safeguard. See
    // python-worker.js's own header comment for the fuller reasoning,
    // including why Pyodide's official Worker support makes the
    // "does the global get exposed correctly" question lower-risk
    // here than it was for WAT/TypeScript (still confirmed directly,
    // not just assumed).
    //
    // One persistent worker for the whole page session (like the JS
    // Run button's jsRunWorkerState -- there's only one Python
    // language). Classic worker (importScripts): matches how
    // vendor/python/pyodide.js is already loaded on the main thread
    // (a plain script, not an ES module).
    const pythonWorkerState = { worker: null };
    const PYTHON_TIMEOUT_MS = 20000;
    return {
      async run(source, cases) {
        try {
          const res = await window.callWorker(
            pythonWorkerState, "python-worker.js", { id: "run", source, cases },
            PYTHON_TIMEOUT_MS, "Your code took too long to finish (over 20s) -- likely an infinite loop or code much slower than expected on these inputs.");
          if (res.id === "error") return { error: res.error };
          const { id, ...out } = res;
          return out;
        } catch (e) {
          return { error: String((e && e.message) || e) };
        }
      },
    };
  }

  // -- Ruby: ruby.wasm --------------------------------------------------
  async function loadRuby() {
    if (!(await vendored("ruby"))) return null;
    // L3: VM setup+execute moved off the main thread into
    // ruby-worker.js. Same class of unbounded-hang risk as the other
    // L3 migrations (JS/TS/WAT/retro): a genuine infinite loop in a
    // user's Ruby solve() has no built-in step-count safeguard. See
    // ruby-worker.js's own header comment for the fuller reasoning,
    // including why (unlike WAT/TypeScript) there's no open question
    // here about whether a global gets exposed correctly inside a
    // Worker -- this loader's own UMD-capture approach already
    // sidesteps that.
    //
    // One persistent worker for the whole page session (like the JS
    // Run button's jsRunWorkerState -- there's only one Ruby
    // language). Classic worker (the default): this loader uses no
    // ES-module syntax at all.
    const rubyWorkerState = { worker: null };
    const RUBY_TIMEOUT_MS = 20000;
    return {
      async run(source, cases) {
        try {
          const res = await window.callWorker(
            rubyWorkerState, "ruby-worker.js", { id: "run", source, cases },
            RUBY_TIMEOUT_MS, "Your code took too long to finish (over 20s) -- likely an infinite loop or code much slower than expected on these inputs.");
          if (res.id === "error") return { error: res.error };
          const { id, ...out } = res;
          return out;
        } catch (e) {
          return { error: String((e && e.message) || e) };
        }
      },
    };
  }

  // -- Database: PGlite (Postgres compiled to WASM) --------------------
  async function loadPostgres() {
    if (!(await vendored("postgres"))) return null;
    // L3: PGlite setup+execute moved off the main thread into
    // postgres-worker.js. Same class of unbounded-hang risk as the
    // other L3 migrations: a malicious or buggy query (e.g. an
    // unbounded recursive CTE) has no built-in step-count safeguard --
    // directly confirmed (a real `WITH RECURSIVE` query with no
    // terminating condition) against the real vendored PGlite. Module
    // worker, matching how vendor/postgres/index.js is already loaded
    // on the main thread (a genuine ES module dynamic import).
    //
    // One persistent worker for the whole page session (like the JS
    // Run button's jsRunWorkerState -- there's only one Postgres
    // "language"). The query() interface below is unchanged -- this
    // is the only loader whose public shape isn't run(source, cases)
    // (app.js's database-track handling calls .query(schema, seed,
    // sql) directly), so the worker call is wrapped to preserve it
    // exactly rather than reshaping the caller.
    const postgresWorkerState = { worker: null };
    const POSTGRES_TIMEOUT_MS = 20000;
    return {
      async query(schema, seed, sql) {
        const res = await window.callWorker(
          postgresWorkerState, "postgres-worker.js", { id: "run", schema, seed, sql },
          POSTGRES_TIMEOUT_MS, "Your query took too long to finish (over 20s) -- likely an unbounded recursive query or a query much slower than expected.",
          { type: "module" });
        if (res.id === "error") throw new Error(res.error);
        return res.rows;
      },
    };
  }

  // -- WAT: WebAssembly Text -- vendored wabt assembles it, then it runs --
  async function loadWat() {
    if (!(await vendored("wat"))) return null;
    // L3: compile+execute moved off the main thread into wat-worker.js.
    // Unlike the retro CPU emulators (a hard maxSteps ceiling built
    // into their step loop), raw WebAssembly execution has NO built-in
    // bound at all -- directly confirmed (a hand-crafted minimal WASM
    // module, no wabt needed, plus a real, reported example: a fib
    // loop with its decrement accidentally removed, which hangs the
    // page with zero safeguard): a genuine infinite loop inside an
    // exported function hangs the calling thread indefinitely. Same
    // class of unbounded-hang risk L3 originally fixed for JavaScript,
    // not defense-in-depth the way the retro migration mostly was. See
    // wat-worker.js's own header comment for the fuller reasoning.
    //
    // One persistent worker for the whole page session (like the JS
    // Run button's jsRunWorkerState, not like retro's per-language
    // state -- there's only one WAT language). Classic worker
    // (importScripts), not module -- matches how vendor/wat/index.js
    // is already loaded on the main thread (a plain script, not an ES
    // module).
    const watWorkerState = { worker: null };
    const WAT_TIMEOUT_MS = 20000;
    return {
      async run(source, cases) {
        try {
          const res = await window.callWorker(
            watWorkerState, "wat-worker.js", { id: "run", source, cases },
            WAT_TIMEOUT_MS, "Your code took too long to finish (over 20s) -- likely an infinite loop or code much slower than expected on these inputs.");
          if (res.id === "error") return { error: res.error };
          const { id, ...out } = res;
          return out;
        } catch (e) {
          return { error: String((e && e.message) || e) };
        }
      },
    };
  }

  // -- PHP: php-wasm (the official interpreter compiled to WASM) --------
  // php-wasm's run() is async -- stdout arrives via the "output" event -- so the
  // synchronous shared caseLoop can't drive it. Instead we run ONE batched
  // script: the user source plus an injected loop over the cases (base64-embedded
  // to dodge every quoting hazard) that json_encodes each solve() result between
  // sentinels. We then parse + deep-equal in JS and return caseLoop's exact
  // {results, nsPerCase} shape. This mirrors php/harness.php's own in-process
  // loop and is a single WASM invocation.
  async function loadPhp() {
    if (!(await vendored("php"))) return null;
    // L3: execution moved off the main thread into php-worker.js.
    // Same class of unbounded-hang risk as the other L3 migrations. See
    // php-worker.js's own header comment for the fuller reasoning,
    // including why (unlike WAT/TypeScript) there's no open question
    // here about whether a global gets exposed correctly inside a
    // Worker -- php-worker.js uses the same `import()` module-worker
    // mechanism retro-worker.js already directly confirmed works.
    //
    // One persistent worker for the whole page session (like the JS
    // Run button's jsRunWorkerState -- there's only one PHP language).
    // Module worker ({ type: "module" }): matches how vendor/php/es.js
    // is already loaded on the main thread (a genuine ES module
    // dynamic import, not a classic script).
    const phpWorkerState = { worker: null };
    const PHP_TIMEOUT_MS = 20000;
    return {
      async run(source, cases) {
        try {
          const res = await window.callWorker(
            phpWorkerState, "php-worker.js", { id: "run", source, cases },
            PHP_TIMEOUT_MS, "Your code took too long to finish (over 20s) -- likely an infinite loop or code much slower than expected on these inputs.",
            { type: "module" });
          if (res.id === "error") return { error: res.error };
          const { id, ...out } = res;
          return out;
        } catch (e) {
          return { error: String((e && e.message) || e) };
        }
      },
    };
  }

  // -- C: clang compiled to WASIX (Wasmer), running fully in-browser ----
  // Needs SharedArrayBuffer, so the page must be cross-origin isolated (app.js
  // ensures this before dispatching here). We compile the user's practice.c + the
  // worked clean.c/optimized.c + the baked harness.c/json.h/solution.h into one
  // wasm, then run it: the harness reads ../test_cases.json and prints PASS/FAIL
  // per case, which we parse into the usual {results, nsPerCase} shape. Same
  // artifact as the CLI harness.
  //
  // A FRESH Worker (web/c-worker.js) is spawned for EVERY run() call and
  // terminated afterward -- unlike loadCpp() below, which spawns ONE
  // persistent worker and reuses it (fine for that toolchain; NOT fine
  // for this one). Confirmed necessary in two stages, not guessed
  // upfront: an earlier fix re-instantiated just the compiled `clang`
  // module fresh per call, within a single long-lived session -- still
  // hung on a second, fully sequential run (browser console: uncaught
  // "RuntimeError: unreachable" inside wasmer_js_bg.wasm, escaping as a
  // silent hang since it happened inside a shared context rather than
  // propagating a rejected Promise). An independent developer building a
  // similar in-browser clang/LLVM tool on this exact SDK documented the
  // identical symptom after "launching more than a couple programs", and
  // their confirmed fix required a genuinely fresh execution context --
  // a new Worker with the SDK completely re-imported and re-initialized
  // -- for every single run, not just fresh module instances within a
  // shared one. (https://lights0123.com/blog/2025/01/07/hip-script/)
  // An earlier, separate fix added a mutual-exclusion lock between Run
  // and Analyze on the assumption overlapping calls were the trigger;
  // that lock is still correct and worth keeping (real concurrency risk
  // exists independently), but was confirmed NOT sufficient for this.
  //
  // Costs a fresh worker spawn + SDK re-init + clang re-instantiation on
  // every C run instead of just the first -- real overhead, but far
  // better than a hang requiring a hard refresh. dt (compile+run timing)
  // is measured INSIDE the worker, bracketing only that region exactly
  // as before -- excludes this new spawn/init overhead, which would
  // otherwise leak into nsPerCase and distort the Complexity Lab's
  // growth-rate measurements for C.
  async function loadC() {
    if (!(await vendored("c"))) return null;
    return {
      async run(source, cases, lang, modeSize) {
        const worker = new Worker("c-worker.js");
        const spawnedAt = performance.now();
        console.log(`[glifex-c] spawning worker (cases=${(cases || []).length})`);
        let res;
        try {
          res = await Promise.race([
            new Promise((resolve, reject) => {
              const cleanup = () => { worker.removeEventListener("message", onmsg); worker.removeEventListener("error", onerr); };
              const onmsg = (e) => { cleanup(); resolve(e.data || {}); };
              const onerr = (e) => { cleanup(); reject(new Error(String((e && e.message) || e))); };
              worker.addEventListener("message", onmsg);
              worker.addEventListener("error", onerr);
              worker.postMessage({ id: "run", source, cases, lang, modeSize });
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("C worker timed out after 90s (likely stuck; terminated)")), 90000)),
          ]);
          console.log(`[glifex-c] worker responded after ${Math.round(performance.now() - spawnedAt)}ms: ${res.id === "error" ? "ERROR -- " + res.error : "ok"}`);
        } catch (e) {
          console.warn(`[glifex-c] worker did not respond cleanly after ${Math.round(performance.now() - spawnedAt)}ms: ${(e && e.message) || e}`);
          return { error: "C runtime error: " + String((e && e.message) || e) };
        } finally {
          // Always runs, whichever branch of the race above settled --
          // including the local timeout, so a stuck worker can't leak.
          // (The outer app-level runtime lock also has its own 2-minute
          // timeout, but that one only stops WAITING on this call, it
          // can't reach in and terminate the worker itself -- this local
          // one, shorter and specific to this call, is what actually
          // cleans it up.)
          console.log("[glifex-c] terminating worker");
          worker.terminate();
        }

        if (res.id === "error")
          return { error: "C runtime error:\n" + String(res.error || "").slice(0, 400) + (res.output ? "\n" + String(res.output).trim().slice(0, 600) : "") };

        const out = String(res.output || "");
        const byI = new Map(), metricByI = new Map();   // L1-c-parse
        const spaceByI = new Map();   // L4-c-space
        for (const line of out.split("\n")) {
          const m = line.match(/\[(PASS|FAIL)\]\s+case\s+(\d+)(?:\s+expected=(.*?)\s+got=(.*))?/);
          if (m) byI.set(Number(m[2]), { ok: m[1] === "PASS", exp: m[3], got: m[4] });
          const mm = line.match(/\[METRIC\]\s+case\s+(\d+)\s+ns=(\d+)/);
          if (mm) metricByI.set(Number(mm[1]), Number(mm[2]));
          const ms = line.match(/\[SPACE\]\s+case\s+(\d+)\s+heap=(\d+)\s+stack=(\d+)/);   // L4-c-space
          if (ms) spaceByI.set(Number(ms[1]), { heap: Number(ms[2]), stack: Number(ms[3]) });
        }
        if (byI.size === 0) return { error: "no case results from harness:\n" + out.trim().slice(0, 600) };

        const results = cases.map((c, i) => {
          const r = byI.get(i);
          if (!r) return { i, ok: false, error: "no result for case", expected: c.expected };
          const tNs = metricByI.get(i);   // L1-c-rows
          const sp = spaceByI.get(i);
          const spx = sp ? { space: sp.heap, spaceStack: sp.stack } : {};
          if (r.ok) return { i, ok: true, got: c.expected, expected: c.expected, tNs, ...spx };
          return { i, ok: false, got: r.got != null ? r.got : "(see output)", expected: r.exp != null ? r.exp : c.expected, tNs, ...spx };
        });
        const nsPerCase = cases.length ? (res.dt * 1e6) / cases.length : 0;
        return { results, nsPerCase, spaceApprox: true, spaceApproxKind: "peak" };
      },
    };
  }

  // -- C++: vendored Binji wasm-clang (single-process clang-8 + wasm-ld) --
  async function loadCpp() {
    if (!(await vendored("cpp"))) return null;
    return {
      async run(source, cases, lang) {
        const L = lang || {};
        const sup = L.support || {};
        // one translation unit: harness + the user's practice (source) + baked clean/optimized
        const src = [sup["harness.cpp"] || "", source || "", L.clean || "", L.optimized || ""].join("\n");
        const headers = { "solution.hpp": sup["solution.hpp"] || "", "json.hpp": sup["json.hpp"] || "" };
        // Fresh worker per call, not reused across the session -- mirrors
        // loadC()'s own fix for the exact same failure mode (see this
        // project's git history: a stuck WASM instance inside a reused
        // worker poisons every subsequent call for the rest of the
        // session, since the worker is still frozen executing the old
        // call and can never respond to a new message). C++ carried this
        // same vulnerability until a hand-rolled hash table with a fixed
        // capacity could infinite-loop at large n, taking down the
        // entire C++ runtime, not just that one call, until a hard
        // refresh -- exactly the originally-reported C symptom, just via
        // a different trigger.
        const worker = new Worker("cpp-worker.js");
        const spawnedAt = performance.now();
        console.log(`[glifex-cpp] spawning worker (cases=${(cases || []).length})`);
        let res;
        try {
          res = await Promise.race([
            new Promise((resolve, reject) => {
              const cleanup = () => { worker.removeEventListener("message", onmsg); worker.removeEventListener("error", onerr); };
              const onmsg = (e) => { cleanup(); resolve(e.data || {}); };
              const onerr = (e) => { cleanup(); reject(new Error(String((e && e.message) || e))); };
              worker.addEventListener("message", onmsg);
              worker.addEventListener("error", onerr);
              worker.postMessage({ id: "run", source: src, headers, cases, variant: "practice" });
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("C++ worker timed out after 90s (likely stuck; terminated)")), 90000)),
          ]);
          console.log(`[glifex-cpp] worker responded after ${Math.round(performance.now() - spawnedAt)}ms: ${res.id === "error" ? "ERROR -- " + res.error : "ok"}`);
        } catch (e) {
          console.warn(`[glifex-cpp] worker did not respond cleanly after ${Math.round(performance.now() - spawnedAt)}ms: ${(e && e.message) || e}`);
          return { error: "C++ runtime error: " + String((e && e.message) || e) };
        } finally {
          // Always runs, whichever branch of the race above settled --
          // including the local timeout, so a stuck worker can't leak
          // into (and poison) the next call. (The outer app-level
          // runtime lock also has its own 2-minute timeout, but that one
          // only stops WAITING on this call, it can't reach in and
          // terminate the worker itself -- this local one, shorter and
          // specific to this call, is what actually cleans it up.)
          console.log("[glifex-cpp] terminating worker");
          worker.terminate();
        }
        const dt = performance.now() - spawnedAt;
        if (res.id === "error")
          return { error: "C++ compile/runtime error:\n" + String(res.error || "").slice(0, 400) + "\n" + String(res.output || "").trim().slice(0, 600) };
        const out = String(res.output || "");
        const byI = new Map(), metricByI = new Map();   // L1-cpp-parse
        const spaceByI = new Map();   // L4-cpp-space
        for (const line of out.split("\n")) {
          const m = line.match(/\[(PASS|FAIL)\]\s+case\s+(\d+)(?:\s+expected=(.*?)\s+got=(.*))?/);
          if (m) byI.set(Number(m[2]), { ok: m[1] === "PASS", exp: m[3], got: m[4] });
          const mm = line.match(/\[METRIC\]\s+case\s+(\d+)\s+ns=(\d+)/);
          if (mm) metricByI.set(Number(mm[1]), Number(mm[2]));
          const ms = line.match(/\[SPACE\]\s+case\s+(\d+)\s+heap=(\d+)\s+stack=(\d+)/);   // L4-cpp-space
          if (ms) spaceByI.set(Number(ms[1]), { heap: Number(ms[2]), stack: Number(ms[3]) });
        }
        if (byI.size === 0) return { error: "no case results from harness:\n" + out.trim().slice(0, 600) };
        const results = cases.map((c, i) => {
          const r = byI.get(i);
          if (!r) return { i, ok: false, error: "no result for case", expected: c.expected };
          const tNs = metricByI.get(i);   // L1-cpp-rows
          const sp = spaceByI.get(i);
          const spx = sp ? { space: sp.heap, spaceStack: sp.stack } : {};
          if (r.ok) return { i, ok: true, got: c.expected, expected: c.expected, tNs, ...spx };
          return { i, ok: false, got: r.got != null ? r.got : "(see output)", expected: r.exp != null ? r.exp : c.expected, tNs, ...spx };
        });
        const nsPerCase = cases.length ? (dt * 1e6) / cases.length : 0;
        return { results, nsPerCase, spaceApprox: true, spaceApproxKind: "peak" };
      },
    };
  }

  // -- C#: vendored .NET-wasm + Roslyn, compiling the real CLI harness in-browser
  // Runs OFF the main thread in a persistent classic worker (csharp-worker.js),
  // which boots the runtime once and reuses it. The .NET loader keys its boot
  // path off `typeof window`, and a dedicated worker has none -- so the worker
  // shims `self.window = self` before importing dotnet.js, which makes the
  // loader take the normal web boot path (it hung otherwise -- see the worker's
  // header for the full trace-backed explanation). Single-threaded, so no COI.
  // The worker parses the harness output and returns the usual {results,
  // nsPerCase} shape. MODULE worker + the worker's window-shim = main-thread env
  // flags (WEB=true via shim, WORKER=false since module workers lack
  // importScripts); a classic worker sets WORKER=true and hangs.
  async function loadCsharp() {
    if (!(await vendored("csharp"))) return null;
    const csharpWorkerState = { worker: null };
    const CSHARP_TIMEOUT_MS = 120000;   // first run pays the one-time boot + Roslyn compile
    return {
      async run(source, cases, lang) {
        try {
          const support = (lang && lang.support) || {};
          const res = await window.callWorker(
            csharpWorkerState, "csharp-worker.js", { id: "run", source, cases, support },
            CSHARP_TIMEOUT_MS, "C# took too long (over 120s) -- likely an infinite loop or a first-run boot stall.",
            { type: "module" });   // module worker + the worker's window-shim = main-thread env flags (WEB=true, WORKER=false); classic worker hangs
          if (res.id === "error") return { error: res.error };
          const { id, ...out } = res;
          return out;
        } catch (e) {
          return { error: String((e && e.message) || e) };
        }
      },
    };
  }

  async function loadRust() {
    if (!(await vendored("rust"))) return null;
    const rustWorkerState = { worker: null };
    const RUST_TIMEOUT_MS = 120000;   // first run pays the one-time sysroot fetch + miri.wasm compile
    return {
      async run(source, cases, lang) {
        try {
          const support = (lang && lang.support) || {};
          const res = await window.callWorker(
            rustWorkerState, "rust-worker.js", { id: "run", source, cases, support },
            RUST_TIMEOUT_MS, "Rust took too long (over 120s) -- Miri is an interpreter (slow); likely a heavy loop or first-run boot.",
            { type: "module" });
          if (res.id === "error") return { error: res.error };
          const { id, ...out } = res;
          return out;
        } catch (e) {
          return { error: String((e && e.message) || e) };
        }
      },
    };
  }

  // -- Retro assembly tracks: customasm.wasm assembles, first-party cores run --
  // One generic loader, per-ISA config (RETRO-CONTRACT: factored at n=3 cores).
  // Assemble ABI (raw wasm string-passing) proven from customasm web/main.js.
  // Contract per track: program at `entry`, inputs as bytes at `inAddr`,
  // u16 LE result at `outAddr`, halt instruction ends the run.
  // Timing metric: if the core exposes `cycles` (8080: T-states, validated
  // against the CP/M diagnostic ROMs -- see web/retro/test-roms/8080/), report
  // true cycles and reference time at `clockHz`. Otherwise fall back to the
  // coarse instruction count at 1000 ns/insn (6502/SM83 until their cycle
  // tables are validated against Tom Harte's SingleStepTests -- see docs).
  // Space metric: `spaceBytes` = distinct bytes written outside the program
  // image (working memory incl. stack), the CS sense of space complexity.
  function makeRetroLoader(cfg) {
    return async function loadRetro() {
      if (!(await vendored("asm-6502"))) return null;   // all tracks share customasm.wasm
      // L3: assembly + emulation moved off the main thread into
      // retro-worker.js -- a genuinely runaway program (an
      // unconditional jump-to-self, or code that runs past maxSteps
      // before the existing runaway check catches it) used to be able
      // to freeze the tab the same way an unprotected JS solve() could.
      // See retro-worker.js's own header comment for the fuller
      // reasoning, including why 6502/SM83's fallback wall-clock timing
      // (i8080 has real cycle counts; they don't yet) is a structural
      // similarity to JS's old noise pattern worth being aware of, not
      // a confirmed problem for retro -- that's explicitly out of scope
      // for this specific change.
      //
      // One persistent worker per LANGUAGE (this closure's own cfg),
      // not shared across 6502/SM83/i8080 -- each is its own,
      // independent { worker: null } state, matching how each already
      // gets its own entry in LOADERS below. Module worker ({ type:
      // "module" }), not classic: the CPU cores are genuine ES modules,
      // which importScripts() (what the classic-script workers use)
      // can't load.
      const retroWorkerState = { worker: null };
      const RETRO_TIMEOUT_MS = 20000;
      return {
        async run(source, cases) {
          try {
            const res = await window.callWorker(
              retroWorkerState, "retro-worker.js", { id: "run", cfg, source, cases },
              RETRO_TIMEOUT_MS, "Your program took too long to finish (over 20s) -- likely a runaway loop (no " + cfg.haltName + ") or code much slower than expected on these inputs.",
              { type: "module" });
            if (res.id === "error") return { error: res.error };
            const { id, ...out } = res;
            return out;
          } catch (e) {
            return { error: String((e && e.message) || e) };
          }
        },
      };
    };
  }
  const load6502 = makeRetroLoader({
    name: "6502", coreModule: "./retro/cpu6502.mjs", coreExport: "Cpu6502",
    ruledefPath: "retro/6502.ruledef.asm", ruledefMarker: "#ruledef cpu6502",
    entry: 0x0600, inAddr: 0x10, outAddr: 0x12, maxSteps: 200000, haltName: "BRK",
  });
  const loadSm83 = makeRetroLoader({
    name: "SM83", coreModule: "./retro/cpuSm83.mjs", coreExport: "CpuSm83",
    ruledefPath: "retro/sm83.ruledef.asm", ruledefMarker: "#ruledef sm83",
    entry: 0x0100, inAddr: 0xC000, outAddr: 0xC010, maxSteps: 200000, haltName: "HALT",
  });
  const load8080 = makeRetroLoader({
    name: "8080", coreModule: "./retro/cpu8080.mjs", coreExport: "Cpu8080",
    ruledefPath: "retro/8080.ruledef.asm", ruledefMarker: "#ruledef i8080",
    entry: 0x0100, inAddr: 0xC000, outAddr: 0xC010, maxSteps: 400000, haltName: "HLT",
    initSp: 0xF000, clockHz: 2000000,   // T-states / 2.000 MHz (original 8080; ROM-validated table)
  });
  const LOADERS = { typescript: loadTypeScript, python: loadPython, ruby: loadRuby, postgres: loadPostgres, wat: loadWat, php: loadPhp, c: loadC, cpp: loadCpp, csharp: loadCsharp, rust: loadRust, "asm-6502": load6502, sm83: loadSm83, i8080: load8080 };

  async function get(lang) {
    if (lang === "javascript") return "native";        // no runtime needed
    if (!(lang in cache)) {
      cache[lang] = LOADERS[lang]
        ? LOADERS[lang]().catch((e) => {
            console.error(`[glifex] ${lang} runtime failed to load:`, e);
            loadErrors[lang] = String(e.message || e);
            return null;
          })
        : Promise.resolve(null);
    }
    return cache[lang];
  }

  return { get, has: async (lang) => (await get(lang)) !== null, error: (lang) => loadErrors[lang] };
})();
if (typeof window !== "undefined") window.Runtimes = Runtimes;
