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
    for (let i = 0; i < cases.length; i++) {
      try {
        const got = callSolve(cases[i].input);
        results.push({ i, ok: eq(got, cases[i].expected), got, expected: cases[i].expected });
      } catch (e) {
        results.push({ i, ok: false, error: String(e.message || e), expected: cases[i].expected });
      }
    }
    return { results };
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
    await script("vendor/ruby/browser.script.iife.js");
    // Global name has varied across @ruby/wasm-wasi releases — try candidates.
    const rubyNS = window["ruby-wasm-wasi"] || window["ruby.wasm"] || window.RubyWasm || window["@ruby/wasm-wasi"];
    if (!rubyNS) throw new Error("ruby.wasm loaded but exposed no known global");
    const { DefaultRubyVM } = rubyNS;
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

  const LOADERS = { typescript: loadTypeScript, python: loadPython, ruby: loadRuby, postgres: loadPostgres };

  async function get(lang) {
    if (lang === "javascript") return "native";        // no runtime needed
    if (!(lang in cache)) {
      cache[lang] = LOADERS[lang]
        ? LOADERS[lang]().catch((e) => { console.error(`[glifex] ${lang} runtime failed to load:`, e); return null; })
        : Promise.resolve(null);
    }
    return cache[lang];
  }

  return { get, has: async (lang) => (await get(lang)) !== null };
})();
if (typeof window !== "undefined") window.Runtimes = Runtimes;
