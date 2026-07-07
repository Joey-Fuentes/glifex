// B1 + Bx-1 — WASM runtime smoke coverage. Proves each vendored browser runtime
// (TypeScript, Python/Pyodide, Ruby/ruby.wasm, Postgres/PGlite, WAT/wabt) actually
// COMPILES-AND-RUNS a real problem green — so a regression in runtimes.js's loaders
// fails CI instead of sailing through untested.
//
// Structure: a SERIAL describe sharing ONE page (opened once in beforeAll), so each
// runtime lazy-initializes exactly once — but every runtime is its own named test,
// so the CI report shows independent green/red lines.
//
// False-green guard: wait for .summary to APPEAR (runtime loaded + ran), then assert
// /ok/ (every case passed). A non-vendored runtime yields .needs-runtime (no .summary
// → times out); a broken one yields .summary.bad (/ok/ fails). A dead runtime cannot
// fake a pass.
const { test, expect } = require("@playwright/test");

// A correct iterative nth-Fibonacci in WebAssembly Text — exercises the WAT runtime
// end to end (wabt assembles it → instantiate → call solve). Kept inline so the test
// owns its input and doesn't depend on reveal-panel internals.
const WAT_FIB = `(module
  (func (export "solve") (param $n i32) (result i32)
    (local $a i32) (local $b i32) (local $t i32)
    (local.set $b (i32.const 1))
    (block $done
      (loop $loop
        (br_if $done (i32.eqz (local.get $n)))
        (local.set $t (i32.add (local.get $a) (local.get $b)))
        (local.set $a (local.get $b))
        (local.set $b (local.get $t))
        (local.set $n (i32.sub (local.get $n) (i32.const 1)))
        (br $loop)))
    (local.get $a)))`;

test.describe("WASM runtimes smoke", () => {
  test.describe.configure({ mode: "serial" });

  let page, summary;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();   // one page shared across the serial tests
    page.on("pageerror", (e) => console.error("[pageerror]", e.message));
    page.on("console", (m) => { if (m.type() === "error") console.error("[console]", m.text()); });
    await page.goto("http://localhost:8080/");   // manual page → absolute URL (matches config webServer)
    await expect(page.locator("#problem-list li").first()).toBeVisible();
    await page.locator('#problem-list li:has-text("Anagram")').click();
    summary = page.locator("#results .summary");
  });

  test.afterAll(async () => { await page.close(); });

  // Algorithm track: picking the language auto-loads its practice solution.
  for (const lang of ["typescript", "python", "ruby", "php"]) {
    test(`${lang} compiles-and-runs green`, async () => {
      test.setTimeout(120_000);   // first-load download+init is slow in CI
      await page.locator("#lang-select").selectOption(lang);
      await page.locator("#run-btn").click();
      await expect(summary).toBeVisible({ timeout: 120_000 });   // runtime loaded + ran
      await expect(summary).toHaveClass(/ok/);                   // ...and every case passed
    });
  }

  // WAT: numeric problem (Fibonacci). Fill a known-good solution and run it through
  // the wabt-backed WAT runtime.
  test("wat (webassembly text) compiles-and-runs green", async () => {
    test.setTimeout(120_000);
    await page.locator('#problem-list li:has-text("Fibonacci")').click();
    await page.locator("#lang-select").selectOption("wat");
    await page.locator("#editor").fill(WAT_FIB);
    await page.locator("#run-btn").click();
    await expect(summary).toBeVisible({ timeout: 120_000 });
    await expect(summary).toHaveClass(/ok/);
  });

  // Database track: PGlite (Postgres-in-WASM) runs the practice SQL.
  test("postgres (pglite) runs green", async () => {
    test.setTimeout(120_000);
    await page.locator('#problem-list li:has-text("Users With No Orders")').click();
    await page.locator("#run-btn").click();
    await expect(summary).toBeVisible({ timeout: 120_000 });
    await expect(summary).toHaveClass(/ok/);
  });
});
