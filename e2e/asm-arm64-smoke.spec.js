// arm64 runtime smoke (Bx-10) -- proves the vendored toolchain runs a real
// aarch64 solution fully in-browser, verdict-identical to the CLI.
//
// Two emulators, deliberately: Blink (the Bx-7 x86-64 emulator, already
// vendored) runs the guest aarch64 as+ld -- x86-64 musl-static binaries that
// EMIT aarch64 -- and VIXL's AArch64 Simulator in wasm32 executes the linked
// result, relocated into a 4K-aligned malloc'd base. Blink itself never
// executes arm64. See web/asm-arm64-core.mjs and docs/vixl-arm64.md.
//
// Uses coi-fixtures like the other asm tracks (asm-6502, sm83, c). arm64 does
// not REQUIRE isolation -- it is single-threaded with no SharedArrayBuffer, and
// runs 7/7 on a plain server -- but the live site IS isolated, and the app
// reloads once to get there. Testing the same bootstrap the users get is the
// point; a plain-server pass would prove something nobody experiences.
//
// Long timeout: a solve pays ~1.9s assemble + ~1.2s link under Blink before a
// single instruction runs, plus a one-time VIXL init.
const { test, expect } = require("./coi-fixtures");

test.describe("arm64 runtime (guest as+ld under Blink, executed on VIXL)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "smoke runs on chromium for now");

  test("problem 001 runs green through the arm64 runtime", async ({ page }) => {
    test.setTimeout(300_000);
    page.on("console", (m) => console.log("[browser:" + m.type() + "] " + m.text()));
    page.on("pageerror", (e) => console.log("[pageerror] " + e.message));
    await page.goto("/");
    await expect(page.locator("#problem-list li").first()).toBeVisible();
    await page.locator('#problem-list li:has-text("Anagram")').click();
    await page.locator("#lang-select").selectOption("asm-arm64");

    // The shipped `clean` reference, not the blank practice stub -- proves a
    // real solution is assembled, linked and executed, rather than that an
    // empty one trivially "passes".
    const source = await page.evaluate(async () => {
      const corpus = await (await fetch("problems.generated.json")).json();
      const p = corpus.problems.find((x) => x.id.indexOf("001") === 0);
      return p.languages["asm-arm64"].clean;
    });
    await page.locator("#editor").fill(source);
    await page.locator("#run-btn").click();

    const summary = page.locator("#results .summary");
    await expect(summary).toHaveClass(/ok/, { timeout: 280_000 });
    await expect(summary).toContainText("7/7 passed");
  });
});
