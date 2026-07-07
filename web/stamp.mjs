// Content-stamps asset URLs for cache-busting at deploy time. Pure transforms
// (unit-tested in stamp.test.mjs) plus a thin CLI. pages.yml runs this as
// `node web/stamp.mjs <sha>`; it rewrites web/index.html and web/sw.js in place.
//
// Effect: a deploy's index.html references THAT deploy's exact JS/CSS
// (app.js?v=<sha>) and the SW cache name becomes glifex-<sha>, so fresh HTML
// can never pair with a stale cached asset and the cache self-versions per
// deploy — no manual CACHE bumps. index.html / *.html / *.json stay unstamped.
//
// .mjs matched alongside .js/.css (confirmed missing here caused a real,
// live-site bug: lab-engine.mjs and lab-config.mjs -- both ES modules,
// dynamically imported from web/lab.js -- were the only assets in sw.js's
// ASSETS array that never got a ?v=<sha> suffix, since ".mjs" doesn't match
// a bare "\.(?:js|css)" pattern despite containing the substring "js". They
// stayed cached under an unversioned URL indefinitely; every OTHER script
// got a fresh, cache-busted URL on every deploy and so was reliably
// refetched, but these two could silently keep serving pre-deploy code
// after a live update -- exactly what happened: E.matchKnownVariants (added
// in the per-variant-bounds deploy) was undefined for any visitor whose
// browser had lab-engine.mjs cached from before that deploy, while the
// REST of that same deploy's code (lab.js itself, correctly versioned)
// worked fine. See web/lab.js's own fix for the other half of this: even
// with .mjs properly stamped in sw.js's ASSETS list, the dynamic import
// call SITE inside lab.js's own source was a separate, hardcoded,
// unversioned string this script never touched at all.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function stampHtml(html, sha) {
  return html.replace(/(src|href)="([^"?:]+\.(?:js|mjs|css))"/g, (_, a, u) => `${a}="${u}?v=${sha}"`);
}
export function stampSw(sw, sha) {
  return sw
    .replace(/const CACHE = "[^"]+";/, `const CACHE = "glifex-${sha}";`)
    .replace(/"([^"]+\.(?:js|mjs|css))"/g, (_, u) => `"${u}?v=${sha}"`);
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
