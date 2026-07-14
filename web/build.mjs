// Bakes the problem corpus into problems.generated.json so the playground
// consumes the SAME problems as the CLI. Run: `node web/build.mjs`.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const title = (md) => (md.match(/^#\s+(.+)$/m)?.[1] ?? "Untitled").trim();
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

// U0-2: surface manifest metadata (difficulty, tags) into the corpus so the
// playground can badge problems. Targeted extraction — the manifests are
// template-authored and `glifex verify` enforces their structure, so a full
// TOML parser is overkill for two single-occurrence keys.
// Display names for language IDs, read from languages/*.toml ("display" key).
// Baked into the corpus so the UI can label the dropdown properly.
const displayNames = (() => {
  const out = {};
  const ldir = join(ROOT, "languages");
  if (existsSync(ldir)) for (const f of readdirSync(ldir)) {
    if (!f.endsWith(".toml")) continue;
    const t = read(join(ldir, f)) || "";
    const id = t.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
    const d = t.match(/^display\s*=\s*"([^"]+)"/m)?.[1];
    if (id && d) out[id] = d;
  }
  return out;
})();

const manifestMeta = (dir) => {
  const t = read(join(dir, "manifest.toml"));
  if (!t) return { difficulty: null, tags: [] };
  const difficulty = t.match(/^\s*difficulty\s*=\s*"([^"]+)"/m)?.[1] ?? null;
  const raw = t.match(/^\s*tags\s*=\s*\[([^\]]*)\]/m)?.[1] ?? "";
  const tags = raw.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  const worked = /^\s*worked_example\s*=\s*true/m.test(t);
  return { difficulty, tags, worked };
};

// Per-variant declared complexity bounds (U0-? / the "brute-force is O(n^2),
// clean/optimized are O(n)" gap): [complexity.LANG.VARIANT] sections in a
// problem's manifest declare upper/lower bounds for that SPECIFIC solution
// variant, not just one bound for the whole problem -- different variants
// of the SAME language can legitimately target different complexity
// classes (a deliberately-simple "clean" and a faster "optimized"), and
// different languages can be structurally capped at different classes (a
// language with no hash-map primitive may only ever reach what its
// brute-force baseline achieves). "default" is a special LANG key: the
// fallback for any language without its own override section.
//
// Targeted extraction, same rationale as manifestMeta above: manifests are
// template-authored, `glifex verify` enforces structure, and a full TOML
// parser is overkill here. time_upper/time_lower are the current field
// names; a bare "time" (this schema's predecessor, still present in a few
// not-yet-migrated manifests) is read as a legacy alias for time_upper
// only -- time_lower is left null rather than guessed, since a wrong
// silent default (e.g. assuming O(1) for a problem that genuinely has no
// separate easy-case family) would be worse than admitting it's unknown.
function parseComplexitySections(text) {
  const headerRe = /^\[complexity\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\]\s*$/gm;
  const headers = [...text.matchAll(headerRe)];
  const out = {};
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const lang = h[1], variant = h[2];
    const bodyStart = h.index + h[0].length;
    const bodyEnd = i + 1 < headers.length ? headers[i + 1].index : text.length;
    const body = text.slice(bodyStart, bodyEnd);
    const get = (key) => body.match(new RegExp("^\\s*" + key + "\\s*=\\s*\"([^\"]*)\"", "m"))?.[1] ?? null;
    const timeUpper = get("time_upper") ?? get("time");
    const timeLower = get("time_lower");
    const space = get("space");
    const notes = get("notes");
    if (!out[lang]) out[lang] = {};
    out[lang][variant] = { upper: timeUpper, lower: timeLower, space, notes };
  }
  return out;
}

// Resolve one (lang, variant)'s bounds: the language's own section for that
// variant if present, else the "default" section for that variant, else
// null (no declared bounds for this variant at all -- the Lab falls back
// to problem-level behavior in that case, unchanged from before this).
function resolveComplexity(sections, lang, variant) {
  return (sections[lang] && sections[lang][variant]) || (sections.default && sections.default[variant]) || null;
}

function algoProblems() {
  const base = join(ROOT, "problems");
  return readdirSync(base).filter((d) => existsSync(join(base, d, "test_cases.json"))).sort().map((id) => {
    const dir = join(base, id);
    const md = read(join(dir, "problem.md")) || `# ${id}`;
    const manifestText = read(join(dir, "manifest.toml")) || "";
    const complexitySections = parseComplexitySections(manifestText);
    const languages = {};
    for (const lang of readdirSync(dir)) {
      const ld = join(dir, lang);
      const ext = { python: "py", javascript: "js", typescript: "ts", go: "go", java: "java", ruby: "rb", csharp: "cs", wat: "wat", php: "php", c: "c", cpp: "cpp", rust: "rs", "asm-x86_64": "s", "asm-6502": "s", sm83: "s", i8080: "s" }[lang];
      if (!ext) continue;
      const cap = lang === "java" || lang === "csharp";
      const f = (v) => read(join(ld, (cap ? v[0].toUpperCase() + v.slice(1) : v) + "." + ext));
      languages[lang] = { practice: f("practice"), clean: f("clean"), optimized: f("optimized"), "brute-force": f("brute-force") };
      // Declared bounds per variant, only for variants that actually have a
      // source file -- a null/missing variant has nothing to declare
      // bounds FOR. Absent entirely (rather than null) when this
      // (lang, variant) has no manifest declaration at all, so the Lab can
      // tell "no bound declared" apart from "declared bounds are null".
      const complexity = {};
      for (const variant of ["practice", "clean", "optimized", "brute-force"]) {
        if (!languages[lang][variant]) continue;
        const resolved = resolveComplexity(complexitySections, lang, variant);
        if (resolved) complexity[variant] = resolved;
      }
      if (Object.keys(complexity).length) languages[lang].complexity = complexity;
      // Compiled langs build the real CLI harness in-browser, so bake its
      // invariant support files (identical across problems) alongside.
      if (lang === "c") languages[lang].support = {
        "harness.c": read(join(ld, "harness.c")),
        "json.h": read(join(ld, "json.h")),
        "solution.h": read(join(ld, "solution.h")),
      };
      if (lang === "cpp") languages[lang].support = {
        "harness.cpp": read(join(ld, "harness.cpp")),
        "json.hpp": read(join(ld, "json.hpp")),
        "solution.hpp": read(join(ld, "solution.hpp")),
      };
      // C# compiles the real CLI Harness.cs + ISolution.cs in-browser (via the
      // vendored .NET-wasm + Roslyn runner), so bake those invariant support
      // files alongside the per-variant sources -- same idea as C/C++ above.
      if (lang === "csharp") languages[lang].support = {
        "Harness.cs": read(join(ld, "Harness.cs")),
        "ISolution.cs": read(join(ld, "ISolution.cs")),
      };
      // Rust runs single-file under Miri-in-wasm; the browser worker inlines
      // json.rs as a module + the editor's solve + embedded cases, so bake the
      // invariant json.rs alongside the per-variant sources (the CLI main.rs
      // harness is file-based/multi-module and not used by the browser path).
      if (lang === "rust") languages[lang].support = {
        "json.rs": read(join(ld, "json.rs")),
      };
    }
    return { id, track: "algorithm", ...manifestMeta(dir), title: title(md), statement: md,
             cases: JSON.parse(read(join(dir, "test_cases.json"))), languages };
  });
}

function dbProblems() {
  const base = join(ROOT, "problems-db");
  if (!existsSync(base)) return [];
  return readdirSync(base).filter((d) => existsSync(join(base, d, "schema.sql"))).sort().map((id) => {
    const dir = join(base, id);
    const md = read(join(dir, "problem.md")) || `# ${id}`;
    return { id, track: "database", ...manifestMeta(dir), title: title(md), statement: md,
             schema: read(join(dir, "schema.sql")), seed: read(join(dir, "seed.sql")),
             expected: JSON.parse(read(join(dir, "expected.json"))),
             practice: read(join(dir, "practice.sql")),
             solutions: { clean: read(join(dir, ".solutions", "clean.sql")), optimized: read(join(dir, ".solutions", "optimized.sql")) } };
  });
}

function feProblems() {
  const base = join(ROOT, "problems-fe");
  if (!existsSync(base)) return [];
  return readdirSync(base).filter((d) => existsSync(join(base, d, "assertions.json"))).sort().map((id) => {
    const dir = join(base, id);
    const md = read(join(dir, "problem.md")) || `# ${id}`;
    return { id, track: "frontend", ...manifestMeta(dir), title: title(md), statement: md,
             starter: read(join(dir, "starter.html")),
             assertions: JSON.parse(read(join(dir, "assertions.json"))),
             solutions: { clean: read(join(dir, ".solutions", "clean.html")) } };
  });
}

const corpus = { generatedAt: new Date().toISOString(), displayNames, problems: [...algoProblems(), ...dbProblems(), ...feProblems()] };
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "problems.generated.json"), JSON.stringify(corpus, null, 2));
console.log(`baked ${corpus.problems.length} problems -> web/problems.generated.json`);

// Build-time version stamp: every deploy gets a fresh version, no commits needed.
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const version = `${now.getUTCFullYear()}.${pad(now.getUTCMonth() + 1)}.${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
const commit = (process.env.GITHUB_SHA || "local").slice(0, 7);
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "version.json"),
  JSON.stringify({ version, commit, builtAt: now.toISOString() }, null, 2));
console.log(`version ${version} (${commit}) -> web/version.json`);
