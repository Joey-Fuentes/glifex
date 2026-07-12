// Complexity Lab (L1) -- browser face of the C3 empirical complexity
// falsifier. Drives the EXISTING runners (js-runtime.js, runtimes.js) with
// generated input families at growing sizes, gates every sample on
// correctness against the JavaScript clean oracle, then fits and judges
// growth per lab-engine.mjs (shared-overhead-corrected classifier) and
// renders the case x bound verdict card.
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
  // This script's OWN version suffix, read from its <script src="lab.js?v=SHA">
  // tag (stamped at deploy time -- see web/stamp.mjs). document.currentScript
  // is only reliable during this synchronous, top-level IIFE execution -- it
  // must be captured HERE, not later inside open()/analyze(), which run on
  // user interaction long after this script has finished its initial pass.
  //
  // Needed because the dynamic imports below (E = await import(...)) request
  // a hardcoded, unversioned path -- unlike every <script src="..."> tag,
  // which gets a fresh ?v=<sha> on every deploy (forcing a cache miss and a
  // guaranteed-fresh fetch), a plain import("./lab-engine.mjs") requests the
  // EXACT SAME URL on every deploy, so the service worker's stale-while-
  // revalidate strategy can keep serving a cached, pre-deploy lab-engine.mjs
  // indefinitely even after lab.js itself (correctly versioned) has updated.
  // Confirmed as a real, live-site bug: E.matchKnownVariants (added in the
  // per-variant-bounds deploy) was undefined for visitors whose browser had
  // lab-engine.mjs cached from before that deploy -- but only on the
  // no-reveal code path that actually calls it; E.judge (present in both the
  // old and new lab-engine.mjs) kept working fine on the revealed path,
  // which is exactly why it looked like a mode-specific bug rather than a
  // stale-file one. Appending the SAME suffix to these imports makes them
  // request a freshly-versioned URL on every deploy too, same as any other
  // script.
  const VERSION_SUFFIX = (() => {
    const src = document.currentScript && document.currentScript.src;
    if (!src) return "";
    const q = src.indexOf("?");
    return q === -1 ? "" : src.slice(q);
  })();

  let E = null, C = null;              // lab-engine.mjs / lab-config.mjs (lazy ESM)
  let ctx = null;                      // { p, lang } for the visible button
  // L3 (docs/ROADMAP.md): the JS runtime used to execute directly on the
  // main thread here, same as every language except C/C++ -- a runaway
  // solve() (infinite loop, or just much slower than intended at a large
  // tested n) would freeze the whole tab, since the Lab's own measurement
  // loop WAS the main thread's only work at that moment. Spawned lazily by
  // runJsInWorker() (one per analyze() call, reused across every runOnce()
  // within it -- JS has no single-use-instance constraint the way Wasmer's
  // WASIX runtime does, confirmed the hard way this session for C, so
  // reuse across a session is fine here unlike c-worker.js's per-call
  // spawn). Always terminated in open()'s own finally below, NOT inside
  // analyze() itself -- analyze() has many early-return paths (correctness
  // failures, missing runtimes, inconclusive verdicts, and more), and
  // hanging cleanup off every one of them individually would be exactly
  // the kind of thing that's easy to miss on the next new early return
  // someone adds. One place, always runs.
  //
  // { worker: null } shape (not a bare variable) because window.
  // callWorker (runtimes.js) owns and mutates this object directly --
  // spawns into state.worker if empty, clears it back to null on a
  // failed/timed-out call so the next runOnce() spawns fresh rather than
  // reusing something possibly still wedged. Passing the SAME object
  // across every runOnce() in one analyze() session is what makes this
  // the persist-across-calls lifecycle; a language needing C's
  // fresh-per-call lifecycle instead would just pass a NEW { worker:
  // null } every time.
  const jsLabWorkerState = { worker: null };

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

  // Goes through the SAME shared lock (window.withRuntimeLock, defined in
  // app.js) the Run button uses -- both ultimately drive the same cached
  // runtime objects (window.Runtimes.get(lang)), and at least one of
  // those isn't safe to call while a previous invocation is still in
  // flight. See app.js's withRuntimeLock for the full reasoning; this
  // used to have its OWN independent "running" flag here, which only
  // guarded against overlapping with ITSELF -- it had no way to know
  // about the Run button's calls, or vice versa.
  async function open() {
    if (!ctx) return;
    const panel = $("#lab");
    panel.hidden = false;
    await withRuntimeLock(panel, async () => {
      try {
        if (!E) { E = await import("./lab-engine.mjs" + VERSION_SUFFIX); C = await import("./lab-config.mjs" + VERSION_SUFFIX); }
        await analyze(ctx.p, ctx.lang, panel);
      } catch (e) {
        panel.innerHTML = card(`<div class="lab-verdict bad">Lab error: ${esc((e && e.message) || e)}</div>`);
      } finally {
        if (jsLabWorkerState.worker) { jsLabWorkerState.worker.terminate(); jsLabWorkerState.worker = null; }
      }
    }, (el, html) => { el.innerHTML = card(`<div class="lab-verdict bad">${html}</div>`); });
  }

  const progress = (panel, msg) =>
    (panel.innerHTML = card(`<div class="running"><span class="spinner" aria-hidden="true"></span>${esc(msg)}</div>`));
  const card = (inner) => `<div class="lab-card">
    <div class="lab-head"><h2>Complexity Lab</h2><span class="lab-sub">empirical falsifier &mdash; refutes claims, never proves them</span></div>
    ${inner}</div>`;

  // Pure, DOM-free so it can be unit tested directly: given a problem's
  // langComplexity map, its problem-level fallback declared bound, and
  // whatever the reveal panel currently shows (or doesn't), decide what
  // the Lab should test against. Three sources, in priority order:
  //   1. "revealed" -- the reference panel is open and the active tab has
  //      its own declared bound for this language: test THAT variant's
  //      bound specifically (a brute-force reference should be judged
  //      against O(n^2), not the problem's best-known O(n)).
  //   2. "empirical-match" -- no specific bound to test (panel closed, or
  //      the revealed tab has none), but this problem/language DOES have
  //      per-variant declared bounds on file: measure first, then report
  //      which known variant(s) the growth actually matches.
  //   3. "legacy" -- neither available (not yet migrated to per-variant
  //      manifest bounds): the original problem-level behavior, unchanged.
  function determineBoundMode(langComplexity, cfgDeclared, revealedVariant) {
    const revealedBounds = revealedVariant ? langComplexity[revealedVariant] : null;
    if (revealedBounds && revealedBounds.upper) {
      // L4: the declared SPACE bound rides the SAME per-variant object the
      // time bounds come from (the corpus carries a `space` class next to
      // upper/lower). Upper-only: there is no declared space-lower anywhere.
      return { boundMode: "revealed", declared: { upper: revealedBounds.upper, lower: revealedBounds.lower || cfgDeclared.lower }, declaredSpace: revealedBounds.space || null };
    }
    if (Object.keys(langComplexity).length) return { boundMode: "empirical-match", declared: null, declaredSpace: null };
    return { boundMode: "legacy", declared: cfgDeclared, declaredSpace: (cfgDeclared && cfgDeclared.space) || null };
  }

  // L3 worker-per-run-of-a-session helper for JS (see jsLabWorkerState's
  // own comment above for the reasoning; goes through window.callWorker,
  // runtimes.js's shared spawn/message/timeout/cleanup helper). One
  // JS-side timeout per call -- NOT the same thing as the outer
  // app-level withRuntimeLock timeout (2 minutes, covers the WHOLE
  // Run/Analyze call): this one is scoped to a single runOnce() -- one
  // full (mode x size) plan's worth of cases, not the whole multi-rep
  // analysis -- so a hang gets caught and reported well before the
  // outer timeout would even notice something's wrong, and specifically
  // identifies "your code" as the likely cause rather than a generic
  // stuck-runtime message.
  const JS_LAB_TIMEOUT_MS = 20000;
  async function runJsInWorker(source, cases) {
    try {
      const res = await window.callWorker(
        jsLabWorkerState, "js-lab-worker.js", { id: "measure", source, cases },
        JS_LAB_TIMEOUT_MS, "Your code took too long to finish (over 20s) -- likely an infinite loop or a much slower algorithm than expected at this input size.");
      if (res.id === "error") return { error: res.error };
      return { results: res.results, nsPerCase: res.nsPerCase };
    } catch (e) {
      return { error: String((e && e.message) || e) };
    }
  }

  async function analyze(p, lang, panel) {
    const cfg = C.PROBLEMS[p.id];
    if (!cfg) return void (panel.innerHTML = card('<div class="lab-verdict dim">This problem has no input-family generators yet (web/lab-config.mjs) &mdash; the Lab needs authored best/adversarial families to say anything honest.</div>'));
    const source = window.GlifexEditor ? GlifexEditor.getValue() : document.getElementById("editor").value;

    const langComplexity = (p.languages[lang] || {}).complexity || {};
    const panelEl = document.getElementById("reference-panel");
    const revealedVariant = panelEl && !panelEl.hidden ? state.refVariant : null;
    const { boundMode, declared, declaredSpace } = determineBoundMode(langComplexity, cfg.declared, revealedVariant);

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
      ? await runJsInWorker(source, cases)
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
    // Correctness gate: a wrong solution must never reach the fitter.
    // Shared by the initial rep-collection loop below AND the
    // rep-replacement pass that follows it -- both need the identical
    // check applied to whatever came back.
    function correctnessError(results) {
      for (let i = 0; i < plan.length; i++) {
        const row = results[i];
        let ok = row && row.ok;
        if (!ok && row && cfg.validate) ok = cfg.validate(plan[i].input, row.got);
        if (!ok) {
          return `&#10007; Cannot analyze: the solution is incorrect on a generated input (family &ldquo;${esc(plan[i].mode)}&rdquo;, n=${plan[i].n})${row && row.error ? " &mdash; " + esc(row.error) : ""}. Growth of a wrong answer means nothing &mdash; fix correctness first.`;
        }
      }
      return null;
    }

    const repRows = [];
    const repDurations = [];      // wall time for the WHOLE runOnce() call, one entry per rep
    let detMeta = null;
    const maxRetries = (C.LANG_OVERRIDES[lang] && C.LANG_OVERRIDES[lang].retryOnError) || 0;
    let totalRetries = 0;         // surfaced in the final output, never silent -- see retryOnError's own comment
    for (let r = 0; r < reps; r++) {
      progress(panel, `Running ${plan.length} cases: ${cfg.modes.length} input famil${cfg.modes.length > 1 ? "ies" : "y"} \u00d7 ${sizes.length} sizes (pass ${r + 1}/${reps})\u2026`);
      const t0 = performance.now();
      let out, attempt = 0;
      for (;;) {
        out = await runOnce(cases);
        if (!out.error || attempt >= maxRetries) break;
        attempt++;
        totalRetries++;
        progress(panel, `Pass ${r + 1}/${reps} hit a runtime error, retrying (attempt ${attempt + 1}/${maxRetries + 1})\u2026`);
      }
      repDurations.push(performance.now() - t0);
      if (out.error) return void (panel.innerHTML = card(`<div class="lab-verdict bad">${esc(out.error)}</div>`));
      if (out.clockHz) detMeta = { clockHz: out.clockHz };
      const cErr = correctnessError(out.results);
      if (cErr) return void (panel.innerHTML = card(`<div class="lab-verdict bad">${cErr}</div>`));
      repRows.push(out.results);
    }

    // Rep-level outlier detection + replacement: a WHOLE rep uniformly
    // slower than its siblings -- sustained contention (a background
    // compile-heavy test sharing the CI runner, a GC pause spanning many
    // measurements, etc.) during that rep's ENTIRE pass, not a single
    // point's brief hiccup -- can't be caught by the existing per-point
    // SPREAD_LIMIT check below, since EVERY point in that rep would be
    // systematically higher, not scattered. Confirmed via a real CI
    // failure showing near-total (29-30 of 30) point disagreement in one
    // run -- a pattern min-of-N alone (which only protects a single
    // measurement's own brief window, not sustained contention spanning
    // an entire rep) wouldn't produce; a whole contaminated rep dragging
    // every point in it above the OTHER reps' values would.
    //
    // 2x the fastest rep's total wall time is the bar: a rep's total
    // duration aggregates over ALL ~30 points, so it should already run
    // far less noisy than single-point variance does (SPREAD_LIMIT=3,
    // per that check's own empirical characterization) -- a whole rep
    // running 2x+ its fastest sibling is a much stronger signal than any
    // one point crossing 3x. Bounded to exactly one replacement attempt
    // per flagged rep (not a retry loop) -- keeps the worst case at
    // double the normal work, not unbounded, and the existing per-point
    // check remains as a second layer of defense if a replacement is
    // ALSO contaminated.
    //
    // REPLACEMENT_BUDGET_MS additionally caps the WHOLE replacement
    // phase's total added time, not just each attempt individually --
    // found necessary after shipping the fix above: under sufficiently
    // severe, sustained contention (the same conditions that flag reps
    // as outliers in the first place), MULTIPLE replacement attempts
    // could each individually stay under any reasonable per-call
    // timeout while their SUM still pushed the whole analyze() call
    // past Playwright's own test-level timeout -- turning a
    // measurement problem this fix was meant to solve into a timeout
    // problem instead. Once this budget is spent, remaining flagged
    // reps are left as-is and fall through to the existing per-point
    // SPREAD_LIMIT/UNRELIABLE_TOLERANCE check below -- exactly how they
    // would have been handled before this replacement pass existed.
    const REP_OUTLIER_LIMIT = 2;
    const REPLACEMENT_BUDGET_MS = 10000;
    const minRepDuration = Math.min(...repDurations);
    let replacementBudgetSpent = 0;
    for (let r = 0; r < reps; r++) {
      if (repDurations[r] <= minRepDuration * REP_OUTLIER_LIMIT) continue;
      if (replacementBudgetSpent >= REPLACEMENT_BUDGET_MS) break;
      progress(panel, `Pass ${r + 1}/${reps} looked contaminated (a whole-pass slowdown, not a single point) &mdash; replacing it\u2026`);
      const t0 = performance.now();
      let out, attempt = 0;
      for (;;) {
        out = await runOnce(cases);
        if (!out.error || attempt >= maxRetries) break;
        attempt++;
        totalRetries++;
        progress(panel, `Pass ${r + 1}/${reps} replacement hit a runtime error, retrying (attempt ${attempt + 1}/${maxRetries + 1})\u2026`);
      }
      const dt = performance.now() - t0;
      replacementBudgetSpent += dt;
      if (out.error) return void (panel.innerHTML = card(`<div class="lab-verdict bad">${esc(out.error)}</div>`));
      if (out.clockHz) detMeta = { clockHz: out.clockHz };
      const cErr = correctnessError(out.results);
      if (cErr) return void (panel.innerHTML = card(`<div class="lab-verdict bad">${cErr}</div>`));
      repRows[r] = out.results;
      repDurations[r] = dt;
    }

    // Aggregate: median across reps, per (mode, size). A single measurement
    // can be wildly unreliable even when it's present (a GC pause, thermal
    // throttle, or background OS activity hitting one rep) -- catch that at
    // the source, before it ever reaches bHat estimation or classification,
    // rather than letting a single bad point cascade into a confidently
    // wrong verdict downstream. Empirically characterized in sandbox before
    // picking this threshold: normal rep-to-rep spread has a median of
    // ~1.04x and a p95 of ~1.6x across many real trials; genuine outlier
    // events run 5x-30x+. 3x sits comfortably above normal noise while
    // still catching the outlier tail.
    const SPREAD_LIMIT = 3;
    // TEMPORARY/DIAGNOSTIC (requested explicitly, not a final design):
    // tolerate up to this many unreliable points per analysis -- filtered
    // out entirely (not NaN-padded) so classification proceeds cleanly on
    // whatever remains -- instead of any single bad point blocking the
    // whole analysis. Paired with 003-nth-fibonacci's wall ladder going
    // from 4 points to 30 (see lab-config.mjs) so there's real headroom
    // left after filtering, and so the "X of N" count in the message
    // below gives actual visibility into how often this happens under
    // real conditions. "missing" (below timing resolution) stays at 0
    // tolerance -- that's a different, more fundamental failure than a
    // single noisy pass.
    const UNRELIABLE_TOLERANCE = 10;
    const modes = {}, spaceBy = {};
    let missing = 0, unreliable = 0;
    for (const mode of cfg.modes) modes[mode.id] = { ns: [], ys: [] };
    for (let i = 0; i < plan.length; i++) {
      const vals = repRows.map((rows) => (tierId === "det" ? rows[i].cycles : rows[i].tNs)).filter((v) => v != null && v > 0);
      if (!vals.length) { missing++; continue; }
      if (vals.length >= 2 && !E.isReliable(vals, SPREAD_LIMIT)) { unreliable++; continue; }
      modes[plan[i].mode].ns.push(plan[i].n);
      modes[plan[i].mode].ys.push(E.median(vals));
      // L4: collect the exact per-size workspace metric wherever the
      // runtime reports one -- retro reports `space` on every track, but
      // only i8080 hits the det tier; 6502/SM83 land on the wall tier for
      // TIME (no cycle table) yet their space is just as exact (distinct
      // bytes written, not a clock reading). Gate on the value's presence,
      // not the tier, so those two get judged too. JS/interpreted report
      // no `space`, so they naturally contribute nothing here.
      if (repRows[0][i].space != null) spaceBy[plan[i].mode + ":" + plan[i].n] = repRows[0][i].space;
    }
    if (missing) {
      return void (panel.innerHTML = card(`<div class="lab-verdict warn">Inconclusive: ${missing} of ${plan.length} measurements came back below timing resolution for this runtime. No verdict is honest here &mdash; a larger ladder needs the L3 worker budget.</div>`));
    }
    if (unreliable > UNRELIABLE_TOLERANCE) {
      return void (panel.innerHTML = card(`<div class="lab-verdict warn">Inconclusive: ${unreliable} of ${plan.length} measurements disagreed by more than ${SPREAD_LIMIT}&times; across repeated passes (likely a GC pause, thermal throttle, or other transient interruption on this device) &mdash; more than this analysis' tolerance of ${UNRELIABLE_TOLERANCE}, so no verdict is honest built on top of that. Try Analyze growth again; a fresh set of passes is often clean.</div>`));
    }

    // L4: assemble the space series for the upper (space-worst) family and
    // judge it against the declared space bound. Space is deterministic, so
    // one value per size (already in spaceBy) is exact -- no median needed.
    // spaceJ stays null when there's no declared space bound (empirical
    // match, or an unmigrated variant) or fewer than two measured points:
    // nothing to refute, so nothing is shown -- the tab omits itself.
    const spaceSeries = { ns: [], ys: [] };
    for (const n of modes[cfg.roles.upper].ns) {
      const v = spaceBy[cfg.roles.upper + ":" + n];
      if (v != null) { spaceSeries.ns.push(n); spaceSeries.ys.push(v); }
    }
    const spaceJ = (declaredSpace && spaceSeries.ns.length >= 2)
      ? E.judgeSpaceUpper(spaceSeries.ns, spaceSeries.ys, declaredSpace, tier.tol) : null;

    if (boundMode === "empirical-match") {
      const variantBounds = {};
      for (const [variant, b] of Object.entries(langComplexity)) {
        if (variant === "practice") continue;   // a blank starter stub, not a reference solution with a meaningful claim
        variantBounds[variant] = { upper: b.upper, lower: b.lower };
      }
      const mv = E.matchKnownVariants(modes, cfg.roles, variantBounds, tier.tol);
      // Reuse the existing chart/table rendering by feeding judge() a
      // "declared" equal to the empirical closest class itself -- always
      // "consistent" by construction (closest has the smallest error by
      // definition), so the chart/table render sensibly with no real
      // declared claim to test against; render() shows different headline
      // lines for this mode instead of the usual refuted/consistent ones.
      const j = E.judge(modes, cfg.roles, { upper: mv.upperClosest, lower: mv.lowerClosest }, tier.tol);
      render(panel, { p, lang, cfg, tierId, tier, reps, sizes, modes, j, detMeta, seedBase, spaceBy, boundMode, mv, variantBounds, totalRetries, spaceJ, spaceSeries, declaredSpace });
    } else {
      const j = E.judge(modes, cfg.roles, declared, tier.tol);
      render(panel, { p, lang, cfg, tierId, tier, reps, sizes, modes, j, detMeta, seedBase, spaceBy, boundMode, revealedVariant, totalRetries, spaceJ, spaceSeries, declaredSpace });
    }
  }

  const mkCase = (c, oracle) => ({ input: c.input, expected: oracle(JSON.parse(JSON.stringify(c.input))) });

  // ---- rendering ------------------------------------------------------
  function render(panel, X) {
    const { cfg, tierId, tier, j, boundMode, totalRetries } = X;
    const unit = tierId === "det" ? "cycles" : "ns";
    const vline = (kind, html) => `<div class="lab-verdict ${kind}">${html}</div>`;

    let html = "";
    if (boundMode === "empirical-match") {
      html += matchLines(vline, cfg, X.mv, X.variantBounds);
    } else {
      if (boundMode === "revealed") {
        html += vline("dim", `Testing against the revealed &ldquo;${esc(X.revealedVariant)}&rdquo; solution&rsquo;s own declared bound for ${esc(X.lang)}.`);
      }
      const up = j.upper, lo = j.lower;
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
        : lo.verdict === "consistent"
          ? vline("ok", `&#10003; Lower bound ${asOmega(lo.declared)}: consistent on the &ldquo;${esc(modeLabel(cfg, lo.mode))}&rdquo; family &mdash; this run failed to refute it.`)
          : vline("ok", `&#10003; Lower bound ${asOmega(lo.declared)} holds on the &ldquo;${esc(modeLabel(cfg, lo.mode))}&rdquo; family, but is not tight (growth tracks ${j.perMode[lo.mode].closest}).`);
      // Theta: both ends pin the same class.
      html += j.theta
        ? vline("theta", `${THETA} Growth is pinned between matching bounds: consistent with ${j.theta.cls.replace("O(", THETA + "(")} on these families.`)
        : vline("dim", `No ${THETA} badge: the two families&rsquo; growth does not pin a single class (upper tracks ${j.perMode[up.mode].closest}, lower ${j.perMode[lo.mode].closest}) &mdash; which is itself the point: case spread is real.`);
    }
    // L4: space verdict -- shown alongside the time bounds (never hidden
    // behind the tab), because "O(n) time but O(1) space" vs "O(n) space"
    // is exactly the contrast worth seeing at a glance. Upper-only,
    // refute-only doctrine, same as time. The [space] tag disambiguates it
    // from the time upper/lower lines.
    if (X.spaceJ) {
      const sv = X.spaceJ, sd = sv.declared;
      html += sv.verdict === "refuted"
        ? vline("bad", `&#10007; <b>[space]</b> ${sd} REFUTED &mdash; workspace grows faster than declared on the &ldquo;${esc(modeLabel(cfg, cfg.roles.upper))}&rdquo; family (measured tracks ${sv.closest}).`)
        : sv.verdict === "consistent"
          ? vline("ok", `&#10003; <b>[space]</b> ${sd}: consistent on the &ldquo;${esc(modeLabel(cfg, cfg.roles.upper))}&rdquo; family &mdash; this run failed to refute it.`)
          : vline("ok", `&#10003; <b>[space]</b> ${sd} holds, but is not tight (workspace grows as ${sv.closest}).`);
    }
    if (cfg.note) html += `<p class="lab-note">${esc(cfg.note)}</p>`;
    if (totalRetries > 0) html += `<p class="lab-note">Note: ${totalRetries} runtime error${totalRetries === 1 ? "" : "s"} occurred and ${totalRetries === 1 ? "was" : "were"} retried before this result completed (a known, intermittent runtime instability -- see docs/ROADMAP.md's Bx-3 entry). The result below reflects only successful runs.</p>`;

    // L4: a Time|Space metric tab appears ONLY when there's a space
    // verdict to show (conditional, not a greyed-out dead control) -- so
    // every non-retro track's card is byte-for-byte unchanged. The time
    // panel is the proven path, untouched; the space panel is parallel.
    if (X.spaceJ) {
      html += `<div class="lab-metrictabs">`
        + `<button class="ghost sm active" data-labmetric="time">Time growth</button>`
        + `<button class="ghost sm" data-labmetric="space">Space growth</button></div>`;
      html += `<div data-metricpanel="time">${chart(X, unit)}${table(X, unit)}</div>`;
      html += `<div data-metricpanel="space" hidden>${spaceChart(X)}${spaceTable(X)}</div>`;
    } else {
      html += chart(X, unit);
      html += table(X, unit);
    }
    html += boundMode === "empirical-match"
      ? `<p class="lab-note">No solution was revealed, so there was no specific claim to refute &mdash; this mode measures growth first and reports which known solution type(s) (if any) it matches, using the same tolerance-based classification as every refutation elsewhere in this tool. Reveal a specific solution (clean, optimized, brute-force&hellip;) to test your code against THAT variant's own declared bound instead.</p>`
      : `<p class="lab-note">O / ${OMEGA} / ${THETA} are BOUNDS, not case names: worst, average, and best case are different cost functions from different input families, and each can carry any bound. The card tests the declared O on the adversarial family and the declared ${OMEGA} on the easy one; ${THETA} appears only when both ends pin the same class. Refutations are conclusive; &ldquo;consistent&rdquo; only means this run failed to refute &mdash; a curve can never prove a bound.</p>`;
    html += `<div class="lab-prov">${prov(X)}</div>`;
    panel.innerHTML = card(html);

    panel.querySelectorAll("[data-labmode]").forEach((b) => (b.onclick = () => {
      panel.querySelectorAll("[data-labmode]").forEach((x) => x.classList.toggle("active", x === b));
      // Scope to THIS button's own panel so the space panel (if present)
      // never has its (single-mode, tab-less) table clobbered.
      const wrap = (b.closest("[data-metricpanel]") || panel).querySelector(".lab-tablewrap");
      if (wrap) wrap.innerHTML = tableFor(X, unit, b.dataset.labmode);
    }));
    // L4: Time|Space metric switch -- toggles which panel is visible.
    panel.querySelectorAll("[data-labmetric]").forEach((b) => (b.onclick = () => {
      panel.querySelectorAll("[data-labmetric]").forEach((x) => x.classList.toggle("active", x === b));
      panel.querySelectorAll("[data-metricpanel]").forEach((pnl) => (pnl.hidden = pnl.dataset.metricpanel !== b.dataset.labmetric));
    }));
  }

  const modeLabel = (cfg, id) => (cfg.modes.find((m) => m.id === id) || { label: id }).label;

  // Empirical-match mode's headline lines: no revealed solution to test a
  // specific claim against, so report the measured growth and which known
  // variant(s) -- if any -- it's actually consistent with.
  function matchLines(vline, cfg, mv, variantBounds) {
    const sameRole = cfg.roles.upper === cfg.roles.lower;
    const upLabel = modeLabel(cfg, cfg.roles.upper), loLabel = modeLabel(cfg, cfg.roles.lower);
    let html = vline("dim", `No solution revealed &mdash; measuring first, then comparing against every known solution type&rsquo;s own declared bounds.`);
    html += sameRole
      ? vline("dim", `Empirical growth on the &ldquo;${esc(upLabel)}&rdquo; family: closest to ${mv.upperClosest}.`)
      : vline("dim", `Empirical growth: closest to ${mv.upperClosest} on the &ldquo;${esc(upLabel)}&rdquo; family, ${mv.lowerClosest} on the &ldquo;${esc(loLabel)}&rdquo; family.`);
    if (mv.matches.length) {
      const names = mv.matches.map((v) => {
        const b = variantBounds[v];
        return `<b>${esc(v)}</b> (declared ${esc(b.upper)}${b.lower ? ", " + asOmega(b.lower) : ""})`;
      }).join(", ");
      html += vline("ok", `&#10003; Matches known solution type${mv.matches.length > 1 ? "s" : ""}: ${names}.`);
    } else {
      const ref = Object.entries(variantBounds).map(([v, b]) => `${esc(v)}=${esc(b.upper || "?")}${b.lower ? "/" + asOmega(b.lower) : ""}`).join(", ");
      html += vline("warn", `Did not match any known solution type for this problem/language. Reference: ${ref}.`);
    }
    return html;
  }

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
    // Upper-bound fit on the adversarial family, dashed, for the eye --
    // the declared bound being tested (revealed/legacy mode) or the
    // empirical closest class itself (empirical-match mode, where there's
    // no real declared claim -- see X.boundMode).
    const upM = modes[cfg.roles.upper];
    const fit = E.fitClass(E.classById(j.upper.declared).f, upM.ns, upM.ys);
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
      + ` <span class="lab-k lab-k-dash"></span>${X.boundMode === "empirical-match" ? "closest-fit" : "declared"} ${j.upper.declared} fit (intercept absorbs fixed overhead)`;
    return `<figure class="lab-fig"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="growth chart" font-family="var(--mono)">${g}</svg><figcaption>${legend}</figcaption></figure>`;
  }

  function table(X, unit) {
    const tabs = X.cfg.modes.map((m, i) => `<button class="ghost sm${i === 0 ? " active" : ""}" data-labmode="${m.id}">${esc(m.id)}</button>`).join("");
    return `<h3 class="lab-sec">Step-ratio proof ${X.cfg.modes.length > 1 ? tabs : ""}</h3>
      <div class="lab-tablewrap">${tableFor(X, unit, X.cfg.modes[0].id)}</div>
      <p class="lab-note">Ratios cancel constant multiplicative factors; a shared fixed-overhead estimate (subtracted before comparing, see provenance below) cancels the constant additive term too, the same way &mdash; absolute speed never enters the verdict either way. Greyed steps are excluded from the final scoring for statistical robustness.</p>`;
  }

  function tableFor(X, unit, modeId) {
    const cls = X.j.perMode[modeId], declared = modeId === X.cfg.roles.upper ? X.j.upper.declared : X.j.lower.declared;
    const names = E.CLASSES.map((c) => c.id);
    let h = `<table class="lab-table"><tr><th>step</th><th>measured &times;</th>${names.map((n) => `<th${n === declared ? ' class="declared"' : ""}>${n === declared ? "declared " : ""}${n} &times;</th>`).join("")}${X.tierId === "det" ? "<th>workspace B</th>" : ""}</tr>`;
    for (const r of cls.rows) {
      h += `<tr${r.scored ? "" : ' class="dropped"'}><td>${r.from} &rarr; ${r.to}</td><td>&times;${r.meas.toFixed(2)}</td>`;
      for (const n of names) {
        // Hit/miss reflects the SAME bHat-corrected comparison that produced
        // the verdict (not the raw uncorrected ratio) -- otherwise a cell
        // could show "miss" while the overall verdict says "consistent".
        const close = r.scored && r.correctedMeas != null && Math.abs(Math.log(r.correctedMeas / r.pred[n])) <= X.tier.tol;
        h += `<td class="${n === declared ? "declared " : ""}${r.scored ? (close ? "hit" : n === declared ? "miss" : "") : ""}">&times;${r.pred[n].toFixed(2)}</td>`;
      }
      if (X.tierId === "det") h += `<td>${X.spaceBy[modeId + ":" + r.to] != null ? X.spaceBy[modeId + ":" + r.to] : "&mdash;"}</td>`;
      h += "</tr>";
    }
    return h + "</table>";
  }

  // L4: the space growth chart -- same log-log format as chart(), one
  // series (the space-worst family), y-axis in BYTES (the disambiguator
  // from the time chart's ns/cycles), dashed fit of the declared space
  // class (red when refuted). Deliberately parallel to chart() rather than
  // a shared generic, to leave the proven time path byte-for-byte intact.
  function spaceChart(X) {
    const { cfg } = X;
    const ns = X.spaceSeries.ns, ys = X.spaceSeries.ys;
    const W = 640, H = 320, L = 64, R = 12, T = 14, B = 40; const lx = Math.log10;
    const x0 = lx(Math.min(...ns)), x1 = lx(Math.max(...ns));
    const y0 = lx(Math.max(Math.min(...ys), 1e-9)) - 0.15, y1 = lx(Math.max(...ys)) + 0.15;
    const Xc = (n) => L + ((lx(n) - x0) / (x1 - x0 || 1)) * (W - L - R);
    const Yc = (v) => H - B - ((lx(Math.max(v, 1e-9)) - y0) / (y1 - y0 || 1)) * (H - T - B);
    const fmt = (v) => (v >= 1e6 ? (v / 1e6).toPrecision(3) + "M" : v >= 1000 ? (v / 1000).toPrecision(3) + "k" : v.toPrecision(3));
    let g = "";
    for (let d = Math.ceil(y0); d <= Math.floor(y1); d++) {
      const y = H - B - ((d - y0) / (y1 - y0 || 1)) * (H - T - B);
      g += `<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}" stroke="#2a3140"/><text x="${L - 7}" y="${y + 3}" text-anchor="end" fill="#8b949e" font-size="10">${fmt(10 ** d)}</text>`;
    }
    for (const n of ns)
      g += `<line x1="${Xc(n)}" y1="${T}" x2="${Xc(n)}" y2="${H - B}" stroke="#232b38"/><text x="${Xc(n)}" y="${H - B + 13}" text-anchor="middle" fill="#8b949e" font-size="10">${n}</text>`;
    const fit = E.fitClass(E.classById(X.declaredSpace).f, ns, ys);
    let d = "";
    for (let i = 0; i <= 48; i++) {
      const n = 10 ** (x0 + ((x1 - x0) * i) / 48), y = fit.predict(n);
      if (y > 0) d += (d ? "L" : "M") + Xc(n).toFixed(1) + " " + Yc(y).toFixed(1);
    }
    g += `<path d="${d}" fill="none" stroke="${X.spaceJ.verdict === "refuted" ? "#ff7b72" : "#8b949e"}" stroke-width="1.6" stroke-dasharray="5 5"/>`;
    const col = MODE_COLORS[cfg.roles.upper] || "#6ea8fe";
    const pts = ns.map((n, i) => Xc(n).toFixed(1) + "," + Yc(ys[i]).toFixed(1));
    g += `<polyline points="${pts.join(" ")}" fill="none" stroke="${col}" stroke-width="1.4" opacity=".75"/>`;
    for (let i = 0; i < pts.length; i++) g += `<circle cx="${pts[i].split(",")[0]}" cy="${pts[i].split(",")[1]}" r="3.6" fill="${col}" stroke="#0d1117" stroke-width="1.4"/>`;
    g += `<text x="${(L + W - R) / 2}" y="${H - 5}" text-anchor="middle" fill="#8b949e" font-size="10">${esc(cfg.sizeLabel)} (log)</text>`;
    g += `<text x="13" y="${(T + H - B) / 2}" fill="#8b949e" font-size="10" transform="rotate(-90 13 ${(T + H - B) / 2})" text-anchor="middle">bytes / case (log)</text>`;
    const legend = `<span class="lab-k" style="background:${col}"></span>${esc(modeLabel(cfg, cfg.roles.upper))} workspace <span class="lab-k lab-k-dash"></span>declared ${X.declaredSpace} fit`;
    return `<figure class="lab-fig"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="space growth chart" font-family="var(--mono)">${g}</svg><figcaption>${legend}</figcaption></figure>`;
  }

  function spaceTable(X) {
    const ns = X.spaceSeries.ns, ys = X.spaceSeries.ys, declared = X.declaredSpace;
    const names = E.CLASSES.map((c) => c.id);
    let h = `<h3 class="lab-sec">Workspace step-ratio proof</h3><div class="lab-tablewrap"><table class="lab-table"><tr><th>step</th><th>workspace B</th><th>measured &times;</th>${names.map((n) => `<th${n === declared ? ' class="declared"' : ""}>${n === declared ? "declared " : ""}${n} &times;</th>`).join("")}</tr>`;
    for (let i = 1; i < ns.length; i++) {
      const meas = ys[i] / ys[i - 1];
      h += `<tr><td>${ns[i - 1]} &rarr; ${ns[i]}</td><td>${ys[i]}</td><td>&times;${meas.toFixed(2)}</td>`;
      for (const n of names) {
        const pred = E.classById(n).f(ns[i]) / E.classById(n).f(ns[i - 1]);
        const close = Math.abs(Math.log(meas / pred)) <= X.tier.tol;
        h += `<td class="${n === declared ? "declared " : ""}${close ? "hit" : (n === declared ? "miss" : "")}">&times;${pred.toFixed(2)}</td>`;
      }
      h += "</tr>";
    }
    h += `</table></div><p class="lab-note">Workspace = distinct bytes written outside the program image, measured exactly (deterministic; no clock). Judged the same way as time &mdash; refute, never prove. A flat curve is consistent with O(1); growth above the declared class refutes it.</p>`;
    return h;
  }

  function prov(X) {
    const det = X.tierId === "det";
    const clock = det && X.detMeta ? ` &middot; ${(X.detMeta.clockHz / 1e6).toFixed(3)} MHz reference` : "";
    const fmtB = (v) => Math.abs(v) >= 100 ? Math.round(v).toString() : v.toFixed(1);
    const bUp = X.j.perMode[X.cfg.roles.upper].bHat, bLo = X.j.perMode[X.cfg.roles.lower].bHat;
    const overhead = X.cfg.roles.upper === X.cfg.roles.lower
      ? ` &middot; shared overhead subtracted before comparing: ${fmtB(bUp)} ${unitOf(X)}`
      : ` &middot; shared overhead subtracted: ${fmtB(bUp)} ${unitOf(X)} (upper family), ${fmtB(bLo)} ${unitOf(X)} (lower family)`;
    return `${det ? "deterministic cycle counts (1 rep is exact)" + clock
      : `wall time inside this runtime &mdash; median of ${X.reps} pass${X.reps > 1 ? "es" : ""}; absolute values are not comparable across languages or devices`}
      &middot; sizes ${X.sizes.join(", ")} &middot; inputs: seeded generators (base &ldquo;${esc(X.seedBase)}&rdquo;)
      &middot; oracle: javascript clean &middot; correctness-gated${overhead}
      &middot; ${new Date().toISOString().slice(0, 10)}`;
  }
  const unitOf = (X) => (X.tierId === "det" ? "cycles" : "ns");

  function init() {
    const btn = $("#lab-btn");
    if (btn) btn.onclick = open;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { sync, open };
})();
if (typeof window !== "undefined") window.GlifexLab = GlifexLab;
