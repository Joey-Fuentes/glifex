// Shared test base: after every navigation, wait for the cross-origin-isolation
// bootstrap (index.html #coi-boot) to reach its FINAL, non-reloading load --
// signalled by <html data-coi>. On the first visit the app reloads once to
// become isolated; without this wait a test's post-goto action races that reload
// and dies with "execution context destroyed". data-coi is set on the settled
// load whether or not isolation succeeded, so this never hangs.
const base = require("@playwright/test");

const test = base.test.extend({
  page: async ({ page }, use) => {
    const origGoto = page.goto.bind(page);
    page.goto = async (url, opts) => {
      const res = await origGoto(url, opts);
      await page
        .waitForFunction(() => document.documentElement.hasAttribute("data-coi"), null, {
          timeout: 25_000,
          polling: 200,
        })
        .catch(() => {}); // fall through if it never settles; the test will surface it
      return res;
    };
    await use(page);
  },
});

module.exports = { test, expect: base.expect };
