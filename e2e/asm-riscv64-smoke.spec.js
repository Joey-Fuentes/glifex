// riscv64 runtime smoke (Bx-10b) -- proves the vendored toolchain runs a real
// RV64GC solution fully in-browser, verdict-identical to the CLI.
//
// Two emulators, deliberately: Blink (the Bx-7 x86-64 emulator, already
// vendored) runs the guest riscv64 as+ld -- x86-64 musl-static binaries that
// EMIT riscv64 -- and libriscv, compiled to wasm32, executes the linked ELF.
// Blink itself never executes riscv64. See web/asm-riscv64-core.mjs and
// docs/libriscv-riscv64.md.
//
// Simpler than the arm64 path: libriscv takes the ELF whole, so there is no
// PT_LOAD relocation and no 4K-alignment arithmetic.
//
// Uses coi-fixtures like the other asm tracks (asm-6502, sm83, c, arm64).
// riscv64 does not REQUIRE isolation -- it is single-threaded with no
// SharedArrayBuffer -- but the live site IS isolated and the app reloads once to
// get there. Testing the same bootstrap users get is the point.
//
// Long timeout: a solve pays the guest assemble + link under Blink before a
// single instruction runs.
const { test, expect } = require("./coi-fixtures");

test.describe("riscv64 runtime (guest as+ld under Blink, executed on libriscv)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "smoke runs on chromium for now");

  test("problem 001 runs green through the riscv64 runtime", async ({ page }) => {
    test.setTimeout(300_000);
    page.on("console", (m) => console.log("[browser:" + m.type() + "] " + m.text()));
    page.on("pageerror", (e) => console.log("[pageerror] " + e.message));
    await page.goto("/");
    await expect(page.locator("#problem-list li").first()).toBeVisible();
    await page.locator('#problem-list li:has-text("Anagram")').click();
    await page.locator("#lang-select").selectOption("asm-riscv64");

    // The shipped `clean` reference, not the blank practice stub -- proves a real
    // solution is assembled, linked and executed, rather than that an empty one
    // trivially "passes".
    const source = await page.evaluate(async () => {
      const corpus = await (await fetch("problems.generated.json")).json();
      const p = corpus.problems.find((x) => x.id.indexOf("001") === 0);
      return p.languages["asm-riscv64"].clean;
    });
    await page.locator("#editor").fill(source);
    await page.locator("#run-btn").click();

    const summary = page.locator("#results .summary");
    await expect(summary).toHaveClass(/ok/, { timeout: 280_000 });
    await expect(summary).toContainText("7/7 passed");
  });
});
