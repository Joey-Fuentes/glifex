// Java runtime smoke (Bx-8b) -- the coverage this track never had.
//
// e2e/runtimes.spec.js and lab-space.spec.js mention Java, but nothing exercised
// the vendored teavm-javac artifacts end to end. That mattered the moment Bx-8b
// swapped them: until now they were a hand-uploaded blob from teavm.org with no
// version; they are now built from konsoletyper/teavm-javac at a pinned SHA. The
// swap was measured inert -- both artifact sets pass 001/002/003 x four variants
// with identical verdicts, in node and in a real Chromium module worker, and both
// compile all ten ceiling probes -- but "measured once in a spike" is not
// "guarded in CI", and this is the difference.
//
// teavm-javac's javac has a low compile ceiling, which is why java-worker.js
// keeps the generated program small and fixed-size and feeds cases at runtime.
// So this asserts a real shipped solution compiles AND answers -- the failure a
// ceiling regression would actually produce.
//
// Single-threaded WasmGC: no SharedArrayBuffer, no cross-origin isolation needed.
// Chromium-only (the only browser installed locally); long timeout because the
// first run fetches ~6.7MB and compiles javac-in-wasm.
//
// coi-fixtures, NOT bare @playwright/test. The app still runs its cross-origin
// isolation bootstrap on first load and RELOADS once, and the fixture waits for
// <html data-coi> -- the settled, non-reloading load. Its own comment names the
// exact failure this spec hit without it: "a test's post-goto action races that
// reload and dies with execution context destroyed". rust/csharp/go-smoke use
// bare @playwright/test and survive only because they wait on a locator straight
// after goto, which rides the reload out by accident. The manifest assertion
// below evaluates immediately, so accident is not available to it.
const { test, expect } = require("./coi-fixtures");

test.describe("Java runtime (teavm-javac, built from pinned source)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "smoke runs on chromium for now");

  test("problem 002 runs green through the Java runtime", async ({ page }) => {
    test.setTimeout(300_000);
    page.on("pageerror", (e) => console.log("[pageerror] " + e.message));
    await page.goto("/");
    await expect(page.locator("#problem-list li").first()).toBeVisible();
    await page.locator('#problem-list li:has-text("Two Sum")').click();
    await page.locator("#lang-select").selectOption("java");

    // The shipped shipped clean reference, not the blank practice stub: a stub proves
    // the plumbing, a real solution proves the compiler.
    const source = await page.evaluate(async () => {
      const corpus = await (await fetch("problems.generated.json")).json();
      const p = corpus.problems.find((x) => x.id.indexOf("002") === 0);
      return p.languages.java.clean;
    });
    await page.locator("#editor").fill(source);
    await page.locator("#run-btn").click();

    const summary = page.locator("#results .summary");
    await expect(summary).toHaveClass(/ok/, { timeout: 280_000 });
    await expect(summary).toContainText("passed");
  });

  test("the vendored toolchain is the one we built, not a fetched blob", async ({ page }) => {
    // Cheap, and it is the whole point of Bx-8b: if this ever reports a
    // playground snapshot again, the vendor step regressed to fetching from
    // teavm.org and nobody would otherwise notice -- the artifacts look alike.
    await page.goto("/");
    const mf = await page.evaluate(async () => {
      const r = await fetch("vendor/java/manifest.json");
      return r.ok ? r.json() : null;
    });
    expect(mf, "vendor/java/manifest.json must exist").toBeTruthy();
    expect(mf.source).toBe("konsoletyper/teavm-javac");
    expect(mf.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(mf.route).toContain("built from pinned source");
  });
});
