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
const { test, expect } = require("@playwright/test");

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

test("Complexity Lab renders a verdict card (JavaScript, Nth Fibonacci)", async ({ page }) => {
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  await page.goto("http://localhost:8080/");
  await expect(page.locator("#problem-list li").first()).toBeVisible();
  await page.locator('#problem-list li:has-text("Fibonacci")').click();
  await expect(page.locator("#lab-btn")).toBeVisible();

  await page.evaluate((src) => {
    if (window.GlifexEditor) GlifexEditor.setValue(src);
    else document.getElementById("editor").value = src;
  }, JS_FIB);

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
    await expect(verdicts.first()).toContainText(/Upper bound O\(n\)|Inconclusive/, { timeout: 60000 });
    text = await verdicts.first().textContent();
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
