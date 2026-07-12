// Data-driven UI surfacing test: for EVERY algorithm problem in the corpus, the
// language dropdown must offer exactly that problem's baked corpus languages --
// nothing dropped, nothing extra. It loops over the corpus (not a hard-coded
// list), so adding Z80/SM83/etc. needs ZERO test edits: the moment a language is
// baked for a problem, this test demands the dropdown show it, and fails if the
// UI drops it. (The corpus-integrity unit test guards the layer above -- that a
// declared+runnable language actually makes it INTO the corpus.)
const { test, expect } = require("./coi-fixtures");

test.describe("language dropdown surfaces the corpus", () => {
  test("every problem's dropdown == its baked corpus languages", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.state && window.state.corpus, null, { timeout: 15000 });
    const mismatches = await page.evaluate(async () => {
      const out = [];
      for (const p of window.state.corpus.problems.filter((x) => x.track === "algorithm")) {
        window.selectProblem(p.id);
        await new Promise((r) => setTimeout(r, 30));
        const opts = [...document.querySelectorAll("#lang-select option")].map((o) => o.value).sort();
        const expected = Object.keys(p.languages).sort();
        if (JSON.stringify(opts) !== JSON.stringify(expected)) {
          out.push(`${p.id}: dropdown [${opts.join(",")}] != corpus [${expected.join(",")}]`);
        }
      }
      return out;
    });
    expect(mismatches.join(" | ")).toBe("");
  });
});
