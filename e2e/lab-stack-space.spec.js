// L4 heap+stack dual render. Pyodide won't load in this sandbox, so we fake a
// Python-style runtime that emits BOTH space (heap, ~O(n)) and spaceStack
// (recursion depth, ~O(1)) per case -- exercising the two-line chart, the two
// verdict lines ([heap] + [stack]), and the recursion-depth step-ratio table
// without needing the real interpreter. (The real tracemalloc/settrace numbers
// are browser/CI-verified.)
const { test, expect } = require("./coi-fixtures");
const PY = "def solve(c):\n    return sorted(c['s']) == sorted(c['t'])\n";

test("Python-style heap+stack: two lines, [heap]+[stack] verdicts, depth table", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "one engine is enough for a render check");
  test.setTimeout(90000);
  await page.goto("http://localhost:8080/");
  await page.waitForFunction(() => window.state && window.state.corpus, null, { timeout: 15000 });
  // Fake the python runtime: heap grows O(n) with input size, stack stays flat O(1).
  await page.evaluate(() => {
    window.Runtimes.get = async () => ({
      run: async (_src, cases) => ({
        results: cases.map((c, i) => {
          const n = (c.input && (c.input.s ? c.input.s.length : c.input.n)) || 1;
          return { i, ok: true, got: c.expected, expected: c.expected, tNs: n * 10, space: n * 8, spaceStack: 1 };
        }),
        nsPerCase: 1000,
      }),
    });
  });
  await page.evaluate(() => window.selectProblem("001-anagram-detection"));
  await page.locator("#lang-select").selectOption("python");
  await page.evaluate((src) => { if (window.GlifexEditor) GlifexEditor.setValue(src); else document.getElementById("editor").value = src; }, PY);
  await page.locator("#reveal-btn").click();
  await expect(page.locator("#reference-panel")).toBeVisible();
  await page.locator("#lab-btn").click();
  await page.locator("#lab .lab-verdict").first().waitFor({ timeout: 60000 });
  // both verdict lines present
  await expect(page.locator("#lab")).toContainText(/\[heap\]/);
  await expect(page.locator("#lab")).toContainText(/\[stack\]/);
  // space tab -> chart legend has the stack key + the recursion-depth table
  const tab = page.locator("[data-labmetric='space']");
  await expect(tab).toBeVisible({ timeout: 15000 });
  await tab.click();
  const panel = page.locator("[data-metricpanel='space']");
  await expect(panel).toContainText(/max recursion depth/i);
  await expect(panel).toContainText(/Recursion-depth step-ratio/i);
  await expect(panel).toContainText(/measured exactly/i);
});
