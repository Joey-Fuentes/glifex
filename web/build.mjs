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
const manifestMeta = (dir) => {
  const t = read(join(dir, "manifest.toml"));
  if (!t) return { difficulty: null, tags: [] };
  const difficulty = t.match(/^\s*difficulty\s*=\s*"([^"]+)"/m)?.[1] ?? null;
  const raw = t.match(/^\s*tags\s*=\s*\[([^\]]*)\]/m)?.[1] ?? "";
  const tags = raw.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  const worked = /^\s*worked_example\s*=\s*true/m.test(t);
  return { difficulty, tags, worked };
};

function algoProblems() {
  const base = join(ROOT, "problems");
  return readdirSync(base).filter((d) => existsSync(join(base, d, "test_cases.json"))).sort().map((id) => {
    const dir = join(base, id);
    const md = read(join(dir, "problem.md")) || `# ${id}`;
    const languages = {};
    for (const lang of readdirSync(dir)) {
      const ld = join(dir, lang);
      const ext = { python: "py", javascript: "js", typescript: "ts", go: "go", java: "java", ruby: "rb", csharp: "cs", wat: "wat", php: "php", c: "c", cpp: "cpp", "asm-6502": "s" }[lang];
      if (!ext) continue;
      const cap = lang === "java" || lang === "csharp";
      const f = (v) => read(join(ld, (cap ? v[0].toUpperCase() + v.slice(1) : v) + "." + ext));
      languages[lang] = { practice: f("practice"), clean: f("clean"), optimized: f("optimized") };
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

const corpus = { generatedAt: new Date().toISOString(), problems: [...algoProblems(), ...dbProblems(), ...feProblems()] };
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
