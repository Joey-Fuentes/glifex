// B1 — WASM runtime smoke coverage. Proves each vendored browser runtime
// (TypeScript, Python/Pyodide, Ruby/ruby.wasm, Postgres/PGlite) actually
// COMPILES-AND-RUNS a real problem green — so a regression in runtimes.js's
// loaders fails CI instead of sailing through untested.
//
// Efficiency: one shared page load, each runtime lazy-initialized exactly once
// (test.step keeps per-runtime labels in the report without re-loading the app).
//
// False-green guard: we wait for .summary to APPEAR (runtime loaded + ran) then
// assert it resolves to /ok/ (every case passed). A non-vendored runtime yields
// .needs-runtime (no .summary → times out) and a broken one yields .summary.bad
// (/ok/ fails) — either way the test goes red. A dead runtime cannot fake a pass.
const { test, expect } = require("@playwright/test");

test("every vendored WASM runtime compiles-and-runs a problem green", async ({ page }) => {
  test.setTimeout(240_000);   // 4 runtimes; first-load download+init is slow in CI
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.error("[console]", m.text()); });

  await page.goto("/");
  await expect(page.locator("#problem-list li").first()).toBeVisible();
  await page.locator('#problem-list li:has-text("Anagram")').click();

  const summary = page.locator("#results .summary");

  // Algorithm track: select the language, its practice solution auto-loads,
  // Run compiles+executes it in that runtime.
  for (const lang of ["typescript", "python", "ruby"]) {
    await test.step(`${lang} runs green`, async () => {
      await page.locator("#lang-select").selectOption(lang);
      await page.locator("#run-btn").click();
      await expect(summary).toBeVisible({ timeout: 120_000 });   // runtime loaded + ran
      await expect(summary).toHaveClass(/ok/);                   // ...and every case passed
    });
  }

  // Database track: PGlite (Postgres-in-WASM) runs the practice SQL.
  await test.step("postgres (pglite) runs green", async () => {
    await page.locator('#problem-list li:has-text("Users With No Orders")').click();
    await page.locator("#run-btn").click();
    await expect(summary).toBeVisible({ timeout: 120_000 });
    await expect(summary).toHaveClass(/ok/);
  });
});
