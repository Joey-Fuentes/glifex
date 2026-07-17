// Go runtime smoke (Bx-12) -- proves the vendored gc toolchain compiles and runs
// a real Go solution fully in-browser, verdict-identical to the CLI. The worker
// hands compile.wasm the editor's source verbatim as its own file in the package,
// alongside a synthesised harness (cases embedded, no file I/O), links with
// link.wasm, and runs the result -- all over one virtual FS. There is no cmd/go:
// it builds by forking and os/exec does not exist under wasip1, so JS drives.
// See web/go-worker.js and docs/go-self-hosted.md.
//
// The linked wasm is single-threaded and runs on a shared:false memory, so --
// like rust-smoke and csharp-smoke -- no SharedArrayBuffer / cross-origin-
// isolation dance is needed (verified against the plain e2e server). Chromium
// only for now; long timeout because the first run fetches the ~80MB payload and
// compiles a 42MB compile.wasm.
const { test, expect } = require("@playwright/test");

test.describe("Go runtime (gc-in-wasm)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "smoke runs on chromium for now");

  test("problem 001 runs green through the Go runtime", async ({ page }) => {
    test.setTimeout(300_000);
    page.on("console", (m) => console.log("[browser:" + m.type() + "] " + m.text()));
    page.on("pageerror", (e) => console.log("[pageerror] " + e.message));
    await page.goto("/");
    await expect(page.locator("#problem-list li").first()).toBeVisible();
    await page.locator('#problem-list li:has-text("Anagram")').click();
    await page.locator("#lang-select").selectOption("go");

    // Paste the shipped `clean` reference straight in -- proves a real solution
    // compiles and runs, not that the blank practice stub happens to.
    const source = await page.evaluate(async () => {
      const corpus = await (await fetch("problems.generated.json")).json();
      const p = corpus.problems.find((x) => x.id.indexOf("001") === 0);
      return p.languages.go.clean;
    });
    await page.locator("#editor").fill(source);
    await page.locator("#run-btn").click();

    const summary = page.locator("#results .summary");
    await expect(summary).toHaveClass(/ok/, { timeout: 280_000 });
    await expect(summary).toContainText("7/7 passed");
  });
});
