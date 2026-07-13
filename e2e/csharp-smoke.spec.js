// C# runtime smoke (Bx-5) -- proves the vendored .NET-wasm + Roslyn runtime
// compiles AND runs a real solution fully in-browser, through the harness/corpus
// wiring, verdict-identical to the CLI. The managed runner compiles the real CLI
// Harness.cs + ISolution.cs + the editor source (as the practice slot) with
// Roslyn and runs it -- see web/csharp-runtime/Runner.cs (proven end-to-end by
// csharp-runtime-validate before this browser wiring landed).
//
// Single-threaded (the runner disables Roslyn concurrency and publishes with
// InvariantGlobalization), so -- unlike c-smoke -- no SharedArrayBuffer / cross-
// origin-isolation dance is needed. Chromium-only for now; long timeout because
// the first run boots the ~39MB runtime and compiles with Roslyn in wasm.
const { test, expect } = require("@playwright/test");

test.describe("C# runtime (.NET-wasm + Roslyn)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "smoke runs on chromium for now");

  test("problem 001 compiles and runs green through the C# runtime", async ({ page }) => {
    test.setTimeout(300_000);
    // Surface browser + worker console and errors into the CI log -- the worker
    // logs its boot stage, so a stall shows up here even without opening a trace.
    page.on("console", (m) => console.log("[browser:" + m.type() + "] " + m.text()));
    page.on("pageerror", (e) => console.log("[pageerror] " + e.message));
    await page.goto("/");
    await expect(page.locator("#problem-list li").first()).toBeVisible();
    await page.locator('#problem-list li:has-text("Anagram")').click();
    await page.locator("#lang-select").selectOption("csharp");

    // Paste the shipped `clean` reference straight in. The harness finds the
    // solution by ISolution interface (not class name), so any variant's class
    // runs in the practice slot with no rename -- proving a real solution compiles
    // and runs, not that the blank practice stub happens to.
    const source = await page.evaluate(async () => {
      const corpus = await (await fetch("problems.generated.json")).json();
      const p = corpus.problems.find((x) => x.id.indexOf("001") === 0);
      return p.languages.csharp.clean;   // no rename: harness finds the solution by interface, any class name runs
    });
    await page.locator("#editor").fill(source);
    await page.locator("#run-btn").click();

    const summary = page.locator("#results .summary");
    await expect(summary).toBeVisible({ timeout: 290_000 });   // waits out the heavy first-boot
    await expect(summary).toHaveClass(/ok/);                   // ...and every case passed
  });
});
