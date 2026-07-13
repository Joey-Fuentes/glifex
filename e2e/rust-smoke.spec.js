// Rust runtime smoke (Bx-6) -- proves the vendored Miri-in-wasm interpreter runs
// a real Rust solution fully in-browser, verdict-identical to the CLI. The worker
// synthesises a single-file program (json.rs inlined + the editor's solve + the
// cases embedded + a harness main) and interprets it with Miri against the
// minimal vendored sysroot -- see web/rust-worker.js.
//
// Miri runs on a shared:false linear memory with a single-threaded shim, so --
// like csharp-smoke -- no SharedArrayBuffer / cross-origin-isolation dance is
// needed (verified against the plain e2e server). Chromium-only for now; long
// timeout because the first run fetches the sysroot + compiles miri.wasm.
const { test, expect } = require("@playwright/test");

test.describe("Rust runtime (Miri-in-wasm)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "smoke runs on chromium for now");

  test("problem 001 runs green through the Rust runtime", async ({ page }) => {
    test.setTimeout(300_000);
    page.on("console", (m) => console.log("[browser:" + m.type() + "] " + m.text()));
    page.on("pageerror", (e) => console.log("[pageerror] " + e.message));
    await page.goto("/");
    await expect(page.locator("#problem-list li").first()).toBeVisible();
    await page.locator('#problem-list li:has-text("Anagram")').click();
    await page.locator("#lang-select").selectOption("rust");

    // Paste the shipped `clean` reference straight in -- proves a real solution
    // is interpreted (not that the blank practice stub happens to).
    const source = await page.evaluate(async () => {
      const corpus = await (await fetch("problems.generated.json")).json();
      const p = corpus.problems.find((x) => x.id.indexOf("001") === 0);
      return p.languages.rust.clean;
    });
    await page.locator("#editor").fill(source);
    await page.locator("#run-btn").click();

    const summary = page.locator("#results .summary");
    await expect(summary).toHaveClass(/ok/, { timeout: 280_000 });
    await expect(summary).toContainText("7/7 passed");
  });
});
