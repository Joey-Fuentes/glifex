// Proves the cross-origin isolation bootstrap (index.html #coi-boot): a
// plain first visit becomes crossOriginIsolated on its own, with NO manual
// reload -- boot() registers the SW, waits for it to control the page, then
// reloads once to pick up the COOP/COEP headers. This is what makes isolation
// site-wide (high-res timing for the Lab + measureUserAgentSpecificMemory for
// JS/TS space), not just when the C toolchain is run.
//
// It also guards the loop concern: expect.poll succeeding means the app reaches
// a STABLE isolated state (it isn't stuck reloading), and the list staying
// visible means nothing was COEP-blocked.
const { test, expect } = require("./coi-fixtures");

test("app proactively becomes cross-origin isolated with no manual reload", async ({ page }) => {
  await page.goto("/");
  // Do NOT reload here -- boot() must do it itself. Poll until isolated.
  await expect
    .poll(() => page.evaluate(() => self.crossOriginIsolated === true), { timeout: 20_000 })
    .toBe(true);
  await expect(page.locator("#problem-list li").first()).toBeVisible();
  const hasSAB = await page.evaluate(() => typeof SharedArrayBuffer !== "undefined");
  expect(hasSAB).toBe(true);
});
