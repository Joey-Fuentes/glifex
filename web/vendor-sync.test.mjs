// vendor-sync.test.mjs -- every runtime the loaders probe must actually be
// vendored by EVERY pipeline that vendors.
//
// Why this exists: Bx-10 added web/vendor/asm-arm64 to pages.yml and ci.yml and
// silently forgot export-vendor-bundle.yml. Nothing failed -- the manual bundle
// just quietly shipped an incomplete set, and the next person using it to
// reproduce a runtime locally would get a hole with no error to explain it.
// Same class as the corpus-integrity gap: one end wired, the other not.
//
// The rule, derived rather than hardcoded so it cannot rot:
//   required = { dirs runtimes.js probes via vendored("x") }
//            - { dirs web/fetch-runtimes.mjs already fetches }
// Everything left needs an EXPLICIT vendor step in every pipeline. Subtracting
// fetch-runtimes coverage matters: asm-6502 is fetched there, so demanding an
// explicit step for it would be a false alarm.

import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

// Dirs the browser will probe for vendor/<x>/manifest.json.
const runtimes = read("./runtimes.js");
const probed = [...new Set([...runtimes.matchAll(/vendored\("([a-z0-9_-]+)"\)/g)].map((m) => m[1]))].sort();

// Dirs fetch-runtimes.mjs already handles. Keys may be quoted ("asm-6502") or
// bare (python) -- match both, or the set is wrong and so is every conclusion
// drawn from it.
const fetcher = read("./fetch-runtimes.mjs");
const block = fetcher.match(/^const RUNTIMES = \{([\s\S]*?)^\};/m);
const fetched = [...(block ? block[1] : "").matchAll(/^ {2}"?([a-z0-9_-]+)"?:\s*\{/gm)].map((m) => m[1]);

const required = probed.filter((r) => !fetched.includes(r));

const PIPELINES = [
  ["../.github/workflows/pages.yml", "production deploy"],
  ["../.github/workflows/ci.yml", "e2e"],
  ["../.github/workflows/export-vendor-bundle.yml", "manual bundle export"],
];

console.log("vendored() probes      : " + probed.join(", "));
console.log("fetch-runtimes covers  : " + fetched.join(", "));
console.log("needs an explicit step : " + required.join(", "));

const problems = [];
for (const [path, label] of PIPELINES) {
  let wf;
  try { wf = read(path); }
  catch { problems.push(`${path} (${label}): missing -- cannot verify`); continue; }
  const absent = required.filter((r) => !wf.includes(`web/vendor/${r}`));
  if (absent.length) {
    problems.push(
      `${path} (${label}) never vendors: ${absent.join(", ")}\n` +
      `      -> vendored("${absent[0]}") would find no manifest.json, so the runtime\n` +
      `         silently does not exist in that pipeline.`);
  }
}

if (problems.length) {
  console.error("\nVENDOR SYNC FAILED:");
  for (const p of problems) console.error("  " + p);
  console.error("\nAdd the missing vendor step, or remove the vendored() probe.");
  process.exit(1);
}
console.log(`vendor sync OK: all ${required.length} explicitly-vendored runtimes present in all ${PIPELINES.length} pipelines.`);
