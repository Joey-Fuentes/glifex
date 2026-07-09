// Complexity Lab (L1) -- browser face of the C3 empirical complexity
// falsifier. Drives the EXISTING runners (js-runtime.js, runtimes.js) with
// generated input families at growing sizes, gates every sample on
// correctness against the JavaScript clean oracle, then fits and judges
// growth per lab-engine.mjs and renders the case x bound verdict card.
//
// Case vs bound, done properly: worst/average/best case are different cost
// functions from different input families; O / Omega / Theta are bounds on
// any of them. The card tests the declared upper bound on the adversarial
// family, the declared lower bound on the easy family, and awards a Theta
// badge only when both ends pin the same class. Absolute speed never enters
// a verdict (Decision 6): everything is within-runtime growth ratios.
//
// UI contract: app.js calls GlifexLab.sync(state) on every problem/language
// switch (from clearResults); this module owns #lab-btn and the #lab panel.

const GlifexLab = (() => {
  let E = null, C = null;              // lab-engine.mjs / lab-config.mjs (lazy ESM)
  let ctx = null;                      // { p, lang } for the visible button
  let running = false;

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const MODE_COLORS = { worst: "#e3b341", random: "#6ea8fe", best: "#7ee787", value: "#6ea8fe" };
  const OMEGA = "&Omega;", THETA = "&Theta;";
  const asOmega = (cls) => cls.replace("O(", OMEGA + "(");

  function sync(state) {
    const btn = $("#lab-btn"), panel = $("#lab");
    if (!btn) return;
    const p = state && state.current;
    const ok = p && p.track === "algorithm"
      && p.languages && p.languages[state.lang] && p.languages.javascript
      && !!(p.languages.javascript.clean);
    btn.hidden = !ok;
    if (panel) { panel.hidden = true; panel.innerHTML = ""; }
    ctx = ok ? { p, lang: state.lang } : null;
  }

  async function open() {
    if (!ctx || running) return;
    const panel = $("#lab");
    panel.hidden = false;
    running = true;
    try {
      if (!E) { E = await import("./lab-engine.mjs"); C = await import("./lab-config.mjs"); }
      await analyze(ctx.p, ctx.lang, panel);
    } catch (e) {
      panel.innerHTML = card(`<div class="lab-verdict bad">Lab error: ${esc((e && e.message) || e)}</div>`);
    } finally { running = false; }
  }

  const progress = (panel, msg) =>
    (panel.innerHTML = card(`<div class="running"><span class="spinner" aria-hidden="true"></span>${esc(msg)}</div>`));
  const card = (inner) => `<div class="lab-card">
    <div class="lab-head"><h2>Complexity Lab</h2><span class="lab-sub">empirical falsifier &mdash; refutes claims, never proves them</span></div>
    ${inner}</div>`;

  async function analyze(p, lang, panel) {
    const cfg = C.PROBLEMS[p.id];
    if (!cfg) return void (panel.innerHTML = card('<div class="lab-verdict dim">This problem has no input-family generators yet (web/lab-config.mjs) &mdash; the Lab needs authored best/adversarial families to say anything honest.</div>'));
    const source = window.GlifexEditor ? GlifexEditor.getValue() : document.getElementById("editor").value;

    // Oracle: the JavaScript clean reference produces expected outputs for
    // generated inputs. Inputs are JSON-cloned before the oracle sees them
    // (a mutating solve must not corrupt the case fed to the user's code).
    let oracle;
    try {
      const m = { exports: {} };
      new Function("module", "exports", p.languages.javascript.clean)(m, m.exports);
      oracle = typeof m.exports === "function" ? m.exports : m.exports.solve;
      if (typeof oracle !== "function") throw new Error("no solve() in clean reference");
    } catch (e) { return void (panel.innerHTML = card(`<div class="lab-verdict bad">Oracle unavailable: ${esc(e.message)}</div>`)); }

    // Tier probe: retro cores report deterministic cycles; everything else
    // is wall time. One tiny run decides which ladder and tolerance apply.
    progress(panel, "Probing runtime tier\u2026");
    const runner = lang === "javascript" ? "js" : await window.Runtimes.get(lang);
    if (!runner) return void (panel.innerHTML = card(`<div class="lab-verdict bad">Runtime for ${esc(lang)} is not available${window.Runtimes.error(lang) ? ": " + esc(window.Runtimes.error(lang)) : ""}.</div>`));
    const runOnce = async (cases) => runner === "js"
      ? window.GlifexJsRuntime.runJavaScript(source, cases)
      : await runner.run(source, cases, p.languages[lang]);

    const probePlan = C.buildPlan(cfg, "wall", lang, "probe").plan.slice(0, 1);
    const probe = await runOnce(probePlan.map((c) => mkCase(c, oracle)));
    if (probe.error) return void (panel.innerHTML = card(`<div class="lab-verdict bad">${esc(probe.error)}</div>`));
    const tierId = probe.results && probe.results[0] && probe.results[0].cycles != null ? "det" : "wall";
    const tier = C.TIERS[tierId];
    const reps = (C.LANG_OVERRIDES[lang] && C.LANG_OVERRIDES[lang].reps) || tier.reps;

    // Build the (mode x size) plan once; run it `reps` times. One run() per
    // rep = one compile/assembly per rep, amortized across every mode+size.
    const seedBase = p.id + ":" + lang + ":L1";
    const { sizes, plan } = C.buildPlan(cfg, tierId, lang, seedBase);
    const cases = plan.map((c) => mkCase(c, oracle));
    // Wall tiers get one DISCARDED warm-up pass: a fresh script's first
    // execution carries JIT/compile cost that can land anywhere in the
    // ladder and bend the curve (deterministic cycle tiers don't need it;
    // compiled-language harnesses warm up inside their own repeat loop).
    const warm = tierId === "wall" && !(C.LANG_OVERRIDES[lang] && C.LANG_OVERRIDES[lang].reps === 1);
    if (warm) {
      progress(panel, "Warm-up pass (JIT settle; discarded)\u2026");
      const w = await runOnce(cases);
      if (w.error) return void (panel.innerHTML = card(`<div class="lab-verdict bad">${esc(w.error)}</div>`));
    }
    const repRows = [];
    let detMeta = null;
    for (let r = 0; r < reps; r++) {
      progress(panel, `Running ${plan.length} cases &mdash; ${cfg.modes.length} input famil${cfg.modes.length > 1 ? "ies" : "y"} \u00d7 ${sizes.length} sizes (pass ${r + 1}/${reps})\u2026`);
      const out = await runOnce(cases);
      if (out.error) return void (panel.innerHTML = card(`<div class="lab-verdict bad">${esc(out.error)}</div>`));
      if (out.clockHz) detMeta = { clockHz: out.clockHz };
      // Correctness gate: a wrong solution must never reach the fitter.
      for (let i = 0; i < plan.length; i++) {
        const row = out.results[i];
        let ok = row && row.ok;
        if (!ok && row && cfg.validate) ok = cfg.validate(plan[i].input, row.got);
        if (!ok) {
          return void (panel.innerHTML = card(`<div class="lab-verdict bad">&#10007; Cannot analyze: the solution is incorrect on a generated input (family &ldquo;${esc(plan[i].mode)}&rdquo;, n=${plan[i].n})${row && row.error ? " &mdash; " + esc(row.error) : ""}. Growth of a wrong answer means nothing &mdash; fix correctness first.</div>`));
        }
      }
      repRows.push(out.results);
    }

    // Aggregate: median across reps, per (mode, size).
    const modes = {}, spaceBy = {};
    let missing = 0;
    for (const mode of cfg.modes) modes[mode.id] = { ns: sizes.slice(), ys: [] };
    for (let i = 0; i < plan.length; i++) {
      const vals = repRows.map((rows) => (tierId === "det" ? rows[i].cycles : rows[i].tNs)).filter((v) => v != null && v > 0);
      if (!vals.length) { missing++; modes[plan[i].mode].ys.push(NaN); continue; }
      modes[plan[i].mode].ys.push(E.median(vals));
      if (tierId === "det" && repRows[0][i].space != null) spaceBy[plan[i].mode + ":" + plan[i].n] = repRows[0][i].space;
    }
    if (missing) {
      return void (panel.innerHTML = card(`<div class="lab-verdict warn">Inconclusive: ${missing} of ${plan.length} measurements came back below timing resolution for this runtime. No verdict is honest here &mdash; a larger ladder needs the L3 worker budget.</div>`));
    }

    const j = E.judge(modes, cfg.roles, cfg.declared, tier.tol);
    render(panel, { p, lang, cfg, tierId, tier, reps, sizes, modes, j, detMeta, seedBase, spaceBy });
  }

  const mkCase = (c, oracle) => ({ input: c.input, expected: oracle(JSON.parse(JSON.stringify(c.input))) });

  // ---- rendering ------------------------------------------------------
  function render(panel, X) {
    const { cfg, tierId, tier, j } = X;
    const unit = tierId === "det" ? "cycles" : "ns";
    const vline = (kind, html) => `<div class="lab-verdict ${kind}">${html}</div>`;

    const up = j.upper, lo = j.lower;
    let html = "";
    // Upper bound, tested on the adversarial family.
    html += up.verdict === "refuted"
      ? vline("bad", `&#10007; Upper bound ${up.declared} REFUTED &mdash; growth on the &ldquo;${esc(modeLabel(cfg, up.mode))}&rdquo; family exceeds it (closest: ${j.perMode[up.mode].closest}).`)
      : up.verdict === "consistent"
        ? vline("ok", `&#10003; Upper bound ${up.declared}: consistent on the &ldquo;${esc(modeLabel(cfg, up.mode))}&rdquo; family &mdash; this run failed to refute it.`)
        : vline("ok", `&#10003; Upper bound ${up.declared} holds on the &ldquo;${esc(modeLabel(cfg, up.mode))}&rdquo; family, but is not tight (growth tracks ${j.perMode[up.mode].closest}).`);
    // Lower bound, tested on the easy family.
    html += lo.trivial
      ? vline("ok", `&#10003; Lower bound ${asOmega(lo.declared)}: unrefutable &mdash; every algorithm is ${OMEGA}(1). Your easy-family growth tracks ${j.perMode[lo.mode].closest}${j.perMode[lo.mode].closest === "O(1)" ? " &mdash; the early exit is real" : " &mdash; the easy inputs are not being exploited"}.`)
      : lo.verdict === "refuted"
        ? vline("bad", `&#10007; Lower bound ${asOmega(lo.declared)} REFUTED &mdash; growth on the &ldquo;${esc(modeLabel(cfg, lo.mode))}&rdquo; family is below it (closest: ${j.perMode[lo.mode].closest}).`)
        : vline("ok", `&#10003; Lower bound ${asOmega(lo.declared)}: consistent on the &ldquo;${esc(modeLabel(cfg, lo.mode))}&rdquo; family.`);
    // Theta: both ends pin the same class.
    html += j.theta
      ? vline("theta", `${THETA} Growth is pinned between matching bounds: consistent with ${j.theta.cls.replace("O(", THETA + "(")} on these families.`)
      : vline("dim", `No ${THETA} badge: the two families&rsquo; growth does not pin a single class (upper tracks ${j.perMode[up.mode].closest}, lower ${j.perMode[lo.mode].closest}) &mdash; which is itself the point: case spread is real.`);
    if (cfg.note) html += `<p class="lab-note">${esc(cfg.note)}</p>`;

    html += chart(X, unit);
    html += table(X, unit);
    html += `<p class="lab-note">O / ${OMEGA} / ${THETA} are BOUNDS, not case names: worst, average, and best case are different cost functions from different input families, and each can carry any bound. The card tests the declared O on the adversarial family and the declared ${OMEGA} on the easy one; ${THETA} appears only when both ends pin the same class. Refutations are conclusive; &ldquo;consistent&rdquo; only means this run failed to refute &mdash; a curve can never prove a bound.</p>`;
    html += `<div class="lab-prov">${prov(X)}</div>`;
    panel.innerHTML = card(html);

    panel.querySelectorAll("[data-labmode]").forEach((b) => (b.onclick = () => {
      panel.querySelectorAll("[data-labmode]").forEach((x) => x.classList.toggle("active", x === b));
      panel.querySelector(".lab-tablewrap").innerHTML = tableFor(X, unit, b.dataset.labmode);
    }));
  }

  const modeLabel = (cfg, id) => (cfg.modes.find((m) => m.id === id) || { label: id }).label;

  function chart(X, unit) {
    const { cfg, modes, j } = X;
    const W = 640, H = 320, L = 64, R = 12, T = 14, B = 40;
    const lx = Math.log10;
    const allN = [], allY = [];
    for (const m of cfg.modes) { allN.push(...modes[m.id].ns); allY.push(...modes[m.id].ys); }
    const x0 = lx(Math.min(...allN)), x1 = lx(Math.max(...allN));
    const y0 = lx(Math.max(Math.min(...allY), 1e-9)) - 0.12, y1 = lx(Math.max(...allY)) + 0.12;
    const Xc = (n) => L + ((lx(n) - x0) / (x1 - x0 || 1)) * (W - L - R);
    const Yc = (v) => H - B - ((lx(Math.max(v, 1e-9)) - y0) / (y1 - y0 || 1)) * (H - T - B);
    const fmt = (v) => (v >= 1e6 ? (v / 1e6).toPrecision(3) + "M" : v >= 1000 ? (v / 1000).toPrecision(3) + "k" : v.toPrecision(3));
    let g = "";
    for (let d = Math.ceil(y0); d <= Math.floor(y1); d++) {
      const y = H - B - ((d - y0) / (y1 - y0 || 1)) * (H - T - B);
      g += `<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}" stroke="#2a3140"/><text x="${L - 7}" y="${y + 3}" text-anchor="end" fill="#8b949e" font-size="10">${fmt(10 ** d)}</text>`;
    }
    for (const n of modes[cfg.modes[0].id].ns)
      g += `<line x1="${Xc(n)}" y1="${T}" x2="${Xc(n)}" y2="${H - B}" stroke="#232b38"/><text x="${Xc(n)}" y="${H - B + 13}" text-anchor="middle" fill="#8b949e" font-size="10">${n}</text>`;
    // Declared-upper fit on the adversarial family, dashed, for the eye.
    const upM = modes[cfg.roles.upper];
    const fit = E.fitClass(E.classById(cfg.declared.upper).f, upM.ns, upM.ys);
    let d = "";
    for (let i = 0; i <= 48; i++) {
      const n = 10 ** (x0 + ((x1 - x0) * i) / 48), y = fit.predict(n);
      if (y > 0) d += (d ? "L" : "M") + Xc(n).toFixed(1) + " " + Yc(y).toFixed(1);
    }
    g += `<path d="${d}" fill="none" stroke="${j.upper.verdict === "refuted" ? "#ff7b72" : "#8b949e"}" stroke-width="1.6" stroke-dasharray="5 5"/>`;
    for (const m of cfg.modes) {
      const col = MODE_COLORS[m.id] || "#6ea8fe";
      const pts = modes[m.id].ns.map((n, i) => Xc(n).toFixed(1) + "," + Yc(modes[m.id].ys[i]).toFixed(1));
      g += `<polyline points="${pts.join(" ")}" fill="none" stroke="${col}" stroke-width="1.4" opacity=".75"/>`;
      for (let i = 0; i < pts.length; i++) g += `<circle cx="${pts[i].split(",")[0]}" cy="${pts[i].split(",")[1]}" r="3.6" fill="${col}" stroke="#0d1117" stroke-width="1.4"/>`;
    }
    g += `<text x="${(L + W - R) / 2}" y="${H - 5}" text-anchor="middle" fill="#8b949e" font-size="10">${esc(cfg.sizeLabel)} (log)</text>`;
    g += `<text x="13" y="${(T + H - B) / 2}" fill="#8b949e" font-size="10" transform="rotate(-90 13 ${(T + H - B) / 2})" text-anchor="middle">${unit} / case (log)</text>`;
    const legend = cfg.modes.map((m) => `<span class="lab-k" style="background:${MODE_COLORS[m.id] || "#6ea8fe"}"></span>${esc(m.label)}`).join(" ")
      + ` <span class="lab-k lab-k-dash"></span>declared ${cfg.declared.upper} fit (intercept absorbs fixed overhead)`;
    return `<figure class="lab-fig"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="growth chart" font-family="var(--mono)">${g}</svg><figcaption>${legend}</figcaption></figure>`;
  }

  function table(X, unit) {
    const tabs = X.cfg.modes.map((m, i) => `<button class="ghost sm${i === 0 ? " active" : ""}" data-labmode="${m.id}">${esc(m.id)}</button>`).join("");
    return `<h3 class="lab-sec">Step-ratio proof ${X.cfg.modes.length > 1 ? tabs : ""}</h3>
      <div class="lab-tablewrap">${tableFor(X, unit, X.cfg.modes[0].id)}</div>
      <p class="lab-note">Ratios cancel constant factors: the same table reads exact cycle counts and coarse wall time alike, on any device &mdash; absolute speed never enters the verdict. Greyed steps are excluded from scoring (fixed overhead dominates at small n).</p>`;
  }

  function tableFor(X, unit, modeId) {
    const cls = X.j.perMode[modeId], declared = modeId === X.cfg.roles.upper ? X.cfg.declared.upper : X.cfg.declared.lower;
    const names = E.CLASSES.map((c) => c.id);
    let h = `<table class="lab-table"><tr><th>step</th><th>measured &times;</th>${names.map((n) => `<th${n === declared ? ' class="declared"' : ""}>${n === declared ? "declared " : ""}${n} &times;</th>`).join("")}${X.tierId === "det" ? "<th>workspace B</th>" : ""}</tr>`;
    for (const r of cls.rows) {
      h += `<tr${r.scored ? "" : ' class="dropped"'}><td>${r.from} &rarr; ${r.to}</td><td>&times;${r.meas.toFixed(2)}</td>`;
      for (const n of names) {
        const close = Math.abs(Math.log(r.meas / r.pred[n])) <= X.tier.tol;
        h += `<td class="${n === declared ? "declared " : ""}${r.scored ? (close ? "hit" : n === declared ? "miss" : "") : ""}">&times;${r.pred[n].toFixed(2)}</td>`;
      }
      if (X.tierId === "det") h += `<td>${X.spaceBy[modeId + ":" + r.to] != null ? X.spaceBy[modeId + ":" + r.to] : "&mdash;"}</td>`;
      h += "</tr>";
    }
    return h + "</table>";
  }

  function prov(X) {
    const det = X.tierId === "det";
    const clock = det && X.detMeta ? ` &middot; ${(X.detMeta.clockHz / 1e6).toFixed(3)} MHz reference` : "";
    return `${det ? "deterministic cycle counts (1 rep is exact)" + clock
      : `wall time inside this runtime &mdash; median of ${X.reps} pass${X.reps > 1 ? "es" : ""}; absolute values are not comparable across languages or devices`}
      &middot; sizes ${X.sizes.join(", ")} &middot; inputs: seeded generators (base &ldquo;${esc(X.seedBase)}&rdquo;)
      &middot; oracle: javascript clean &middot; correctness-gated &middot; ${new Date().toISOString().slice(0, 10)}`;
  }

  function init() {
    const btn = $("#lab-btn");
    if (btn) btn.onclick = open;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { sync, open };
})();
if (typeof window !== "undefined") window.GlifexLab = GlifexLab;
