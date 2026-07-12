// PR-1 (Bx-3 prerequisite) -- proves the service worker makes the site
// cross-origin isolated so SharedArrayBuffer is available, which the WASIX C/C++
// toolchain (Bx-3) requires. GitHub Pages can't send COOP/COEP headers, so sw.js
// stamps them onto every response; a page only becomes isolated once the SW
// controls its navigation, so we register (via the app's boot), wait for the SW
// to be active, then reload and assert isolation + that the app still renders.
//
// Deterministic by design: an explicit reload (not a racy first-visit auto-reload),
// so it can't disrupt the other specs, which run non-isolated and unchanged.
const { test, expect } = require("./coi-fixtures");

test("service worker makes the page cross-origin isolated (SharedArrayBuffer available)", async ({ page }) => {
  await page.goto("/");
  // sw.js is registered on app boot; wait until it's active, then reload so the
  // navigation is served through the SW and gets the COOP/COEP headers.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();

  // The site still renders under cross-origin isolation (nothing COEP-blocked).
  await expect(page.locator("#problem-list li").first()).toBeVisible();

  const state = await page.evaluate(() => ({
    isolated: self.crossOriginIsolated === true,
    hasSAB: typeof SharedArrayBuffer !== "undefined",
  }));
  expect(state.isolated).toBe(true);
  expect(state.hasSAB).toBe(true);
});
