// Frontend-track E2E: proves the reference solution passes and the blank
// starter fails, against REAL browser computed styles (the mock-DOM unit test
// covers logic; this covers actual CSS resolution — flex, gap, cascade).
const { test, expect } = require("@playwright/test");

test("frontend problem: clean solution passes all assertions", async ({ page }) => {
  await page.goto("/");
  await page.locator('#problem-list li:has-text("Card")').click();
  // v2 reveal is a draft-safe side panel — it never touches the editor.
  // To run the reference, copy it from the panel into the editor explicitly
  // (which also exercises the panel + tab switching end-to-end).
  await page.locator("#reveal-btn").click();
  await page.locator("#ref-clean").click();
  // #reference-code is a readonly TEXTAREA (native select-all containment),
  // so its content is a form value, not DOM text -- read it with inputValue().
  const reference = await page.locator("#reference-code").inputValue();
  await page.locator("#editor").fill(reference);
  await page.locator("#run-btn").click();
  await expect(page.locator(".summary")).toHaveClass(/ok/);
});

test("frontend problem: blank starter fails assertions with details", async ({ page }) => {
  await page.goto("/");
  await page.locator('#problem-list li:has-text("Card")').click();
  await page.locator("#run-btn").click();
  await expect(page.locator(".summary")).toHaveClass(/bad/);
  await expect(page.locator(".case.fail").first()).toBeVisible();
});

test("frontend problem: live preview renders while typing", async ({ page }) => {
  await page.goto("/");
  await page.locator('#problem-list li:has-text("Card")').click();
  await page.locator("#editor").fill("<h1>preview me</h1>");
  await expect(page.frameLocator("#preview").locator("h1")).toHaveText("preview me");
});
