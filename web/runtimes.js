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
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
      // never win. Offline still works — the SW's SWR path serves its cached copy.
      const r = await fetch(`vendor/${lang}/manifest.json`, { cache: "no-cache" });
      return r.ok;
    } catch { return false; }
  }

  function caseLoop(callSolve, cases) {
    const results = [];
    const t0 = performance.now();
    for (let i = 0; i < cases.length; i++) {
      try {
        const got = callSolve(cases[i].input);
        results.push({ i, ok: eq(got, cases[i].expected), got, expected: cases[i].expected });
      } catch (e) {
        results.push({ i, ok: false, error: String(e.message || e), expected: cases[i].expected });
      }
    }
    let nsPerCase = cases.length ? ((performance.now() - t0) * 1e6) / cases.length : 0;
    // Fast runtimes (e.g. transpiled TS) can finish under the ~0.1ms clock
    // grain and read 0 — adaptively repeat until measurable (capped: WASM
    // per-case marshaling makes unbounded repeats expensive).
    if (nsPerCase === 0 && results.every((r) => r.ok) && cases.length) {
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

  // ── TypeScript: vendored compiler transpiles, then runs as JS ────────
  async function loadTypeScript() {
    if (!(await vendored("typescript"))) return null;
    await script("vendor/typescript/typescript.js");   // exposes window.ts
    return {
      run(source, cases) {
        const js = window.ts.transpileModule(source, {
          compilerOptions: { module: window.ts.ModuleKind.CommonJS, target: window.ts.ScriptTarget.ES2020 },
        }).outputText;
        const module = { exports: {} };
        new Function("module", "exports", js)(module, module.exports);
        const solve = module.exports.solve || module.exports;
        if (typeof solve !== "function") return { error: "no solve() exported" };
        return caseLoop(solve, cases);
      },
    };
  }

  // ── Python: Pyodide (CPython on WASM) ────────────────────────────────
  async function loadPython() {
    if (!(await vendored("python"))) return null;
    await script("vendor/python/pyodide.js");
    const py = await window.loadPyodide({ indexURL: "vendor/python/" });
    return {
      run(source, cases) {
        py.runPython(source);                          // defines solve()
        const solve = py.globals.get("solve");
        return caseLoop((input) => {
          const r = solve(py.toPy(input));
          const v = r && typeof r.toJs === "function" ? r.toJs({ create_proxies: false }) : r;
          return v instanceof Map ? Object.fromEntries(v) : v;
        }, cases);
      },
    };
  }

  // ── Ruby: ruby.wasm ──────────────────────────────────────────────────
  async function loadRuby() {
    if (!(await vendored("ruby"))) return null;
    // Deterministic UMD capture: the wrapper's first branch is
    // `typeof exports === 'object' -> factory(exports)`, so evaluating the
    // file with an explicit exports object hands us the API directly — no
    // global-name roulette, identical behavior on every device (the
    // window-probe approach failed on Android while passing on desktop).
    const src = await (await fetch("vendor/ruby/browser.umd.js", { cache: "no-cache" })).text();
    const exportsObj = {};
    new Function("exports", "module", src)(exportsObj, { exports: exportsObj });
    const { DefaultRubyVM } = exportsObj;
    if (!DefaultRubyVM) throw new Error("ruby umd evaluated but exported no DefaultRubyVM");
    // stdlib build required: the harness does `require "json"`.
    const res = await fetch("vendor/ruby/ruby+stdlib.wasm");
    const mod = await WebAssembly.compileStreaming(res);
    const { vm } = await DefaultRubyVM(mod);
    return {
      run(source, cases) {
        vm.eval(source);                               // defines solve
        return caseLoop((input) => {
          const r = vm.eval(`require "json"; JSON.generate(solve(JSON.parse(%q(${JSON.stringify(input)}))))`);
          return JSON.parse(r.toString());
        }, cases);
      },
    };
  }

  // ── Database: PGlite (Postgres compiled to WASM) ────────────────────
  async function loadPostgres() {
    if (!(await vendored("postgres"))) return null;
    const { PGlite } = await import("./vendor/postgres/index.js");
    return {
      async query(schema, seed, sql) {
        const db = new PGlite();                       // in-memory, throwaway
        await db.exec(schema);
        await db.exec(seed);
        const res = await db.query(sql);
        await db.close();
        return res.rows.map((r) => Object.values(r));
      },
    };
  }

  // ── WAT: WebAssembly Text — vendored wabt assembles it, then it runs ──
  async function loadWat() {
    if (!(await vendored("wat"))) return null;
    await script("vendor/wat/index.js");               // exposes window.WabtModule
    const wabt = await window.WabtModule();
    return {
      run(source, cases) {
        let binary;
        try {
          const mod = wabt.parseWat("solve.wat", source);
          mod.resolveNames();
          mod.validate();
          binary = mod.toBinary({}).buffer;            // Uint8Array of wasm bytes
          mod.destroy();
        } catch (e) {
          return { error: "WAT assembly error: " + String(e.message || e) };
        }
        let solve;
        try {
          const instance = new WebAssembly.Instance(new WebAssembly.Module(binary), {});
          solve = instance.exports.solve;
        } catch (e) {
          return { error: "WASM instantiate error: " + String(e.message || e) };
        }
        if (typeof solve !== "function") return { error: 'no "solve" export (numbers in, number out)' };
        // WAT is numeric-only: pass the input object's values positionally.
        return caseLoop((input) => solve(...Object.values(input)), cases);
      },
    };
  }

  // ── PHP: php-wasm (the official interpreter compiled to WASM) ────────
  // php-wasm's run() is async — stdout arrives via the "output" event — so the
  // synchronous shared caseLoop can't drive it. Instead we run ONE batched
  // script: the user source plus an injected loop over the cases (base64-embedded
  // to dodge every quoting hazard) that json_encodes each solve() result between
  // sentinels. We then parse + deep-equal in JS and return caseLoop's exact
  // {results, nsPerCase} shape. This mirrors php/harness.php's own in-process
  // loop and is a single WASM invocation.
  async function loadPhp() {
    if (!(await vendored("php"))) return null;
    const { PhpWeb } = await import("./vendor/php/es.js");
    const BEGIN = "@@GLIFEX_BEGIN@@", END = "@@GLIFEX_END@@";
    const b64 = (s) => {
      const bytes = new TextEncoder().encode(s);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    };
    return {
      async run(source, cases) {
        // A fresh throwaway interpreter per Run (like PGlite): reusing one would
        // hit "Cannot redeclare solve()" on the second run, since php-wasm keeps
        // memory across run() calls. locateFile pins every .wasm/.data asset to
        // the vendored dir — nothing touches a CDN at run time (THE OFFLINE RULE).
        let out = "";
        const php = new PhpWeb({
          print: (s) => { out += s; },
          printErr: () => {},
          locateFile: () => "vendor/php/php-web.wasm",
        });
        await new Promise((res) => php.addEventListener("ready", res, { once: true }));
        const stripped = source.replace(/\?>\s*$/, "");   // tolerate a trailing close tag
        const script = stripped + "\n" +
          "$__g = json_decode(base64_decode('" + b64(JSON.stringify(cases)) + "'), true);\n" +
          "$__o = [];\n" +
          "foreach ($__g as $__i => $__c) {\n" +
          "  try { $__o[] = ['i' => $__i, 'got' => solve($__c['input'])]; }\n" +
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
          return { i, ok: eq(r.got, c.expected), got: r.got, expected: c.expected };
        });
        const nsPerCase = cases.length ? (dt * 1e6) / cases.length : 0;
        return { results, nsPerCase };
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
  async function loadC() {
    if (!(await vendored("c"))) return null;
    const { init, Wasmer, Directory } = await import("./vendor/c/index.mjs");
    await init();   // loads the sibling wasmer_js_bg.wasm (vendored) -- offline
    const webc = new Uint8Array(await (await fetch("vendor/c/clang.webc")).arrayBuffer());
    const clang = await Wasmer.fromFile(webc);   // ~100MB, loaded once per session
    return {
      async run(source, cases, lang) {
        const L = lang || {};
        const sup = L.support || {};
        try {
          // One Directory mounted at "/": test_cases.json at the root and sources
          // under /c, run with cwd /c so the harness's "../test_cases.json"
          // resolves to /test_cases.json whether or not cwd is honored.
          const dir = new Directory();
          await dir.createDir("/c");
          await dir.writeFile("/test_cases.json", JSON.stringify(cases));
          await dir.writeFile("/c/practice.c", source);
          await dir.writeFile("/c/clean.c", L.clean || "");
          await dir.writeFile("/c/optimized.c", L.optimized || "");
          await dir.writeFile("/c/harness.c", sup["harness.c"] || "");
          await dir.writeFile("/c/json.h", sup["json.h"] || "");
          await dir.writeFile("/c/solution.h", sup["solution.h"] || "");

          const t0 = performance.now();
          const comp = await clang.entrypoint.run({
            args: ["-O2", "-std=c11", "/c/practice.c", "/c/clean.c", "/c/optimized.c",
                   "/c/harness.c", "-o", "/c/out.wasm"],
            mount: { "/": dir },
          });
          const cres = await comp.wait();
          if (!cres.ok) return { error: "compile error:\n" + String(cres.stderr || "").trim().slice(0, 800) };

          const wasm = await dir.readFile("/c/out.wasm");
          const prog = await Wasmer.fromFile(wasm);
          const rres = await (await prog.entrypoint.run({
            args: ["practice"], mount: { "/": dir }, cwd: "/c",
          })).wait();
          const dt = performance.now() - t0;

          const out = String(rres.stdout || "");
          const byI = new Map();
          for (const line of out.split("\n")) {
            const m = line.match(/\[(PASS|FAIL)\]\s+case\s+(\d+)(?:\s+expected=(.*?)\s+got=(.*))?/);
            if (m) byI.set(Number(m[2]), { ok: m[1] === "PASS", exp: m[3], got: m[4] });
          }
          if (byI.size === 0) return { error: "no case results from harness:\n" + out.trim().slice(0, 600) };

          const results = cases.map((c, i) => {
            const r = byI.get(i);
            if (!r) return { i, ok: false, error: "no result for case", expected: c.expected };
            if (r.ok) return { i, ok: true, got: c.expected, expected: c.expected };
            return { i, ok: false, got: r.got != null ? r.got : "(see output)", expected: r.exp != null ? r.exp : c.expected };
          });
          const nsPerCase = cases.length ? (dt * 1e6) / cases.length : 0;
          return { results, nsPerCase };
        } catch (e) {
          return { error: "C runtime error: " + String((e && e.message) || e) };
        }
      },
    };
  }

  const LOADERS = { typescript: loadTypeScript, python: loadPython, ruby: loadRuby, postgres: loadPostgres, wat: loadWat, php: loadPhp, c: loadC };

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
