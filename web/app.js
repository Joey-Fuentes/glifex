// Glifex playground. Consumes problems.generated.json (baked from the same
// problems/ the CLI uses) so the browser can never drift from the CLI.

var state = { corpus: null, current: null, lang: "javascript", revealed: false, runtimeBusy: false };

// ── rendering ────────────────────────────────────────────────────────
function $(s) { return document.querySelector(s); }

// clear the results panel back to the neutral prompt (problem/lang switch)
function clearResults() { $("#results").innerHTML = `<div class="hint">Write your solution and press Run.</div>`; if (window.GlifexLab) GlifexLab.sync(state); /* L1-sync */ }
// loading state: spinner + message during compile/runtime fetch/execution
function showRunning(res, msg) { res.innerHTML = `<div class="running"><span class="spinner" aria-hidden="true"></span>${msg}</div>`; }

// Shared runtime-call guard. The Run button (below) and the Complexity
// Lab's Analyze button (web/lab.js) both ultimately drive the SAME
// cached, shared runtime objects (window.Runtimes.get(lang) -- see
// runtimes.js's module-level cache, one instance per language for the
// whole page lifetime). At least one of those (confirmed: C's
// Wasmer/WASIX compiler) is not safe to invoke while a PREVIOUS call
// into it is still in flight -- an overlapping call can hang the
// underlying WASM instance indefinitely. Since the SAME cached instance
// is reused for every future caller, once that happens every subsequent
// Run or Analyze for ANY language hangs too -- confirmed directly:
// mashing the Run button alone reproduces it, no Lab involved, and
// after it happens the Lab hangs on languages that were never touched.
// lab.js previously had its OWN "running" flag, checked only against
// itself -- it had no way to know about the Run button's calls, or vice
// versa, so the two entry points could still overlap each other. This
// is the single, shared lock both go through instead.
//
// The timeout below is a last-resort safety net, not the primary fix:
// the LOCK prevents the overlap that -- as far as could be confirmed
// without direct access to the vendored Wasmer/WASIX source, which
// isn't checked into this repo -- appears to cause the hang in the
// first place. Generous on purpose: C's first-ever run downloads a
// ~100MB toolchain, which can legitimately take a while on a slow
// connection, and a timeout that fires on a merely-slow-but-working
// load would be worse than no timeout at all.
//
// Raised well past the original 120s for C's current diagnostic
// config: reps=10 combined with retryOnError=2 means up to 10 reps x
// up to 3 attempts each (the original attempt plus up to 2 retries) =
// up to 30 total compile+run attempts in a single Analyze click, each
// a fully fresh worker. At ~15-20s per attempt (measured), even the
// EXPECTED case (not worst case) already approaches 250s, so 240
// would still be too tight -- this needs real headroom above the
// worst-case math (~600s at 20s/attempt), not just double the
// original. Not the shipped value -- revert once these C diagnostics
// conclude.
const RUNTIME_TIMEOUT_MS = 600000;
// The plain Run button used to execute JS directly on the main thread,
// same as the Lab did before L3 -- a runaway solve() (an accidental
// infinite loop, or code that's just much slower than the user
// expected) could freeze the whole tab. Same fix as the Lab's, reusing
// the same shared window.callWorker helper and the same
// js-lab-worker.js script (its {id:'measure', source, cases} message
// protocol already does exactly what runJavaScript(source, cases) did
// -- compile once, run the cases, return results -- there was no need
// for a second, near-identical worker file).
//
// Persists across separate Run clicks for the whole page session
// (unlike the Lab's jsLabWorkerState, which is deliberately scoped to
// one analyze() call and cleaned up in open()'s own finally) -- each
// Run click is an independent, separate user action, not part of one
// multi-rep session the way the Lab's repeated measurements are, so
// there's no natural "end of session" moment to tear this down at;
// reusing one worker across many Run clicks avoids paying repeated
// spawn overhead for what's otherwise a very frequent action.
const jsRunWorkerState = { worker: null };
const JS_RUN_TIMEOUT_MS = 20000;
async function runJsViaWorker(source, cases) {
  try {
    const res = await window.callWorker(
      jsRunWorkerState, "js-lab-worker.js", { id: "measure", source, cases },
      JS_RUN_TIMEOUT_MS, "Your code took too long to finish (over 20s) -- likely an infinite loop or a much slower algorithm than expected on these inputs.");
    if (res.id === "error") return { error: res.error };
    return { results: res.results, nsPerCase: res.nsPerCase };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}
function setRuntimeButtonsEnabled(enabled) {
  const runBtn = document.getElementById("run-btn");
  const labBtn = document.getElementById("lab-btn");
  if (runBtn) runBtn.disabled = !enabled;
  if (labBtn) labBtn.disabled = !enabled;
}
async function withRuntimeLock(target, fn, renderMsg) {
  const setMsg = renderMsg || ((el, html) => { el.innerHTML = `<div class="summary bad">${html}</div>`; });
  if (state.runtimeBusy) {
    if (target) setMsg(target, "A run is already in progress &mdash; please wait for it to finish before starting another.");
    return;
  }
  state.runtimeBusy = true;
  setRuntimeButtonsEnabled(false);
  let timer;
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("GLIFEX_RUNTIME_TIMEOUT")), RUNTIME_TIMEOUT_MS); }),
    ]);
  } catch (e) {
    if (e && e.message === "GLIFEX_RUNTIME_TIMEOUT") {
      if (target) setMsg(target, `This runtime hasn't responded in ${Math.round(RUNTIME_TIMEOUT_MS / 1000)}s and may be stuck. Other languages should still work normally; if they don't either, refresh the page.`);
    } else {
      throw e;
    }
  } finally {
    clearTimeout(timer);
    state.runtimeBusy = false;
    setRuntimeButtonsEnabled(true);
  }
}

function renderProblemList() {
  const ul = $("#problem-list");
  ul.innerHTML = "";
  for (const p of state.corpus.problems) {
    const li = document.createElement("li");
    const mine = window.GlifexStorage ? Object.entries(GlifexStorage.load().entries).filter(([k]) => k.split(":")[1] === p.id).map(([, v]) => v) : [];
    const solved = mine.some((v) => v.solved);
    const attempted = mine.some((v) => (v.attempts || 0) > 0);
    const mark = solved ? '<span class="solved-mark">✓</span>' : attempted ? '<span class="failed-mark">✗</span>' : "";
    li.innerHTML = `${mark}<span class="track">${p.track === "database" ? "db" : p.track === "frontend" ? "fe" : "algo"}</span>${p.title}${p.difficulty ? `<span class="diff diff-${p.difficulty}">${p.difficulty}</span>` : ""}`;
    li.onclick = () => selectProblem(p.id);
    if (state.current && state.current.id === p.id) li.classList.add("active");
    li.dataset.id = p.id;
    ul.appendChild(li);
  }
}

function languagesFor(p) {
  if (p.track === "database") return ["sql"];
  if (p.track === "frontend") return ["html/css"];
  return Object.keys(p.languages);
}

function selectProblem(id) {
  const p = state.corpus.problems.find((x) => x.id === id);
  state.current = p;
  const langs = languagesFor(p);
  if (!langs.includes(state.lang)) state.lang = langs.includes("javascript") ? "javascript" : langs[0];

  $("#problem-title").textContent = p.title;
  $("#problem-meta").innerHTML = (p.difficulty ? `<span class="diff diff-${p.difficulty}">${p.difficulty}</span>` : "")
    + (p.tags || []).map((t) => `<span class="tag">${t}</span>`).join("");
  $("#statement").innerHTML = renderMarkdown(p.statement.replace(/^#.*\n/, ""));
  const sel = $("#lang-select");
  const dn = (state.corpus && state.corpus.displayNames) || {};
  sel.innerHTML = langs.map((l) => `<option value="${l}">${dn[l] || l}</option>`).join("");
  sel.value = state.lang;
  loadEditor();
  $("#preview-wrap").hidden = p.track !== "frontend";
  if (p.track === "frontend") updatePreview();
  clearResults();
  document.querySelectorAll("#problem-list li").forEach((li) => li.classList.toggle("active", li.dataset.id === id));
  if (location.hash.slice(1) !== id) location.hash = id;   // U0-4 permalink (same value = no-op)
}

function currentSource(variant = "practice") {
  const p = state.current;
  if (p.track === "database") {
    return variant === "practice" ? p.practice : p.solutions[variant];
  }
  if (p.track === "frontend") {
    return variant === "practice" ? p.starter : (p.solutions[variant] || p.solutions.clean);
  }
  return (p.languages[state.lang] || {})[variant];
}

function modeFor() {
  const p = state.current;
  if (p.track === "database") return "text/x-sql";
  if (p.track === "frontend") return "htmlmixed";
  return { javascript: "javascript", typescript: "javascript", python: "python",
           ruby: "ruby", go: "go", java: "text/x-java", csharp: "text/x-csharp",
           php: "text/x-php",
         }[state.lang] || "javascript";
}

function loadEditor() {
  // Persistence: a saved draft beats the starter; the starter is always
  // one click away via the restore chip.
  const starter = currentSource("practice") || `// no ${state.lang} source for this problem`;
  let src = starter, restored = false;
  if (window.GlifexStorage) {
    const key = GlifexStorage.entryKey(state.current.track, state.current.id,
      state.current.track === "database" ? "sql" : state.current.track === "frontend" ? "html" : state.lang);
    const entry = GlifexStorage.load().entries[key];
    if (entry && entry.code != null && entry.code !== starter) { src = entry.code; restored = true; }
  }
  if (window.GlifexEditor) { GlifexEditor.setValue(src); GlifexEditor.setMode(modeFor()); }
  else document.getElementById("editor").value = src;
  $("#editor-label").innerHTML = restored
    ? `draft restored · <a href="#" id="reset-starter">reset to starter</a>`
    : "practice";
  const rs = document.getElementById("reset-starter");
  if (rs) rs.onclick = (e) => {
    e.preventDefault();
    if (window.GlifexEditor) GlifexEditor.setValue(starter); else document.getElementById("editor").value = starter;
    saveDraft(starter);
    $("#editor-label").textContent = "practice";
  };
  syncReference();
}

function syncReference() {
  // The reference panel must always show the CURRENT problem+language.
  // Open panel + context change -> re-render in place. If the new context
  // has no reference for this variant, showReference says so honestly.
  const panel = $("#reference-panel");
  if (!panel.hidden) showReference(state.refVariant || "optimized");
}

// C-specific: clean.c/optimized.c carry a leading `#define solve
// __glifex_ref_<variant>` line that renames their own symbol at compile
// time. Baked into the FILE itself (not applied as a separate
// pre-processing step) because both compile paths need it: the CLI's
// test_cmd is a plain `gcc ... *.c` glob with no pre-processing stage,
// and the browser's c-worker.js writes this same file content directly
// too -- there's no single shared place to inject the rename at
// runtime for both.
//
// Every caller that uses L.clean/L.optimized as literal SOURCE TEXT
// (not just as the file c-worker.js writes to /c/clean.c or
// /c/optimized.c, where the rename is supposed to stay) needs this
// stripped first -- not just the reference panel's display. Missing
// that once already caused a real bug: compareOptimized() below reads
// the same raw L.optimized and passes it as the PRACTICE slot's source
// to test the reference solution's own performance -- with the rename
// directive still attached, that source and c-worker.js's own
// /c/optimized.c write would BOTH rename their "solve" to the same
// target, reintroducing a fresh collision instead of the one this was
// meant to fix. One shared function so future call sites don't have to
// remember this on their own.
function stripCRename(src) {
  return String(src || "").replace(/^#define solve __glifex_ref_\w+\n/, "");
}

function showReference(variant) {
  state.refVariant = variant;
  let src = currentSource(variant) || "(no reference for this variant)";
  // Display-only: the user should see clean, readable "solve"-named
  // code, and critically, copying that displayed text must NOT also
  // copy the rename directive -- if it did, pasting the copied code
  // into practice.c would rename the user's OWN "solve" function too,
  // reintroducing exactly the bug this whole change fixes.
  if (state.lang === "c") src = stripCRename(src);
  // C++'s equivalent problem: loadCpp() (runtimes.js) always dispatches
  // variant "practice" to the compiled binary regardless of editor
  // content, looking for a function literally named "practice" -- C
  // has no such issue (its variants share the bare "solve" name, only
  // renamed via #define, which stripCRename() above already strips).
  // Without this, copying a revealed clean/optimized/brute-force
  // solution into practice's editor -- the natural way to check a
  // reference actually works -- fails to compile/link, with nothing
  // wrong with the algorithm itself.
  if (state.lang === "cpp" && variant && variant !== "practice") {
    const fnName = variant === "brute-force" ? "bruteforce" : variant;
    src = src.replace(new RegExp(`\\bValue\\s+${fnName}\\s*\\(`), "Value practice(");
  }
  $("#reference-code").value = src;
  $("#ref-brute-force").classList.toggle("active", variant === "brute-force");
  $("#ref-clean").classList.toggle("active", variant === "clean");
  $("#ref-optimized").classList.toggle("active", variant === "optimized");
}

function saveDraft(code) {
  if (!window.GlifexStorage || !state.current) return;
  const p = state.current;
  const lang = p.track === "database" ? "sql" : p.track === "frontend" ? "html" : state.lang;
  const store = GlifexStorage.load();
  GlifexStorage.putEntry(store, GlifexStorage.entryKey(p.track, p.id, lang),
    { code }, new Date().toISOString());
  GlifexStorage.persist(store);
}

function fmtNs(ns) {
  if (ns >= 1e6) return (ns / 1e6).toFixed(1) + " ms";
  if (ns >= 1e3) return (ns / 1e3).toFixed(1) + " µs";
  return Math.round(ns) + " ns";
}

function escHtml(s) {
  // Escape before interpolating error/exception text or user-controlled result
  // data into innerHTML -- prevents "exception text reinterpreted as HTML"
  // (CodeQL) and any stored-markup injection through case/row/assertion output.
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderResults(out, res, opts = {}) {
  if (out.error) { res.innerHTML = `<div class="summary bad">${escHtml(out.error)}</div>`; recordOutcome(false); return; }
  const passed = out.results.filter((r) => r.ok).length;
  const allPass = passed === out.results.length;
  let html = out.results.map((r) =>
    `<div class="case ${r.ok ? "pass" : "fail"}">[${r.ok ? "PASS" : "FAIL"}] case ${r.i}` +
    (r.ok ? "" : `  expected=${escHtml(JSON.stringify(r.expected))} ${r.error ? "error=" + escHtml(r.error) : "got=" + escHtml(JSON.stringify(r.got))}`) +
    `</div>`).join("") +
    `<div class="summary ${allPass ? "ok" : "bad"}">${passed}/${out.results.length} passed</div>`;
  if (allPass && out.nsPerCase) {
    if (out.cycles && out.clockHz) {
      const mhz = (out.clockHz / 1e6).toFixed(3);
      html += `<div class="timing">${out.cycles.toLocaleString()} cycles/case ≈ ${fmtNs(out.nsPerCase)} @ ${mhz} MHz <span class="dim">(deterministic — true per-instruction cycle counts at the reference clock)</span>` +
        `<br>code ${out.codeBytes} B · workspace ${out.spaceBytes} B` +
        (opts.compared ? ` · reference optimized: ~${fmtNs(opts.compared)}/case` :
         ` · <a href="#" id="compare-btn">compare vs optimized</a>`) + `</div>`;
    } else {
      html += `<div class="timing">~${fmtNs(out.nsPerCase)}/case <span class="dim">(coarse — this device, this runtime; cross-language comparison is not meaningful)</span>` +
        (opts.compared ? ` · reference optimized: ~${fmtNs(opts.compared)}/case` :
         ` <a href="#" id="compare-btn">compare vs optimized</a>`) + `</div>`;
    }
  }
  res.innerHTML = html;
  const cb = document.getElementById("compare-btn");
  if (cb) cb.onclick = (e) => { e.preventDefault(); compareOptimized(out, res); };
  recordOutcome(allPass, allPass ? out.nsPerCase : null);
}

async function compareOptimized(userOut, res) {
  const p = state.current;
  let src = (p.languages[state.lang] || {}).optimized;
  if (!src) return;
  // Same C-specific strip as showReference() (see stripCRename's own
  // comment) -- src here becomes the PRACTICE slot's source text, not
  // just display text, so leaving the rename directive attached would
  // rename ITS "solve" to the same target c-worker.js's own
  // /c/optimized.c write already uses, colliding with itself.
  if (state.lang === "c") src = stripCRename(src);
  let refOut;
  if (state.lang === "javascript") refOut = GlifexJsRuntime.runJavaScript(src, p.cases);
  else {
    const runner = await window.Runtimes.get(state.lang);
    if (!runner || runner === "native") return;
    refOut = await runner.run(src, p.cases, p.languages[state.lang]);
  }
  renderResults(userOut, res, { compared: refOut.nsPerCase });
}

function recordOutcome(passed, nsPerCase = null) {
  const p = state.current;
  if (!p || !window.GlifexStorage) return;
  const lang = p.track === "database" ? "sql" : p.track === "frontend" ? "html" : state.lang;
  const store = GlifexStorage.load();
  GlifexStorage.recordResult(store, GlifexStorage.entryKey(p.track, p.id, lang), passed, nsPerCase, new Date().toISOString());
  GlifexStorage.persist(store);
  renderProblemList();   // refresh solved ✓ marks
}

function updatePreview() {
  $("#preview").srcdoc = (window.GlifexEditor ? GlifexEditor.getValue() : document.getElementById("editor").value);
}

function runFrontend(p, res) {
  showRunning(res, "Rendering…");
  updatePreview();
  const frame = $("#preview");
  frame.onload = () => {
    const doc = frame.contentDocument, win = frame.contentWindow;
    const results = window.evaluateAssertions(doc, win, p.assertions);
    const passed = results.filter((r) => r.ok).length;
    res.innerHTML = results.map((r) =>
      `<div class="case ${r.ok ? "pass" : "fail"}">[${r.ok ? "PASS" : "FAIL"}] ${escHtml(r.label)}` +
      (r.ok ? "" : `  — ${escHtml(r.detail)}`) + `</div>`).join("") +
      `<div class="summary ${passed === results.length ? "ok" : "bad"}">${passed}/${results.length} assertions passed</div>`;
    recordOutcome(passed === results.length);
  };
}

async function run() {
  await withRuntimeLock($("#results"), () => runInner());
}

async function runInner() {
  const p = state.current;
  const res = $("#results");
  if (p.track === "frontend") { runFrontend(p, res); return; }

  // ── database track: PGlite (Postgres-in-WASM) if vendored ──────────
  if (p.track === "database") {
    showRunning(res, "Starting in-browser Postgres…");
    const db = await window.Runtimes.get("postgres");
    if (!db) {
      const err = window.Runtimes.error("postgres");
      if (err) {
        res.innerHTML = `<div class="summary bad">In-browser Postgres failed to start: ${escHtml(err)} — details in the console (F12).</div>`;
        return;
      }
      res.innerHTML = `<div class="needs-runtime">The in-browser Postgres (PGlite) isn't vendored yet:
        run <code>node web/fetch-runtimes.mjs</code> once. Offline without it, use the CLI:
        <code>glifex db test ${p.id}</code>.</div>`;
      return;
    }
    showRunning(res, "Running query…");
    try {
      const rows = await db.query(p.schema, p.seed, (window.GlifexEditor ? GlifexEditor.getValue() : document.getElementById("editor").value));
      const exp = p.expected.rows;
      const norm = (xs) => p.expected.ordered ? JSON.stringify(xs) : JSON.stringify(xs.map(String).sort());
      const ok = norm(rows) === norm(exp);
      res.innerHTML = `<div class="case ${ok ? "pass" : "fail"}">[${ok ? "PASS" : "FAIL"}] ${rows.length} rows (ordered=${!!p.expected.ordered})` +
        (ok ? "" : `<br>expected=${escHtml(JSON.stringify(exp))}<br>got=${escHtml(JSON.stringify(rows))}`) + `</div>` +
        `<div class="summary ${ok ? "ok" : "bad"}">${ok ? "PASS" : "FAIL"}</div>`;
      recordOutcome(ok);
    } catch (e) {
      res.innerHTML = `<div class="summary bad">query error: ${escHtml(e.message)}</div>`;
      recordOutcome(false);
    }
    return;
  }

  // ── algorithm track ─────────────────────────────────────────────────
  if (state.lang === "javascript") {
    showRunning(res, "Running JavaScript…");
    renderResults(await runJsViaWorker((window.GlifexEditor ? GlifexEditor.getValue() : document.getElementById("editor").value), p.cases), res);
    return;
  }
  // The C toolchain (Wasmer/WASIX) needs SharedArrayBuffer, which requires the
  // page to be cross-origin isolated. The SW (PR-1) stamps the headers, but the
  // current document may predate SW control -- reload once to pick them up.
  if (state.lang === "c" && !self.crossOriginIsolated) {
    if (!sessionStorage.getItem("coiReloaded")) {
      sessionStorage.setItem("coiReloaded", "1");
      showRunning(res, "Enabling the C toolchain (one-time reload)…");
      location.reload();
      return;
    }
    res.innerHTML = `<div class="summary bad">C needs cross-origin isolation (SharedArrayBuffer), which is not active. Try reloading the page.</div>`;
    return;
  }
  showRunning(res, state.lang === "c" ? "Downloading the C toolchain (~100MB, one-time)…" : state.lang === "cpp" ? "Compiling C++ (first run fetches the toolchain)…" : `Preparing ${state.lang} runtime…`);
  const runner = await window.Runtimes.get(state.lang);
  if (!runner || runner === "native") {
    const err = window.Runtimes.error(state.lang);
    if (err) {
      res.innerHTML = `<div class="summary bad">The ${escHtml(state.lang)} runtime failed to start: ${escHtml(err)} — details in the console (F12).</div>`;
      return;
    }
    res.innerHTML = `<div class="needs-runtime">The <b>${state.lang}</b> runtime isn't vendored.
      JavaScript runs with zero setup. Python, TypeScript, and Ruby run in-browser once the
      site operator vendors their runtimes (<code>node web/fetch-runtimes.mjs</code>).
      All other languages — Go, Java, C#, C, C++, Rust, PHP, Dart, Zig, and the assembly
      family — are CLI-only: <code>glifex test ${p.id} ${state.lang}</code>.</div>`;
    return;
  }
  showRunning(res, `Running ${state.lang}…`);
  try {
    renderResults(await runner.run((window.GlifexEditor ? GlifexEditor.getValue() : document.getElementById("editor").value), p.cases, p.languages[state.lang]), res);
  } catch (e) {
    res.innerHTML = `<div class="summary bad">runtime error: ${escHtml(e.message)}</div>`;
    recordOutcome(false);
  }
}

// ── docs view (rendered from the generated corpus + a short guide) ────
function renderDocs() {
  $("#docs-body").innerHTML = `
    <h1>Glifex playground</h1>
    <p>This is the same problem corpus the command-line tool uses, baked into a static
    file. It runs <b>fully offline</b>: served from glifex.dev, opened from disk, or via
    <code>python -m http.server</code> — identical behaviour, because nothing is fetched
    at run time.</p>
    <h2>What runs where</h2>
    <p><b>JavaScript, TypeScript, Python, and Ruby</b> run right here in your
    browser — desktop or mobile. First run downloads a runtime once; after
    that it works offline too. The <b>database track</b> runs on an in-browser
    PostgreSQL (PGlite). All other languages — Go, Java, C#, C, C++, Rust,
    PHP, Dart, Zig, Kotlin, Swift, and the assembly family — run via the CLI:
    <code>glifex test &lt;problem&gt; &lt;lang&gt;</code>.</p>
    <h2>The contract</h2>
    <pre><code>// implement this, in practice.js
module.exports = function solve(input) {
  // input matches test_cases.json's "input" shape
  return /* your answer */;
};</code></pre>
    <p>Full docs, the CLI, and the plugin system live in the repository README.</p>`;
}

// Reference panel: one-tap copy. The panel is a readonly TEXTAREA (a form
// element), so native select-all -- Ctrl/Cmd+A on desktop AND Android's
// long-press "Select all" -- is contained to the code by the browser itself.
(function () {
  const ta = document.getElementById("reference-code");
  const btn = document.getElementById("ref-copy");
  if (btn) btn.onclick = async () => {
    const text = ta ? ta.value : "";
    try { await navigator.clipboard.writeText(text); }
    catch (e) { if (ta) { ta.focus(); ta.select(); } return; }  // fallback: select for manual copy
    const was = btn.textContent; btn.textContent = "copied!";
    setTimeout(() => { btn.textContent = was; }, 1200);
  };
})();
