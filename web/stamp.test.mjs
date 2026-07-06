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
  'const ASSETS = ["./", "index.html", "style.css", "app.js", "problems.generated.json", "privacy.html"];',
].join("\n");
const s = stampSw(sw, sha);
assert(s.includes(`const CACHE = "glifex-${sha}";`), "cache name stamped");
assert(s.includes(`"app.js?v=${sha}"`), "sw app.js stamped");
assert(s.includes(`"style.css?v=${sha}"`), "sw css stamped");
assert(s.includes('"index.html"') && !s.includes("index.html?v"), "sw index.html untouched");
assert(s.includes('"problems.generated.json"') && !s.includes("generated.json?v"), "sw json untouched");
assert.strictEqual(stampSw(s, sha), s, "sw stamping idempotent");

// the produced sw.js must still be syntactically valid
execSync("node --check web/sw.js", { cwd: new URL("..", import.meta.url) });

console.log("stamp.test.mjs: all assertions passed");
