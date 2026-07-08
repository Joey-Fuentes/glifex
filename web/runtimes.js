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
          const MP = "/project";   // named mount (root-mount is not honored)
          const comp = await clang.entrypoint.run({
            args: ["-O2", "-std=c11", MP + "/c/practice.c", MP + "/c/clean.c", MP + "/c/optimized.c",
                   MP + "/c/harness.c", "-o", MP + "/c/out.wasm"],
            mount: { [MP]: dir },
          });
          const cres = await comp.wait();
          if (!cres.ok) return { error: "compile error:\n" + String(cres.stderr || "").trim().slice(0, 800) };

          const wasm = await dir.readFile("/c/out.wasm");
          const prog = await Wasmer.fromFile(wasm);
          const rres = await (await prog.entrypoint.run({
            args: ["practice"], mount: { [MP]: dir }, cwd: MP + "/c",
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

  // ── C++: vendored Binji wasm-clang (single-process clang-8 + wasm-ld) ──
  async function loadCpp() {
    if (!(await vendored("cpp"))) return null;
    const worker = new Worker("cpp-worker.js");   // drives the committed cpp-shared.js fork
    return {
      async run(source, cases, lang) {
        const L = lang || {};
        const sup = L.support || {};
        // one translation unit: harness + the user's practice (source) + baked clean/optimized
        const src = [sup["harness.cpp"] || "", source || "", L.clean || "", L.optimized || ""].join("\n");
        const headers = { "solution.hpp": sup["solution.hpp"] || "", "json.hpp": sup["json.hpp"] || "" };
        const t0 = performance.now();
        const res = await new Promise((resolve) => {
          const onmsg = (e) => { worker.removeEventListener("message", onmsg); resolve(e.data || {}); };
          worker.addEventListener("message", onmsg);
          worker.postMessage({ id: "run", source: src, headers, cases, variant: "practice" });
        });
        const dt = performance.now() - t0;
        if (res.id === "error")
          return { error: "C++ compile/runtime error:\n" + String(res.error || "").slice(0, 400) + "\n" + String(res.output || "").trim().slice(0, 600) };
        const out = String(res.output || "");
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
      },
    };
  }

  // -- 6502 assembly: customasm.wasm assembles, 6502.ts (cycle-exact) runs ------
  // Assemble ABI (raw wasm string-passing) proven from customasm web/main.js;
  // execute path proven via the retro-smoke CI. Cycles -> deterministic time
  // (6502 @ 1.0 MHz reference); flows through the standard {results, nsPerCase}.
  const NS_PER_INSN_6502 = 1000, ENTRY_6502 = 0x0600;
  async function load6502() {
    if (!(await vendored("asm-6502"))) return null;
    const casm = (await WebAssembly.instantiate(
      await (await fetch("vendor/asm-6502/customasm.wasm")).arrayBuffer()
    )).instance.exports;
    const { Cpu6502 } = await import("./retro/cpu6502.mjs");   // first-party, tested core
    const rres = await fetch("retro/6502.ruledef.asm");
    const RULEDEF = rres.ok ? await rres.text() : "";
    const RULEDEF_OK = RULEDEF.includes("#ruledef cpu6502");
    // Prepend the 6502 instruction set + origin so users write PLAIN 6502 (no
    // #ruledef/#addr). #bankdef puts labels at $0600 with output starting at byte 0.
    const PREAMBLE = RULEDEF + "\n#bankdef prog { #addr 0x0600, #outp 0 }\n#bank prog\n";
    const enc = new TextEncoder(), dec = new TextDecoder();
    const mkStr = (str) => { const b = enc.encode(str); const q = casm.wasm_string_new(b.length); for (let i = 0; i < b.length; i++) casm.wasm_string_set_byte(q, i, b[i]); return q; };
    const rdStr = (q) => { const n = casm.wasm_string_get_len(q); const o = new Uint8Array(n); for (let i = 0; i < n; i++) o[i] = casm.wasm_string_get_byte(q, i); return dec.decode(o); };
    function assemble(source) {
      const fp = mkStr("hexstr"), ap = mkStr(PREAMBLE + source), op = casm.wasm_assemble(fp, ap);
      const text = rdStr(op);
      casm.wasm_string_drop(fp); casm.wasm_string_drop(ap); casm.wasm_string_drop(op);
      // STRICT parse: the hexstr payload is line(s) of pure hex. Extract hex
      // ONLY from lines that are entirely hex -- never strip letters out of
      // diagnostics (words like "resolved"/"error" contain a-f and corrupt).
      const clean = text.replace(/\x1b\[[0-9;]*m/g, "");
      const hex = clean.split("\n").map((l) => l.trim()).filter((l) => l && /^[0-9a-fA-F]+$/.test(l)).join("");
      if (!hex || hex.length % 2) {
        // ALWAYS a non-empty, verbose error: include the raw assembler output
        // so failures diagnose themselves in the UI instead of crashing.
        const raw = clean.trim();
        return { error: raw ? raw.slice(0, 800) : "assembler produced no output (raw was empty; ruledef loaded: " + RULEDEF_OK + ")" };
      }
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
      return { bytes };
    }
    return {
      run(source, cases) {
        if (!RULEDEF_OK) return { error: "6502 ruledef failed to load (retro/6502.ruledef.asm missing or invalid) -- try a hard refresh; if it persists, the deploy is incomplete." };
        const asm = assemble(source);
        if (!asm.bytes) return { error: "6502 assembly error: " + (asm.error || "unknown (no bytes, no message)") };
        let totalInsns = 0;
        const results = cases.map((c, i) => {
          const ram = new Uint8Array(0x10000);
          asm.bytes.forEach((b, k) => (ram[(ENTRY_6502 + k) & 0xffff] = b));
          const vals = Array.isArray(c.input) ? c.input : Object.values(c.input);
          vals.forEach((v, k) => (ram[0x10 + k] = v & 0xff));   // inputs -> $10..
          const bus = { read: (a) => ram[a & 0xffff], write: (a, v) => { ram[a & 0xffff] = v & 0xff; }, readWord: (a) => ram[a & 0xffff] | (ram[(a + 1) & 0xffff] << 8) };
          let got, insns = 0;
          try {
            const cpu = new Cpu6502(bus);
            cpu.pc = ENTRY_6502;
            let steps = 0;
            while (!cpu.halted) {
              if (steps++ > 200000) throw new Error("runaway (no BRK)");
              cpu.step();
            }
            insns = steps;              // instructions executed (coarse metric)
            got = ram[0x12];            // result <- $12
          } catch (e) {
            return { i, ok: false, error: String((e && e.message) || e), expected: c.expected };
          }
          totalInsns += insns;
          return { i, ok: eq(got, c.expected), got, expected: c.expected };
        });
        // TODO(cycle-accuracy): coarse INSTRUCTION count, not true 6502 cycles.
        // Real cycle timing needs page-cross/branch/RMW penalties validated against
        // Tom Harte's dataset (see docs). Reported to the UI as "instructions".
        const insnsPerCase = cases.length ? totalInsns / cases.length : 0;
        return { results, nsPerCase: insnsPerCase * NS_PER_INSN_6502, instructions: Math.round(insnsPerCase) };
      },
    };
  }

  const LOADERS = { typescript: loadTypeScript, python: loadPython, ruby: loadRuby, postgres: loadPostgres, wat: loadWat, php: loadPhp, c: loadC, cpp: loadCpp, "asm-6502": load6502 };

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
