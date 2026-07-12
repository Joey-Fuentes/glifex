// L4 (JS space) render coverage. measureUserAgentSpecificMemory is unavailable
// in dedicated workers (by spec) and in headless Chrome, so the REAL metric only
// runs in a headed, cross-origin-isolated desktop Chrome -- CI can't exercise it.
// What CI CAN pin, now that the measurement runs on the MAIN thread, is the full
// render pipeline: with the window API stubbed, analyzing a revealed JS solution
// must surface the Time|Space tab AND the honest "approximate" disclaimer that
// distinguishes this proxy from the retro tracks' exact metric. (Without the stub,
// lab-space.spec.js:141 already asserts the tab stays absent -- graceful degradation.)
const { test, expect } = require("./coi-fixtures");

const JS_FIB = `module.exports = function solve(c) { let a = 0, b = 1; for (let i = 0; i < c.n; i++) { const t = a + b; a = b; b = t; } return a; };`;

test("JS space: main-thread measurement surfaces the tab + approximate disclaimer", async ({ page, browserName }) => {
  // measureUserAgentSpecificMemory is Chromium-only, so this render-path check
  // runs there. Firefox users never get JS space; lab.spec.js already covers the
  // JS analyze flow cross-browser, and lab-space.spec.js:141 covers degradation.
  test.skip(browserName !== "chromium", "measureUserAgentSpecificMemory is Chromium-only");
  test.setTimeout(90000);
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  // Stub the window-context API (the one real place it runs). Monotonic bytes so
  // each before/after pair yields a positive delta -> a real >=2-point series.
  await page.addInitScript(() => {
    let c = 0;
    performance.measureUserAgentSpecificMemory = async () => { c += 1; return { bytes: 1_000_000 + c * 30000 }; };
  });
  await page.goto("http://localhost:8080/");
  await expect(page.locator("#problem-list li").first()).toBeVisible();
  await page.locator('#problem-list li:has-text("Fibonacci")').click();
  await page.evaluate((src) => { if (window.GlifexEditor) GlifexEditor.setValue(src); else document.getElementById("editor").value = src; }, JS_FIB);
  await page.locator("#reveal-btn").click();               // gives a declared space bound
  await expect(page.locator("#reference-panel")).toBeVisible();
  await page.locator("#lab-btn").click();
  await page.locator("#lab .lab-verdict").first().waitFor({ timeout: 75000 });

  const spaceTab = page.locator("[data-labmetric='space']");
  await expect(spaceTab).toBeVisible();                     // tab appears only when a space verdict exists
  await spaceTab.click();
  const panel = page.locator("[data-metricpanel='space']");
  await expect(panel).toContainText(/Approximate/i);       // the honest disclaimer, not the retro "measured exactly" note
  await expect(panel).toContainText("measureUserAgentSpecificMemory");
});
