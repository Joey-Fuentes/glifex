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
  // Stub the window API with a per-call DELAY so the progressive path is
  // observable: the verdict + a "measuring memory" note must appear first, then
  // the Space tab slots in once the background pass completes. Monotonic bytes so
  // each size shows growth over the baseline -> a real >=2-point series.
  await page.addInitScript(() => {
    let c = 0;
    performance.measureUserAgentSpecificMemory = () =>
      new Promise((res) => setTimeout(() => { c += 1; res({ bytes: 1_000_000 + c * 30000 }); }, 500));
  });
  await page.goto("http://localhost:8080/");
  await expect(page.locator("#problem-list li").first()).toBeVisible();
  await page.locator('#problem-list li:has-text("Fibonacci")').click();
  await page.evaluate((src) => { if (window.GlifexEditor) GlifexEditor.setValue(src); else document.getElementById("editor").value = src; }, JS_FIB);
  await page.locator("#reveal-btn").click();               // gives a declared space bound
  await expect(page.locator("#reference-panel")).toBeVisible();
  await page.locator("#lab-btn").click();
  await page.locator("#lab .lab-verdict").first().waitFor({ timeout: 75000 });

  // progressive: verdict is up now, with a measuring note, and NO space tab yet
  await expect(page.locator("#lab")).toContainText(/Measuring memory/i);
  expect(await page.locator("[data-labmetric='space']").count()).toBe(0);

  // ...then the background pass lands and the tab appears with the disclaimer
  const spaceTab = page.locator("[data-labmetric='space']");
  await expect(spaceTab).toBeVisible({ timeout: 30000 });
  await spaceTab.click();
  const panel = page.locator("[data-metricpanel='space']");
  await expect(panel).toContainText(/Approximate/i);
  await expect(panel).toContainText("measureUserAgentSpecificMemory");
});

const JS_FIB2 = `module.exports = function solve(c) { let a = 0, b = 1; for (let i = 0; i < c.n; i++) { const t = a + b; a = b; b = t; } return a; };`;

test("JS space: honest 'couldn't measure' note when the API yields nothing", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "measureUserAgentSpecificMemory is Chromium-only");
  test.setTimeout(90000);
  // API present (so it's attempted) but every call throws -> 0 samples -> failed state
  await page.addInitScript(() => { performance.measureUserAgentSpecificMemory = () => { throw new DOMException("not available", "SecurityError"); }; });
  await page.goto("http://localhost:8080/");
  await page.locator('#problem-list li:has-text("Fibonacci")').click();
  await page.evaluate((src) => { if (window.GlifexEditor) GlifexEditor.setValue(src); else document.getElementById("editor").value = src; }, JS_FIB2);
  await page.locator("#reveal-btn").click();
  await expect(page.locator("#reference-panel")).toBeVisible();
  await page.locator("#lab-btn").click();
  await page.locator("#lab .lab-verdict").first().waitFor({ timeout: 75000 });
  // never blank about memory: shows an honest failure line, and no tab
  await expect(page.locator("#lab")).toContainText(/couldn't get a reliable reading/i, { timeout: 30000 });
  await expect(page.locator("[data-labmetric='space']")).toHaveCount(0);
});

test("JS space: prompts to reveal when analyzed without a declared bound", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "measureUserAgentSpecificMemory is Chromium-only");
  test.setTimeout(90000);
  await page.addInitScript(() => { performance.measureUserAgentSpecificMemory = async () => ({ bytes: 1000000 }); });
  await page.goto("http://localhost:8080/");
  await page.locator('#problem-list li:has-text("Fibonacci")').click();
  await page.evaluate((src) => { if (window.GlifexEditor) GlifexEditor.setValue(src); else document.getElementById("editor").value = src; }, JS_FIB2);
  // NO reveal -> empirical-match, no declaredSpace -> needs-reveal status
  await page.locator("#lab-btn").click();
  await page.locator("#lab .lab-verdict").first().waitFor({ timeout: 75000 });
  await expect(page.locator("#lab")).toContainText(/Reveal a reference solution to also measure/i);
});
