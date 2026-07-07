// UI wiring / bootstrap for the playground. Binds DOM events to the app
// functions defined in app.js (all top-level globals) and boots on load.
// Loaded AFTER app.js. Shares `state` and `$` as window globals.

var saveTimer = null;

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
  $("#lang-select").onchange = (e) => { state.lang = e.target.value; loadEditor(); syncReference(); clearResults(); };
  function setRevealVisible(show) {
    // Single writer for the panel: visibility, button label, and content
    // move together — the label IS the state, so they can't disagree.
    const panel = $("#reference-panel");
    panel.hidden = !show;
    $("#reveal-btn").textContent = show ? "Hide" : "Reveal";
    if (show) showReference(state.refVariant || "optimized");
  }
  $("#reveal-btn").onclick = () => setRevealVisible($("#reference-panel").hidden);
  $("#ref-clean").onclick = () => showReference("clean");
  $("#ref-optimized").onclick = () => showReference("optimized");
  $("#run-btn").onclick = run;
  $("#export-btn").onclick = () => {
    const text = GlifexStorage.exportBlobText(GlifexStorage.load(), new Date().toISOString());
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = `glifex-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  $("#import-btn").onclick = () => $("#import-file").click();
  $("#import-file").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const imported = GlifexStorage.normalize(JSON.parse(await f.text()));
      const merged = GlifexStorage.mergeStores(GlifexStorage.load(), imported);
      GlifexStorage.persist(merged);
      renderProblemList();
      if (state.current) loadEditor();
      alert(`Imported ${Object.keys(imported.entries).length} entries (merged, newest wins; solved status never lost).`);
    } catch { alert("That file isn't a Glifex progress export."); }
    e.target.value = "";
  };
  $("#editor").addEventListener("input", () => {
    if (state.current && state.current.track === "frontend") updatePreview();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveDraft(window.GlifexEditor ? GlifexEditor.getValue() : (window.GlifexEditor ? GlifexEditor.getValue() : document.getElementById("editor").value)), 500);
  });

  // U0-4: direct links + back/forward select the problem (guarded against loops).
  window.addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    if (id && state.current && id !== state.current.id && state.corpus.problems.some((p) => p.id === id)) selectProblem(id);
  });

  // U0-5: dismissible first-visit hero.
  const heroSeen = (() => { try { return localStorage.getItem("glifex-hero-dismissed") === "1"; } catch { return false; } })();
  const hero = $("#hero");
  if (hero && !heroSeen) hero.hidden = false;
  $("#hero-dismiss")?.addEventListener("click", () => { if (hero) hero.hidden = true; try { localStorage.setItem("glifex-hero-dismissed", "1"); } catch {} });

  try {
    state.corpus = await (await fetch("problems.generated.json", { cache: "no-cache" })).json();
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
  const wanted = location.hash.slice(1);
  const has = (pid) => state.corpus.problems.some((p) => p.id === pid);
  if (wanted && has(wanted)) selectProblem(wanted);
  else if (state.corpus.problems.length) selectProblem(state.corpus.problems[0].id);
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", boot);
