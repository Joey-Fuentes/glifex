// E2E for the Glifex playground. The crown jewel is the OFFLINE test: it loads
// the app, cuts the network, and proves a problem still runs green — turning
// the project's core promise ("offline === hosted") into a regression test.
//
// Wasm-aware conventions (apply when WASM runtimes are vendored):
//  - never wait on 'networkidle'; assert on app-set ready signals instead
//  - capture pageerror/console: wasm traps have opaque stacks otherwise
const { test, expect } = require("./coi-fixtures");

test.beforeEach(async ({ page }) => {
  // Surface wasm traps and JS errors in test output instead of silent failure.
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[console]", msg.text());
  });
});

test("playground loads and lists problems", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#problem-list li").first()).toBeVisible();
  await expect(page.locator("#problem-title")).not.toHaveText("Loading…");
});

test("running the shipped JavaScript clean solution passes all cases", async ({ page }) => {
  await page.goto("/");
  await page.locator("#problem-list li").first().click();
  await page.locator("#lang-select").selectOption("javascript");
  // practice ships as a blank stub (worked_example policy reversal) -- fill
  // in the real, shipped `clean` solution, so this test proves the
  // playground engine itself works, not that practice happens to be solved.
  const source = await page.evaluate(async () => {
    const corpus = await (await fetch("problems.generated.json")).json();
    const p = corpus.problems[0];
    return p.languages.javascript.clean;
  });
  await page.locator("#editor").fill(source);
  await page.locator("#run-btn").click();
  await expect(page.locator(".summary")).toHaveClass(/ok/);
});

test("a wrong solution is flagged, not silently passed", async ({ page }) => {
  await page.goto("/");
  await page.locator("#lang-select").selectOption("javascript");
  await page.locator("#editor").fill("module.exports = () => 'wrong';");
  await page.locator("#run-btn").click();
  await expect(page.locator(".summary")).toHaveClass(/bad/);
});

test("OFFLINE: the playground still runs after the network is cut", async ({ page, context }) => {
  // Load once online (simulates first visit / vendored assets present)…
  await page.goto("/");
  await expect(page.locator("#problem-list li").first()).toBeVisible();

  // practice ships as a blank stub (worked_example policy reversal) -- fetch
  // the real, shipped `clean` solution WHILE STILL ONLINE (this test's claim
  // is "the playground still runs offline," not "problems.generated.json is
  // itself service-worker cached" -- fetching before cutting the network
  // keeps those two concerns separate).
  const source = await page.evaluate(async () => {
    const corpus = await (await fetch("problems.generated.json")).json();
    const p = corpus.problems[0];
    return p.languages.javascript.clean;
  });

  // …then sever the network entirely.
  await context.setOffline(true);

  await page.locator("#lang-select").selectOption("javascript");
  await page.locator("#editor").fill(source);
  await page.locator("#run-btn").click();
  await expect(page.locator(".summary")).toHaveClass(/ok/);

  await context.setOffline(false);
});

test("reveal toggles open/closed with an honest label, never touching the editor", async ({ page }) => {
  await page.goto("/");
  await page.locator("#editor").fill("// my precious draft");
  await page.locator("#reveal-btn").click();
  await expect(page.locator("#reference-panel")).toBeVisible();
  await expect(page.locator("#reveal-btn")).toHaveText("Hide");
  await expect(page.locator("#reference-code")).not.toBeEmpty();
  await page.locator("#reveal-btn").click();                       // toggle CLOSED
  await expect(page.locator("#reference-panel")).toBeHidden();
  await expect(page.locator("#reveal-btn")).toHaveText("Reveal");
  await page.locator("#reveal-btn").click();                       // and OPEN again
  await expect(page.locator("#reference-panel")).toBeVisible();
  await expect(page.locator("#editor")).toHaveValue("// my precious draft");   // draft-safe throughout
});

test("a typed draft survives a full page reload", async ({ page }) => {
  await page.goto("/");
  await page.locator("#editor").fill("module.exports = () => 'my draft';");
  await page.waitForTimeout(700);   // autosave debounce
  await page.reload();
  await expect(page.locator("#editor")).toHaveValue("module.exports = () => 'my draft';");
  await expect(page.locator("#editor-label")).toContainText("draft restored");
});

test("non-vendored language degrades gracefully with CLI guidance", async ({ page }) => {
  await page.goto("/");
  await page.locator("#lang-select").selectOption("go");
  await page.locator("#run-btn").click();
  await expect(page.locator(".needs-runtime")).toContainText("glifex test");
});
