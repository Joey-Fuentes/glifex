// Content-stamps asset URLs for cache-busting at deploy time. Pure transforms
// (unit-tested in stamp.test.mjs) plus a thin CLI. pages.yml runs this as
// `node web/stamp.mjs <sha>`; it rewrites web/index.html and web/sw.js in place.
//
// Effect: a deploy's index.html references THAT deploy's exact JS/CSS
// (app.js?v=<sha>) and the SW cache name becomes glifex-<sha>, so fresh HTML
// can never pair with a stale cached asset and the cache self-versions per
// deploy — no manual CACHE bumps. index.html / *.html / *.json stay unstamped.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function stampHtml(html, sha) {
  return html.replace(/(src|href)="([^"?:]+\.(?:js|css))"/g, (_, a, u) => `${a}="${u}?v=${sha}"`);
}
export function stampSw(sw, sha) {
  return sw
    .replace(/const CACHE = "[^"]+";/, `const CACHE = "glifex-${sha}";`)
    .replace(/"([^"]+\.(?:js|css))"/g, (_, u) => `"${u}?v=${sha}"`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sha = process.argv[2];
  if (!sha) { console.error("usage: node web/stamp.mjs <sha>"); process.exit(1); }
  const html = new URL("index.html", import.meta.url);
  const sw = new URL("sw.js", import.meta.url);
  writeFileSync(html, stampHtml(readFileSync(html, "utf8"), sha));
  writeFileSync(sw, stampSw(readFileSync(sw, "utf8"), sha));
  console.log(`stamped web/index.html + web/sw.js with v=${sha}`);
}
