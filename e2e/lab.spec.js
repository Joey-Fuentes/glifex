// L1 -- Complexity Lab smoke. Proves the whole lab path end to end on the
// zero-install JavaScript track: generators -> oracle -> runner -> fitter ->
// verdict card. False-green guard: waits for a .lab-verdict to APPEAR, then
// asserts the upper-bound line is a real verdict (consistent), not an error
// card -- a broken engine or a correctness-gate trip cannot fake a pass.
//
// Targets 003-nth-fibonacci, not 002-two-sum: fib's wall ladder has 4
// measurement points (one mode) vs two-sum's 15 (3 modes x 5 sizes), and
// fewer points means fewer chances for the rep-to-rep consistency floor to
// flag at least one as unreliable per attempt -- confirmed empirically
// (sandbox, real sampler, 30 trials each): fib ~3% inconclusive per
// attempt vs two-sum's ~13%. This test exists to catch STRUCTURAL breaks
// in the pipeline, not to characterize wall-tier noise -- fib proves the
// exact same pipeline with meaningfully better odds per attempt.
//
// Two tests, covering the two ways the Lab decides what to test against
// (see web/lab.js's determineBoundMode()): "revealed" (a specific
// solution's own declared bound -- reveal the reference panel first) and
// "empirical-match" (nothing revealed -- measure first, report which known
// variant(s) the growth matches). A real CI failure here once caught a
// genuine regression: the first test used to pass without ever revealing
// anything, back when "no reveal" always meant "legacy" mode showing the
// same "Upper bound O(n)..." text revealed mode shows -- once
// empirical-match mode shipped as the new default for that same
// no-reveal state, the unrevealed first test started seeing a
// completely different headline and hung waiting for text that would
// never appear. Fixed by revealing a variant explicitly (restoring the
// original test's intent) and adding a second, separate test for the
// no-reveal path specifically, so both are covered on their own terms.
const { test, expect } = require("./coi-fixtures");

// A correct O(n) iterative fib -- exactly the shape lab-config.mjs's
// declared bound describes, using the SAME safe, precision-validated
// wall ladder (see lab-config.mjs's comments for why those exact values).
const JS_FIB = `module.exports = function solve(c) {
  let a = 0, b = 1;
  for (let i = 0; i < c.n; i++) { const t = a + b; a = b; b = t; }
  return a;
};`;

// Extracts a short, guaranteed-readable summary of one attempt's verdict
// text -- specifically the "X of Y" counts from an Inconclusive card, the
// thing this test exists partly to surface. Plain console.log() from a
// PASSING test is commonly swallowed by CI reporters (confirmed: a real
// run here passed but the diagnostic counts weren't visible in the job
// output) -- test.step() names, by contrast, show up in Playwright's
// reporters (list/html/line) as a structured per-test breakdown
// regardless of whether the test ultimately passes or fails.
function summarize(text) {
  if (/consistent/i.test(text)) return "consistent";
  const m = text.match(/Inconclusive: (\d+) of (\d+)/);
  if (m) return `inconclusive (${m[1]} of ${m[2]})`;
  if (/REFUTED/.test(text)) return "refuted";
  return text.slice(0, 80);
}

// Same idea as summarize(), for empirical-match mode's different headline
// vocabulary (there's no "REFUTED"/"consistent" verdict against a specific
// claim in this mode -- see web/lab.js's matchLines()).
function summarizeMatch(text) {
  if (/Matches known solution type/i.test(text)) return "matched";
  if (/Did not match any known solution type/i.test(text)) return "no match";
  const m = text.match(/Inconclusive: (\d+) of (\d+)/);
  if (m) return `inconclusive (${m[1]} of ${m[2]})`;
  return text.slice(0, 80);
}

test("Complexity Lab renders a verdict card (JavaScript, Nth Fibonacci, revealed)", async ({ page }) => {
  // 60s, not the global 30s default: web/lab.js's rep-level outlier
  // replacement (added after a real CI failure showed sustained,
  // whole-rep contention corrupting near-every point) can add up to
  // REPLACEMENT_BUDGET_MS (10s) of bounded extra work on top of the
  // normal probe+warmup+3-reps sequence specifically to SURVIVE that
  // contention and still return a correct verdict -- which needs
  // proportionally more wall-clock room to complete, not a tighter
  // budget that risks timing out the test instead of the measurement.
  // Scoped to just these two Lab tests (not the global config) so a
  // genuine hang anywhere else in the suite still fails fast.
  test.setTimeout(60000);
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  await page.goto("http://localhost:8080/");
  await expect(page.locator("#problem-list li").first()).toBeVisible();
  await page.locator('#problem-list li:has-text("Fibonacci")').click();
  await expect(page.locator("#lab-btn")).toBeVisible();

  await page.evaluate((src) => {
    if (window.GlifexEditor) GlifexEditor.setValue(src);
    else document.getElementById("editor").value = src;
  }, JS_FIB);

  // Reveal a specific solution (defaults to the "optimized" tab on open --
  // see wiring.js's setRevealVisible) so the Lab has a specific declared
  // bound to test against ("revealed" mode). Without this, "Analyze"
  // measures first and reports which known variant(s) match instead (a
  // real, different, and separately-tested code path -- see the
  // "empirical-match" test below), which never renders "Upper bound
  // O(n)..." at all.
  await page.locator("#reveal-btn").click();
  await expect(page.locator("#reference-panel")).toBeVisible();

  const verdicts = page.locator("#lab .lab-verdict");

  // Wall-tier timing is a REAL measurement, not a simulation -- genuine
  // JIT/GC noise can occasionally produce a spurious refutation or an
  // inconclusive result on an otherwise-correct solution (tracked: the
  // wall-tier DCE/JIT-noise known issue, docs/ROADMAP.md's L1 entry).
  // Clicking Analyze again re-samples fresh wall-clock timing (the input
  // DATA is seeded/deterministic; the TIMING is not), so retrying absorbs
  // bad draws of measurement noise without weakening what this test
  // actually proves: a STRUCTURAL break (broken engine, a tripped
  // correctness gate, a missing oracle) fails on EVERY attempt, since it
  // isn't timing-dependent.
  //
  // Two possible non-consistent outcomes per attempt: a real refutation
  // (renders "Upper bound O(n) REFUTED...") or "Inconclusive" (the
  // rep-to-rep consistency floor's own retry-worthy outcome -- a
  // completely different card that never contains "Upper bound" at all;
  // waiting on only the first pattern hung forever the one time this
  // happened in CI). 5 attempts: Firefox's noise floor has run worse than
  // sandbox testing suggested more than once.
  let text = "";
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await page.locator("#lab-btn").click();
    await expect(verdicts.first()).toBeVisible({ timeout: 60000 });
    // Join only the .lab-verdict elements' text -- NOT the whole #lab
    // panel, and NOT verdicts.first() alone. Two real bugs, both caught
    // by real CI runs, motivate this exact shape:
    //   1. verdicts.first() alone: "revealed" mode's own leading line
    //      ("Testing against the revealed '<variant>'...", added right
    //      after the render() branch split) is verdicts.first() itself,
    //      pushing the actual "Upper bound O(n)..." verdict to a LATER
    //      .lab-verdict element -- waiting on only the first one timed
    //      out forever, since that text never appears there.
    //   2. The whole #lab panel's text (tried as the first fix): the
    //      footer note ("...&ldquo;consistent&rdquo; only means this run
    //      failed to refute...") is ALWAYS present regardless of the
    //      actual verdict, so checking against the full panel text would
    //      make expect(text).toMatch(/consistent/i) a false-green even
    //      on a genuine REFUTED result.
    // Joining just the .lab-verdict elements avoids both: every real
    // verdict line is included, the footer note (a <p>, not a
    // .lab-verdict div) is not.
    const allVerdicts = () => page.locator("#lab .lab-verdict").allTextContents();
    await page.waitForFunction(() => {
      const els = document.querySelectorAll("#lab .lab-verdict");
      const joined = Array.from(els).map((e) => e.textContent).join(" ");
      return /Upper bound O\(n\)|Inconclusive/.test(joined);
    }, null, { timeout: 60000 });
    text = (await allVerdicts()).join(" ");
    const summary = summarize(text);
    // Empty step body -- this call exists solely to record a step name
    // Playwright's reporters will show, not to perform an action.
    await test.step(`attempt ${attempt}/${maxAttempts}: ${summary}`, async () => {});
    if (/consistent/i.test(text)) break;
  }
  expect(text).toMatch(/consistent/i);

  // The proof table and chart rendered.
  await expect(page.locator("#lab .lab-table")).toBeVisible();
  await expect(page.locator("#lab svg")).toBeVisible();
});

test("Complexity Lab renders a verdict card (JavaScript, Nth Fibonacci, empirical-match)", async ({ page }) => {
  // See the revealed-mode test above for the full reasoning -- same
  // rep-replacement worst case applies here too.
  test.setTimeout(60000);
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  await page.goto("http://localhost:8080/");
  await expect(page.locator("#problem-list li").first()).toBeVisible();
  await page.locator('#problem-list li:has-text("Fibonacci")').click();
  await expect(page.locator("#lab-btn")).toBeVisible();

  await page.evaluate((src) => {
    if (window.GlifexEditor) GlifexEditor.setValue(src);
    else document.getElementById("editor").value = src;
  }, JS_FIB);

  // Deliberately do NOT reveal anything -- this is the default state most
  // users hit "Analyze" from. No specific declared bound to test, so the
  // Lab measures first and reports which known variant(s) (clean and
  // optimized both declare O(n) for this problem's default/JavaScript
  // complexity -- practice is excluded from matching, see lab.js) the
  // growth actually matches.
  const verdicts = page.locator("#lab .lab-verdict");
  let text = "";
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await page.locator("#lab-btn").click();
    await expect(verdicts.first()).toBeVisible({ timeout: 60000 });
    await expect(verdicts.first()).toContainText(/No solution revealed|Inconclusive/, { timeout: 60000 });
    // The "matches" verdict is a LATER .lab-verdict line, not the first
    // one (which is always the static "No solution revealed..." intro).
    // Join only the .lab-verdict elements' text, not the whole #lab
    // panel -- the footer note's own explanatory text happens not to
    // collide with "Matches known solution type" today, but that's
    // safety by coincidence of wording, not by design (see the
    // "revealed" test above, where the equivalent whole-panel check WAS
    // a real false-green risk against its own footer note).
    const allVerdicts = () => page.locator("#lab .lab-verdict").allTextContents();
    text = (await allVerdicts()).join(" ");
    const summary = summarizeMatch(text);
    await test.step(`attempt ${attempt}/${maxAttempts}: ${summary}`, async () => {});
    if (/Matches known solution type/i.test(text)) break;
  }
  expect(text).toMatch(/Matches known solution type/i);
  expect(text).toContain("optimized");

  // The proof table and chart rendered here too.
  await expect(page.locator("#lab .lab-table")).toBeVisible();
  await expect(page.locator("#lab svg")).toBeVisible();
});
