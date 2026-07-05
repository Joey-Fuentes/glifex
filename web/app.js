// Glifex playground. Consumes problems.generated.json (baked from the same
// problems/ the CLI uses) so the browser can never drift from the CLI.

const state = { corpus: null, current: null, lang: "javascript", revealed: false };

// ── JavaScript execution engine (native, offline, no WASM) ───────────
// Runs the user's `module.exports = function solve(c){...}` against the cases.
function runJavaScript(source, cases) {
  let solve;
  try {
    const module = { exports: {} };
    // eslint-disable-next-line no-new-func
    new Function("module", "exports", source)(module, module.exports);
    solve = typeof module.exports === "function" ? module.exports : module.exports.solve;
    if (typeof solve !== "function") throw new Error("no solve() exported");
  } catch (e) {
    return { error: `Compile error: ${e.message}` };
  }
  const results = [];
  for (let i = 0; i < cases.length; i++) {
    try {
      const got = solve(cases[i].input);
      const ok = JSON.stringify(got) === JSON.stringify(cases[i].expected);
      results.push({ i, ok, got, expected: cases[i].expected });
    } catch (e) {
      results.push({ i, ok: false, error: e.message, expected: cases[i].expected });
    }
  }
  return { results };
}

// ── rendering ────────────────────────────────────────────────────────
const $ = (s) => document.querySelector(s);

function renderProblemList() {
  const ul = $("#problem-list");
  ul.innerHTML = "";
  for (const p of state.corpus.problems) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="track">${p.track === "database" ? "db" : "algo"}</span>${p.title}`;
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
  state.revealed = false;
  const langs = languagesFor(p);
  if (!langs.includes(state.lang)) state.lang = langs.includes("javascript") ? "javascript" : langs[0];

  $("#problem-title").textContent = p.title;
  $("#statement").textContent = p.statement.replace(/^#.*\n/, "");
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

function loadEditor() {
  const src = currentSource(state.revealed ? "optimized" : "practice");
  $("#editor").value = src || `// no ${state.lang} source for this problem`;
  $("#editor-label").textContent = state.revealed ? "optimized (reference)" : "practice";
  $("#editor").readOnly = state.revealed;
}

function renderResults(out, res) {
  if (out.error) { res.innerHTML = `<div class="summary bad">${out.error}</div>`; return; }
  const passed = out.results.filter((r) => r.ok).length;
  res.innerHTML = out.results.map((r) =>
    `<div class="case ${r.ok ? "pass" : "fail"}">[${r.ok ? "PASS" : "FAIL"}] case ${r.i}` +
    (r.ok ? "" : `  expected=${JSON.stringify(r.expected)} ${r.error ? "error=" + r.error : "got=" + JSON.stringify(r.got)}`) +
    `</div>`).join("") +
    `<div class="summary ${passed === out.results.length ? "ok" : "bad"}">${passed}/${out.results.length} passed</div>`;
}

function updatePreview() {
  $("#preview").srcdoc = $("#editor").value;
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
      res.innerHTML = `<div class="needs-runtime">The in-browser Postgres (PGlite) isn't vendored yet:
        run <code>node web/fetch-runtimes.mjs</code> once. Offline without it, use the CLI:
        <code>glifex db test ${p.id}</code>.</div>`;
      return;
    }
    res.innerHTML = `<div class="hint">Running on in-browser Postgres…</div>`;
    try {
      const rows = await db.query(p.schema, p.seed, $("#editor").value);
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
    renderResults(runJavaScript($("#editor").value, p.cases), res);
    return;
  }
  const runner = await window.Runtimes.get(state.lang);
  if (!runner || runner === "native") {
    res.innerHTML = `<div class="needs-runtime">The <b>${state.lang}</b> runtime isn't vendored.
      JavaScript runs with zero setup. Python, TypeScript, and Ruby run in-browser once the
      site operator vendors their runtimes (<code>node web/fetch-runtimes.mjs</code>).
      All other languages — Go, Java, C#, C, C++, Rust, PHP, Dart, Zig, and the assembly
      family — are CLI-only: <code>glifex test ${p.id} ${state.lang}</code>.</div>`;
    return;
  }
  res.innerHTML = `<div class="hint">Running on the ${state.lang} WASM runtime…</div>`;
  try {
    renderResults(await runner.run($("#editor").value, p.cases), res);
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
    <p><b>JavaScript</b> executes natively in your browser — no download, works offline
    immediately. Other languages (Python, Ruby, TypeScript) need a one-time
    <code>node web/fetch-runtimes.mjs</code> that vendors their WASM runtimes into
    <code>web/vendor/</code>. Go, Java, and C# are CLI-only for now.</p>
    <p>The <b>database track</b> runs on a WASM Postgres (PGlite) once vendored; offline it
    is CLI-only via <code>glifex db test</code>.</p>
    <h2>The contract</h2>
    <pre><code>// implement this, in practice.js
module.exports = function solve(input) {
  // input matches test_cases.json's "input" shape
  return /* your answer */;
};</code></pre>
    <p>Full docs, the CLI, and the plugin system live in the repository README.</p>`;
}

// ── wiring ────────────────────────────────────────────────────────────
function switchView(v) {
  document.querySelectorAll(".view").forEach((s) => s.classList.remove("active"));
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  $(`#view-${v}`).classList.add("active");
}

async function boot() {
  if (location.protocol.startsWith("http") && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  document.querySelectorAll("nav button").forEach((b) => (b.onclick = () => switchView(b.dataset.view)));
  $("#lang-select").onchange = (e) => { state.lang = e.target.value; state.revealed = false; loadEditor(); };
  $("#reveal-btn").onclick = () => { state.revealed = !state.revealed; loadEditor(); };
  $("#run-btn").onclick = run;
  $("#editor").addEventListener("input", () => {
    if (state.current && state.current.track === "frontend") updatePreview();
  });

  try {
    state.corpus = await (await fetch("problems.generated.json", { cache: "force-cache" })).json();
  } catch {
    $("#problem-title").textContent = "Run `node web/build.mjs` first";
    return;
  }
  renderProblemList();
  renderDocs();
  // Honest versioning: the badge reports the version of THE PAGE YOU ARE
  // LOOKING AT (embedded in this document at deploy time) — never the
  // server's. A newer server version renders as an explicit update prompt.
  const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.content || "dev";
  const running = { version: meta("glifex-version"), commit: meta("glifex-commit") };
  $("#offline-badge").textContent = `● offline-ready · v${running.version} (${running.commit})`;
  fetch("version.json", { cache: "no-store" })
    .then((r) => r.json())
    .then((v) => {
      if (v.version !== running.version && running.version !== "dev") {
        const a = document.createElement("a");
        a.href = "#"; a.className = "update-available";
        a.textContent = ` ⟳ v${v.version} available — refresh`;
        a.onclick = (e) => { e.preventDefault(); location.reload(); };
        $("#offline-badge").appendChild(a);
      }
    })
    .catch(() => {});   // offline / file:// — badge already shows the truth
  if (state.corpus.problems.length) selectProblem(state.corpus.problems[0].id);
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", boot);

// export the pure engine for Node-side testing
if (typeof module !== "undefined") module.exports = { runJavaScript };
