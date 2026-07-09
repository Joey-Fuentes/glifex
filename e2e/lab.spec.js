// L1 -- Complexity Lab smoke. Proves the whole lab path end to end on the
// zero-install JavaScript track: generators -> oracle -> runner -> fitter ->
// verdict card. False-green guard: waits for a .lab-verdict to APPEAR, then
// asserts the upper-bound line is a real verdict (consistent), not an error
// card -- a broken engine or a correctness-gate trip cannot fake a pass.
const { test, expect } = require("@playwright/test");

// A correct one-pass two-sum: O(n) worst, early exit on the easy family --
// exactly the shape the declared bounds in lab-config.mjs describe.
const JS_TWO_SUM = `module.exports = function solve(input) {
  const seen = new Map();
  for (let i = 0; i < input.nums.length; i++) {
    const need = input.target - input.nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(input.nums[i], i);
  }
  return [-1, -1];
};`;

test("Complexity Lab renders a verdict card (JavaScript, Two Sum)", async ({ page }) => {
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  await page.goto("http://localhost:8080/");
  await expect(page.locator("#problem-list li").first()).toBeVisible();
  await page.locator('#problem-list li:has-text("Two Sum")').click();
  await expect(page.locator("#lab-btn")).toBeVisible();

  await page.evaluate((src) => {
    if (window.GlifexEditor) GlifexEditor.setValue(src);
    else document.getElementById("editor").value = src;
  }, JS_TWO_SUM);

  await page.locator("#lab-btn").click();
  const verdicts = page.locator("#lab .lab-verdict");
  await expect(verdicts.first()).toBeVisible({ timeout: 60000 });
  // Upper bound line must be a pass verdict on a correct linear solution.
  await expect(verdicts.first()).toContainText(/Upper bound O\(n\)/, { timeout: 60000 });
  await expect(verdicts.first()).toContainText(/consistent/i);
  // The proof table and chart rendered.
  await expect(page.locator("#lab .lab-table")).toBeVisible();
  await expect(page.locator("#lab svg")).toBeVisible();
});
