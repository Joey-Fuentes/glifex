// Corpus integrity: every language that has a browser runtime (LOADERS entry)
// and is declared on a problem MUST survive into the baked corpus -- otherwise
// it can never appear in the dropdown (the asm-6502 baker-drop bug). Cheap,
// no browser. Run: node web/corpus-integrity.test.mjs
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

// LOADERS keys = languages with a browser runtime
const rt = read(join(ROOT, "web/runtimes.js")) || "";
const loadersLine = rt.match(/const LOADERS = \{([^}]*)\}/);
const LOADERS = new Set([...(loadersLine?.[1] || "").matchAll(/(?:"([\w-]+)"|(\w+))\s*:/g)].map((m) => m[1] || m[2]));

// declared languages from a manifest's [languages] section
function declared(dir) {
  const t = read(join(dir, "manifest.toml")); if (!t) return [];
  const sec = t.match(/^\[languages\]\s*\n([\s\S]*?)(?=^\[|\Z)/m); if (!sec) return [];
  return [...sec[1].matchAll(/^\s*([A-Za-z0-9_-]+)\s*=/gm)].map((m) => m[1]);
}

const corpus = JSON.parse(read(join(ROOT, "web/problems.generated.json")));
const byId = Object.fromEntries(corpus.problems.map((p) => [p.id, p]));

const errors = [];
const base = join(ROOT, "problems");
for (const id of readdirSync(base).filter((d) => existsSync(join(base, d, "manifest.toml")))) {
  const decl = declared(join(base, id));
  const baked = new Set(Object.keys(byId[id]?.languages || {}));
  for (const lang of decl) {
    if (LOADERS.has(lang) && !baked.has(lang)) {
      errors.push(`  ${id}: declares runnable language '${lang}' (has a LOADERS runtime) but it is MISSING from the baked corpus -> it can never appear in the dropdown. Likely dropped by web/build.mjs (extension map).`);
    }
  }
}

console.log(`LOADERS runtimes: ${[...LOADERS].sort().join(", ")}`);
if (errors.length) { console.error("\nCORPUS INTEGRITY FAILED:\n" + errors.join("\n")); process.exit(1); }
console.log("corpus integrity OK: every declared+runnable language is baked.");
