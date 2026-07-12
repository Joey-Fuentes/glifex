// Unit test for the deploy-time asset stamper. Runs in CI (lint job) so the
// transform can't silently rot — e.g. a new <script> that forgets to stamp.
import assert from "node:assert";
import { execSync } from "node:child_process";
import { stampHtml, stampSw } from "./stamp.mjs";

const sha = "abc1234";
const html = [
  '<link rel="stylesheet" href="style.css" />',
  '<a href="privacy.html">P</a> <a href="https://github.com/x/y">G</a>',
  '<script src="app.js"></script>',
  '<script src="wiring.js"></script>',
].join("\n");
const h = stampHtml(html, sha);
assert(h.includes(`href="style.css?v=${sha}"`), "css stamped");
assert(h.includes(`src="app.js?v=${sha}"`), "app.js stamped");
assert(h.includes(`src="wiring.js?v=${sha}"`), "wiring stamped");
assert(h.includes('href="privacy.html"'), "local .html untouched");
assert(h.includes('href="https://github.com/x/y"'), "external link untouched");
assert.strictEqual(stampHtml(h, sha), h, "html stamping idempotent");

const sw = [
  'const CACHE = "glifex-dev";',
  'const ASSETS = ["./", "index.html", "style.css", "app.js", "lab-engine.mjs", "problems.generated.json", "privacy.html"];',
].join("\n");
const s = stampSw(sw, sha);
assert(s.includes(`const CACHE = "glifex-${sha}";`), "cache name stamped");
assert(s.includes(`"app.js?v=${sha}"`), "sw app.js stamped");
assert(s.includes(`"style.css?v=${sha}"`), "sw css stamped");
assert(s.includes(`"lab-engine.mjs?v=${sha}"`), "sw .mjs stamped -- regression check: this was the actual live bug (E.matchKnownVariants undefined for any visitor whose browser cached lab-engine.mjs from before a deploy, since .mjs never matched the old \\.(?:js|css)-only pattern while every neighboring .js file got a fresh, cache-busting URL on every deploy)");
assert(s.includes('"index.html"') && !s.includes("index.html?v"), "sw index.html untouched");
assert(s.includes('"problems.generated.json"') && !s.includes("generated.json?v"), "sw json untouched");
assert.strictEqual(stampSw(s, sha), s, "sw stamping idempotent");

// Regression check against the REAL sw.js, not just a synthetic fixture --
// confirms the actual shipped ASSETS array (both current entries and any
// added later) gets fully stamped, catching a future ".mjs" (or any other
// extension) silently falling through the same gap again.
{
  const { readFileSync } = await import("node:fs");
  const realSw = readFileSync(new URL("sw.js", import.meta.url), "utf8");
  const assetsLine = realSw.match(/const ASSETS = \[([^\]]*)\];/)?.[1] ?? "";
  const realAssets = [...assetsLine.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const stampedReal = stampSw(realSw, sha);
  for (const asset of realAssets) {
    if (asset === "./" || asset.endsWith(".html") || asset.endsWith(".json")) continue; // deliberately unstamped, see comment above
    assert(stampedReal.includes(`"${asset}?v=${sha}"`), `real sw.js asset "${asset}" gets stamped (regression check against the live ASSETS list)`);
  }
}

// .mjs also stamped in HTML src/href attributes, same as .js/.css.
{
  const htmlMjs = '<script type="module" src="lab-helper.mjs"></script>';
  const hMjs = stampHtml(htmlMjs, sha);
  assert(hMjs.includes(`src="lab-helper.mjs?v=${sha}"`), "html .mjs stamped");
}

// the produced sw.js must still be syntactically valid
execSync("node --check web/sw.js", { cwd: new URL("..", import.meta.url) });

console.log("stamp.test.mjs: all assertions passed");
