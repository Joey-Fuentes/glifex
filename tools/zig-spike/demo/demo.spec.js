// Bx-11 spike: a REAL browser compiles Zig. Chromium, headless, no COI.
//
// zig.wasm is single-threaded, so like rust-smoke and csharp-smoke this needs no
// SharedArrayBuffer / cross-origin-isolation dance -- a plain static server is
// enough. Long timeout because the page fetches a multi-megabyte compiler and a
// std tarball, then actually compiles.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

test("zig.wasm compiles Zig source and the result runs, entirely in the page", async ({ page }) => {
  test.setTimeout(300_000);
  page.on("console", (m) => console.log("[browser:" + m.type() + "] " + m.text()));
  page.on("pageerror", (e) => console.log("[pageerror] " + e.message));

  // The gate already decided which spelling this compiler accepts and what it
  // must print. Reading it here keeps the assertion honest instead of hoping.
  const want = fs.readFileSync(path.join(__dirname, "expected.txt"), "utf8").trim();
  console.log("[spec] expecting the in-browser program to print: " + JSON.stringify(want));

  await page.goto("/index.html");
  await expect(page.locator("#status")).toHaveText("ready", { timeout: 180_000 });
  await page.locator("#go").click();
  await expect(page.locator("#status")).toHaveText("done", { timeout: 240_000 });
  await expect(page.locator("#result")).toHaveText(want);

  // A result with no compile is not a demo: assert the page really produced a
  // main.wasm of non-trivial size, so a cached or faked answer cannot pass.
  const outsize = Number(await page.locator("#outsize").textContent());
  const ms = Number(await page.locator("#ms").textContent());
  console.log("[spec] main.wasm=" + outsize + " bytes, compile=" + ms + " ms");
  expect(outsize).toBeGreaterThan(500);
  // Absolute, via GITHUB_WORKSPACE. Round 6 wrote a RELATIVE "zig-spike-out/demo.png"
  // while playwright's cwd is tools/zig-spike/demo, so the screenshot landed at
  // tools/zig-spike/demo/zig-spike-out/demo.png -- outside the upload path -- and
  // the one visual proof of the whole spike never left the runner.
  const shot = path.join(process.env.GITHUB_WORKSPACE || path.join(__dirname, "..", "..", ".."),
                         "zig-spike-out", "demo.png");
  await page.screenshot({ path: shot, fullPage: true });
  console.log("[spec] screenshot -> " + shot);
});
