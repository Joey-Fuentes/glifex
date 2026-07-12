// L4 (JS peak-space) render + status coverage. The real measurement
// (churn-forced GC + measureUserAgentSpecificMemory at the probe's peak) is
// Chromium-only and only runs in a headed browser, so here we stub
// window.GlifexJsRuntime.measureSpaceProbe to a canned series and assert the
// PLUMBING end-to-end: probe lookup -> series -> judge -> Space tab + the
// peak-workspace-of-reference disclaimer, plus every honest non-success state
// (needs-reveal, not-instrumented, couldn't-measure). Scoped to chromium since
// the API is Chromium-only; lab-space.spec.js covers retro space cross-browser.
const { test, expect } = require("./coi-fixtures");

const ANAGRAM = `module.exports = function solve(c){ return [...c.s].sort().join("") === [...c.t].sort().join(""); };`;
const FIB = `module.exports = function solve(c){ let a=0,b=1; for(let i=0;i<c.n;i++){const t=a+b;a=b;b=t;} return a; };`;

async function open(page, problemId, code) {
  await page.addInitScript(() => { performance.measureUserAgentSpecificMemory = async () => ({ bytes: 1000 }); });
  await page.goto("http://localhost:8080/");
  await page.waitForFunction(() => window.state && window.state.corpus, null, { timeout: 15000 });
  await page.evaluate((id) => window.selectProblem(id), problemId);
  await page.evaluate((src) => { if (window.GlifexEditor) GlifexEditor.setValue(src); else document.getElementById("editor").value = src; }, code);
}
const stubProbe = (page, fn) => page.evaluate(`window.GlifexJsRuntime.measureSpaceProbe = ${fn};`);

test("001 probe -> Space tab + peak-workspace-of-reference disclaimer", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "measureUserAgentSpecificMemory is Chromium-only");
  test.setTimeout(90000);
  await open(page, "001-anagram-detection", ANAGRAM);
  await page.locator("#reveal-btn").click();                       // -> optimized (has a probe)
  await expect(page.locator("#reference-panel")).toBeVisible();
  await stubProbe(page, "async (probe, gen, sizes) => sizes.map((n, i) => ({ n, bytes: (i + 1) * 100000 }))");
  await page.locator("#lab-btn").click();
  await page.locator("#lab .lab-verdict").first().waitFor({ timeout: 75000 });
  const tab = page.locator("[data-labmetric='space']");
  await expect(tab).toBeVisible({ timeout: 30000 });
  await tab.click();
  const panel = page.locator("[data-metricpanel='space']");
  await expect(panel).toContainText(/PEAK workspace/i);
  await expect(panel).toContainText(/reference solution/i);
});

test("001 probe returns nothing -> honest 'couldn't measure' note, no tab", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Chromium-only");
  test.setTimeout(90000);
  await open(page, "001-anagram-detection", ANAGRAM);
  await page.locator("#reveal-btn").click();
  await expect(page.locator("#reference-panel")).toBeVisible();
  await stubProbe(page, "async (probe, gen, sizes) => sizes.map((n) => ({ n, bytes: null }))");
  await page.locator("#lab-btn").click();
  await page.locator("#lab .lab-verdict").first().waitFor({ timeout: 75000 });
  await expect(page.locator("#lab")).toContainText(/couldn't get a reliable reading/i, { timeout: 30000 });
  await expect(page.locator("[data-labmetric='space']")).toHaveCount(0);
});

test("003 has no probe -> honest 'not set up for this problem' note", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Chromium-only");
  test.setTimeout(90000);
  await open(page, "003-nth-fibonacci", FIB);
  await page.locator("#reveal-btn").click();
  await expect(page.locator("#reference-panel")).toBeVisible();
  await page.locator("#lab-btn").click();
  await page.locator("#lab .lab-verdict").first().waitFor({ timeout: 75000 });
  await expect(page.locator("#lab")).toContainText(/isn't set up for this problem/i);
  await expect(page.locator("[data-labmetric='space']")).toHaveCount(0);
});

test("no reveal -> prompts to reveal for peak memory", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Chromium-only");
  test.setTimeout(90000);
  await open(page, "001-anagram-detection", ANAGRAM);
  await page.locator("#lab-btn").click();                          // no reveal -> empirical-match
  await page.locator("#lab .lab-verdict").first().waitFor({ timeout: 75000 });
  await expect(page.locator("#lab")).toContainText(/Reveal a reference solution to also measure/i);
});
