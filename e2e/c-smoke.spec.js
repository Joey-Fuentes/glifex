// Bx-3 C/C++ runtime -- proves problems compile AND run green in-browser through
// the vendored Wasmer WASIX clang container, under PR-1's cross-origin isolation.
// Chromium-only for now (heavy); Firefox once these are solid.
const { test, expect } = require("@playwright/test");

test.describe("C / C++ runtime (Wasmer WASIX clang)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "runs on chromium for now");

  async function runProblem001(page, lang) {
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();   // isolate (SharedArrayBuffer) before the app touches the toolchain
    await expect(page.locator("#problem-list li").first()).toBeVisible();
    await page.locator('#problem-list li:has-text("Anagram")').click();
    await page.locator("#lang-select").selectOption(lang);
    await page.locator("#run-btn").click();
    const summary = page.locator("#results .summary");
    await expect(summary).toBeVisible({ timeout: 360_000 });   // compiled + ran the harness
    await expect(summary).toHaveClass(/ok/);                   // ...and every case passed
  }

  test("problem 001 compiles and runs green in C", async ({ page }) => {
    test.setTimeout(240_000);
    await runProblem001(page, "c");
  });

  test("problem 001 compiles and runs green in C++", async ({ page }) => {
    test.setTimeout(420_000);
    await runProblem001(page, "cpp");
  });
});
