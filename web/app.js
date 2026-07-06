// Glifex playground. Consumes problems.generated.json (baked from the same
// problems/ the CLI uses) so the browser can never drift from the CLI.

var state = { corpus: null, current: null, lang: "javascript", revealed: false };

// ── rendering ────────────────────────────────────────────────────────
function $(s) { return document.querySelector(s); }

function renderProblemList() {
  const ul = $("#problem-list");
  ul.innerHTML = "";
  for (const p of state.corpus.problems) {
    const li = document.createElement("li");
    const solved = window.GlifexStorage && Object.entries(GlifexStorage.load().entries)
      .some(([k, v]) => k.split(":")[1] === p.id && v.solved);
    li.innerHTML = `${solved ? '<span class="solved-mark">✓</span>' : ""}<span class="track">${p.track === "database" ? "db" : p.track === "frontend" ? "fe" : "algo"}</span>${p.title}`;
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
  $("#statement").innerHTML = renderMarkdown(p.statement.replace(/^#.*\n/, ""));
  const sel = $("#lang-select");
  sel.innerHTML = langs.map((l) => `<option value="${l}">${l}</option>`).join("");
  sel.value = state.lang;
  loadEditor();
  $("#preview-wrap").hidden = p.track !== "frontend";
  if (p.track === "frontend") updatePreview();
  $("#results").innerHTML = `<div class="hint">Write your solution and press Run.</div>`;
  document.querySelectorAll("#problem-list li").forEach((li) => li.classList.toggle("active", li.dataset.id === id));
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

function showReference(variant) {
  state.refVariant = variant;
  const src = currentSource(variant) || "(no reference for this variant)";
  $("#reference-code").textContent = src;
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

function renderResults(out, res, opts = {}) {
  if (out.error) { res.innerHTML = `<div class="summary bad">${out.error}</div>`; recordOutcome(false); return; }
  const passed = out.results.filter((r) => r.ok).length;
  const allPass = passed === out.results.length;
  let html = out.results.map((r) =>
    `<div class="case ${r.ok ? "pass" : "fail"}">[${r.ok ? "PASS" : "FAIL"}] case ${r.i}` +
    (r.ok ? "" : `  expected=${JSON.stringify(r.expected)} ${r.error ? "error=" + r.error : "got=" + JSON.stringify(r.got)}`) +
    `</div>`).join("") +
    `<div class="summary ${allPass ? "ok" : "bad"}">${passed}/${out.results.length} passed</div>`;
  if (allPass && out.nsPerCase) {
    html += `<div class="timing">~${fmtNs(out.nsPerCase)}/case <span class="dim">(coarse — this device, this runtime; cross-language comparison is not meaningful)</span>` +
      (opts.compared ? ` · reference optimized: ~${fmtNs(opts.compared)}/case` :
       ` <a href="#" id="compare-btn">compare vs optimized</a>`) + `</div>`;
  }
  res.innerHTML = html;
  const cb = document.getElementById("compare-btn");
  if (cb) cb.onclick = (e) => { e.preventDefault(); compareOptimized(out, res); };
  recordOutcome(allPass, allPass ? out.nsPerCase : null);
}

async function compareOptimized(userOut, res) {
  const p = state.current;
  const src = (p.languages[state.lang] || {}).optimized;
  if (!src) return;
  let refOut;
  if (state.lang === "javascript") refOut = GlifexJsRuntime.runJavaScript(src, p.cases);
  else {
    const runner = await window.Runtimes.get(state.lang);
    if (!runner || runner === "native") return;
    refOut = await runner.run(src, p.cases);
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
  updatePreview();
  const frame = $("#preview");
  frame.onload = () => {
    const doc = frame.contentDocument, win = frame.contentWindow;
    const results = window.evaluateAssertions(doc, win, p.assertions);
    const passed = results.filter((r) => r.ok).length;
    res.innerHTML = results.map((r) =>
      `<div class="case ${r.ok ? "pass" : "fail"}">[${r.ok ? "PASS" : "FAIL"}] ${r.label}` +
      (r.ok ? "" : `  — ${r.detail}`) + `</div>`).join("") +
      `<div class="summary ${passed === results.length ? "ok" : "bad"}">${passed}/${results.length} assertions passed</div>`;
  };
}

async function run() {
  const p = state.current;
  const res = $("#results");
  if (p.track === "frontend") { runFrontend(p, res); return; }

  // ── database track: PGlite (Postgres-in-WASM) if vendored ──────────
  if (p.track === "database") {
    const db = await window.Runtimes.get("postgres");
    if (!db) {
      const err = window.Runtimes.error("postgres");
      if (err) {
        res.innerHTML = `<div class="summary bad">In-browser Postgres failed to start: ${err} — details in the console (F12).</div>`;
        return;
      }
      res.innerHTML = `<div class="needs-runtime">The in-browser Postgres (PGlite) isn't vendored yet:
        run <code>node web/fetch-runtimes.mjs</code> once. Offline without it, use the CLI:
        <code>glifex db test ${p.id}</code>.</div>`;
      return;
    }
    res.innerHTML = `<div class="hint">Running on in-browser Postgres…</div>`;
    try {
      const rows = await db.query(p.schema, p.seed, (window.GlifexEditor ? GlifexEditor.getValue() : document.getElementById("editor").value));
      const exp = p.expected.rows;
      const norm = (xs) => p.expected.ordered ? JSON.stringify(xs) : JSON.stringify(xs.map(String).sort());
      const ok = norm(rows) === norm(exp);
      res.innerHTML = `<div class="case ${ok ? "pass" : "fail"}">[${ok ? "PASS" : "FAIL"}] ${rows.length} rows (ordered=${!!p.expected.ordered})` +
        (ok ? "" : `<br>expected=${JSON.stringify(exp)}<br>got=${JSON.stringify(rows)}`) + `</div>` +
        `<div class="summary ${ok ? "ok" : "bad"}">${ok ? "PASS" : "FAIL"}</div>`;
    } catch (e) {
      res.innerHTML = `<div class="summary bad">query error: ${e.message}</div>`;
    }
    return;
  }

  // ── algorithm track ─────────────────────────────────────────────────
  if (state.lang === "javascript") {
    renderResults(GlifexJsRuntime.runJavaScript((window.GlifexEditor ? GlifexEditor.getValue() : document.getElementById("editor").value), p.cases), res);
    return;
  }
  const runner = await window.Runtimes.get(state.lang);
  if (!runner || runner === "native") {
    const err = window.Runtimes.error(state.lang);
    if (err) {
      res.innerHTML = `<div class="summary bad">The ${state.lang} runtime failed to start: ${err} — details in the console (F12).</div>`;
      return;
    }
    res.innerHTML = `<div class="needs-runtime">The <b>${state.lang}</b> runtime isn't vendored.
      JavaScript runs with zero setup. Python, TypeScript, and Ruby run in-browser once the
      site operator vendors their runtimes (<code>node web/fetch-runtimes.mjs</code>).
      All other languages — Go, Java, C#, C, C++, Rust, PHP, Dart, Zig, and the assembly
      family — are CLI-only: <code>glifex test ${p.id} ${state.lang}</code>.</div>`;
    return;
  }
  res.innerHTML = `<div class="hint">Running on the ${state.lang} WASM runtime…</div>`;
  try {
    renderResults(await runner.run((window.GlifexEditor ? GlifexEditor.getValue() : document.getElementById("editor").value), p.cases), res);
  } catch (e) {
    res.innerHTML = `<div class="summary bad">runtime error: ${e.message}</div>`;
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
