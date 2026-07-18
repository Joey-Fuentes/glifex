// Dart runtime smoke (Bx-13b) -- proves the vendored dart2js, self-hosted to JS,
// compiles and runs a real Dart solution fully in-browser, verdict-identical to
// the CLI. dart2js emits plain JS (no wasm, no threads, no SharedArrayBuffer), so
// like rust/go/csharp/java this needs no cross-origin-isolation dance and runs on
// the plain e2e server. Chromium only for now; long timeout because the first run
// fetches the compiler + platform (~5.4MB gzipped) and then compiles in-browser.
// See web/dart-core.mjs, web/dart-worker.js, and docs/dart2js-self-hosted.md.
//
// This spec carries a second test the other language smokes do NOT: a syntax
// error. Every other smoke only ever compiles CORRECT code, so none of them has
// ever proven the path a LEARNER lives in -- the one where the compiler rejects
// their code and they need to read why. That path is the whole point of a
// practice track, and it is the one that was broken through this track's entire
// development: a compile error arrives boxed across the .toJS bridge, and the
// Dart message does NOT survive onto the thrown object -- its .error enumerates
// empty and toStrings to "[object Object]", its .stack is pure frames. The
// diagnostic exists only where gx_core.report print()s it to console during the
// compile, so driveProblem captures console and keeps the reporter's own
// "[error]" lines. verify-dart-worker proves that core headless in node; only a
// real browser proves the learner actually sees the diagnostic. That is this file.
const { test, expect } = require("@playwright/test");

test.describe("Dart runtime (dart2js-in-browser)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "smoke runs on chromium for now");

  test("problem 001 runs green through the Dart runtime", async ({ page }) => {
    test.setTimeout(300_000);
    page.on("console", (m) => console.log("[browser:" + m.type() + "] " + m.text()));
    page.on("pageerror", (e) => console.log("[pageerror] " + e.message));
    await page.goto("/");
    await expect(page.locator("#problem-list li").first()).toBeVisible();
    await page.locator('#problem-list li:has-text("Anagram")').click();
    await page.locator("#lang-select").selectOption("dart");

    // Paste the shipped clean reference straight in -- proves a real solution
    // compiles and runs, not that the blank practice stub happens to.
    const source = await page.evaluate(async () => {
      const corpus = await (await fetch("problems.generated.json")).json();
      const p = corpus.problems.find((x) => x.id.indexOf("001") === 0);
      return p.languages.dart.clean;
    });
    await page.locator("#editor").fill(source);
    await page.locator("#run-btn").click();

    const summary = page.locator("#results .summary");
    await expect(summary).toHaveClass(/ok/, { timeout: 280_000 });
    await expect(summary).toContainText("7/7 passed");
  });

  test("a syntax error shows the compiler's diagnostic, not a boxed object", async ({ page }) => {
    test.setTimeout(300_000);
    page.on("console", (m) => console.log("[browser:" + m.type() + "] " + m.text()));
    page.on("pageerror", (e) => console.log("[pageerror] " + e.message));
    await page.goto("/");
    await expect(page.locator("#problem-list li").first()).toBeVisible();
    await page.locator('#problem-list li:has-text("Anagram")').click();
    await page.locator("#lang-select").selectOption("dart");

    // A dropped semicolon -- the single most common compile error a learner will
    // hit. The point is not that it fails; it is WHAT they see when it does.
    const broken = "dynamic solve(Map<String, dynamic> c) {\n  return false\n}\n";
    await page.locator("#editor").fill(broken);
    await page.locator("#run-btn").click();

    // A compile error renders as <div class="summary bad">{error}</div> (app.js).
    const summary = page.locator("#results .summary");
    await expect(summary).toHaveClass(/bad/, { timeout: 280_000 });

    const shown = (await summary.textContent()) || "";

    // POSITIVE assertions -- the diagnostic must actually SAY something. An
    // absent-X check passes vacuously on garbage; "[object Object]" once passed
    // three such checks. So first demand the compiler's own words and a position
    // remapped into the learner's file, exactly as verify-dart-worker demands
    // headless.
    expect(shown).toMatch(/Expected/);
    expect(shown).toMatch(/practice\.dart:\d+:\d+/);

    // THEN the absence checks, which now cannot pass vacuously: none of the
    // failure modes this track worked through may reach the learner.
    expect(shown).not.toContain("[object Object]");
    expect(shown).not.toContain("Dart exception thrown from converted Future");
    expect(shown).not.toContain("org-dartlang-gx");
    expect(shown).not.toMatch(/\[crash\]/);
    expect(shown).not.toMatch(/\[verbose info\]/);
    expect(shown).not.toMatch(/could not decode/);
  });
});
