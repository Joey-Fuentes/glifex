// Vendors the WASM runtimes for non-JavaScript playground languages, so the
// site stays fully offline-capable afterwards. Run once locally, and in the
// Pages build:  node web/fetch-runtimes.mjs
//
// This is the ONLY place the project touches the network for runtimes.
// web/vendor/ is gitignored — runtimes are fetched, never committed.
//
// Design: some dist filenames vary across releases, so each runtime lists
// CANDIDATE files; 404s on alternates are fine as long as one required set
// lands. Every runtime's LICENSE is fetched alongside (see
// THIRD_PARTY_NOTICES.md), and VERSIONS.json records exactly what shipped.

import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const VENDOR = join(dirname(fileURLToPath(import.meta.url)), "vendor");
const CDN = "https://cdn.jsdelivr.net";

// php-wasm jsDelivr bases — the "@" is concatenated (not a literal token).
const PHP_NPM = `${CDN}/npm/@webreflection/php`;
const PHP_GH = `${CDN}/gh/seanmorris/php-wasm` + "@master";
const RUNTIMES = {
  // 6502 assembly: customasm (Apache-2.0) as raw wasm + 6502.ts core (MIT).
  // The GPL test-suite in 6502.ts's aux/ is NOT vendored -- only the browser core.
  "asm-6502": {
    version: "latest", license: "Apache-2.0 (customasm) + MIT (6502.ts)",
    files: [
      // customasm.wasm is a build artifact (not committed), so pull it from the
      // live playground deployment, which serves exactly this file.
      { url: "https://hlorenzi.github.io/customasm/web/customasm.wasm", save: "customasm.wasm", group: "casmwasm" },
      { url: `${CDN}/gh/hlorenzi/customasm@main/web/customasm.wasm`, save: "customasm.wasm", group: "casmwasm" },
      // 6502.ts core is NOT fetchable (no CDN-servable browser build); a CI/build
      // step self-bundles it with esbuild into web/vendor/asm-6502/6502.js.
      // LICENSEs -- jsDelivr gh needs a @ref; filename varies.
      { url: `${CDN}/gh/hlorenzi/customasm@main/LICENSE`, save: "LICENSE-customasm", group: "casmlic" },
      { url: `${CDN}/gh/hlorenzi/customasm@main/LICENSE.txt`, save: "LICENSE-customasm", group: "casmlic" },
      { url: `${CDN}/gh/hlorenzi/customasm@main/LICENSE.md`, save: "LICENSE-customasm", group: "casmlic" },
      { url: `${CDN}/gh/6502ts/6502.ts@master/LICENSE`, save: "LICENSE-6502ts", group: "tslic" },
      { url: `${CDN}/gh/6502ts/6502.ts@master/LICENSE.txt`, save: "LICENSE-6502ts", group: "tslic" },
      { url: `${CDN}/npm/6502.ts/LICENSE`, save: "LICENSE-6502ts", group: "tslic" },
    ],
  },
  codemirror: {
    version: "5.65.18", license: "MIT",
    files: [
      { url: `${CDN}/npm/codemirror@5.65.18/lib/codemirror.js`, save: "codemirror.js", required: true },
      { url: `${CDN}/npm/codemirror@5.65.18/lib/codemirror.css`, save: "codemirror.css", required: true },
      { url: `${CDN}/npm/codemirror@5.65.18/mode/javascript/javascript.js`, save: "javascript.js", required: true },
      { url: `${CDN}/npm/codemirror@5.65.18/mode/python/python.js`, save: "python.js", required: true },
      { url: `${CDN}/npm/codemirror@5.65.18/mode/ruby/ruby.js`, save: "ruby.js", required: true },
      { url: `${CDN}/npm/codemirror@5.65.18/mode/sql/sql.js`, save: "sql.js", required: true },
      { url: `${CDN}/npm/codemirror@5.65.18/mode/xml/xml.js`, save: "xml.js", required: true },
      { url: `${CDN}/npm/codemirror@5.65.18/mode/css/css.js`, save: "css.js", required: true },
      { url: `${CDN}/npm/codemirror@5.65.18/mode/htmlmixed/htmlmixed.js`, save: "htmlmixed.js", required: true },
      { url: `${CDN}/npm/codemirror@5.65.18/mode/clike/clike.js`, save: "clike.js", required: true },
      { url: `${CDN}/npm/codemirror@5.65.18/mode/go/go.js`, save: "go.js", required: true },
      { url: `${CDN}/npm/codemirror@5.65.18/mode/php/php.js`, save: "php.js", required: true },
      { url: `${CDN}/npm/codemirror@5.65.18/LICENSE`, save: "LICENSE", required: true },
    ],
  },
  typescript: {
    version: "6.0.3", license: "Apache-2.0",
    files: [
      { url: `${CDN}/npm/typescript@6.0.3/lib/typescript.js`, required: true },
      { url: `${CDN}/npm/typescript@6.0.3/LICENSE.txt`, save: "LICENSE", required: true },
    ],
  },
  python: {
    version: "0.28.0", license: "MPL-2.0",
    files: [
      { url: `${CDN}/pyodide/v0.28.0/full/pyodide.js`, required: true },
      { url: `${CDN}/pyodide/v0.28.0/full/pyodide.asm.js`, required: true },
      { url: `${CDN}/pyodide/v0.28.0/full/pyodide.asm.wasm`, required: true },
      { url: `${CDN}/pyodide/v0.28.0/full/python_stdlib.zip`, required: true },
      { url: `${CDN}/pyodide/v0.28.0/full/pyodide-lock.json`, required: true },
      // npm package ships no LICENSE at root — use the GitHub repo copy (same release tag).
      { url: `${CDN}/gh/pyodide/pyodide@0.28.0/LICENSE`, save: "LICENSE", group: "pylic" },
      { url: `${CDN}/npm/pyodide@0.28.0/LICENSE`, save: "LICENSE", group: "pylic" },
    ],
  },
  ruby: {
    version: "3.4", license: "Ruby / BSD-2-Clause",
    files: [
      // API library (DefaultRubyVM) lives in @ruby/wasm-wasi — the
      // 3.4-wasm-wasi package's iife script is the auto-run flavor (no API).
      { url: `${CDN}/npm/@ruby/wasm-wasi/dist/browser.umd.js`, save: "browser.umd.js", group: "rbapi" },
      { url: `${CDN}/npm/@ruby/wasm-wasi/dist/browser/index.umd.js`, save: "browser.umd.js", group: "rbapi" },
      // The harness does `require "json"` — we need the STDLIB build.
      // Filename varies by release; try candidates, keep whichever exists.
      { url: `${CDN}/npm/@ruby/3.4-wasm-wasi/dist/ruby+stdlib.wasm`, save: "ruby+stdlib.wasm", group: "rubywasm" },
      { url: `${CDN}/npm/@ruby/3.4-wasm-wasi/dist/ruby.wasm`, save: "ruby+stdlib.wasm", group: "rubywasm" },
      { url: `${CDN}/gh/ruby/ruby.wasm@main/LICENSE`, save: "LICENSE", group: "rblic" },
      { url: `${CDN}/npm/@ruby/3.4-wasm-wasi/LICENSE.txt`, save: "LICENSE", group: "rblic" },
    ],
  },
  postgres: {
    version: "0.5.4", license: "Apache-2.0",
    files: [
      { url: `${CDN}/npm/@electric-sql/pglite@0.5.4/dist/index.js`, required: true },
      // wasm/data asset names have varied across PGlite releases — candidates:
      { url: `${CDN}/npm/@electric-sql/pglite@0.5.4/dist/pglite.wasm`, group: "pgwasm" },
      { url: `${CDN}/npm/@electric-sql/pglite@0.5.4/dist/postgres.wasm`, group: "pgwasm" },
      { url: `${CDN}/npm/@electric-sql/pglite@0.5.4/dist/pglite.data`, group: "pgdata" },
      { url: `${CDN}/npm/@electric-sql/pglite@0.5.4/dist/postgres.data`, group: "pgdata" },
      { url: `${CDN}/npm/@electric-sql/pglite@0.5.4/LICENSE`, save: "LICENSE" },
    ],
  },
  php: {
    version: "webreflection", license: "Apache-2.0 (php-wasm) + ISC (wrapper)",
    files: [
      // @webreflection/php: one self-contained ESM bundle plus one wasm. No import
      // graph and no baked-in wasm name to chase (runtimes.js locateFile points
      // straight at php-web.wasm).
      { url: `${PHP_NPM}/es.js`, save: "es.js", required: true },
      { url: `${PHP_NPM}/php-web.wasm`, save: "php-web.wasm", required: true },
      // Wrapper ships no LICENSE of its own; fall back to upstream php-wasm's.
      { url: `${PHP_NPM}/LICENSE`, save: "LICENSE", group: "phplic" },
      { url: `${PHP_GH}/LICENSE`, save: "LICENSE", group: "phplic" },
    ],
  },
  wat: {
    version: "1.0.37", license: "Apache-2.0",
    files: [
      // wabt.js (AssemblyScript port): a single self-contained UMD with the wasm
      // embedded, so one file is the whole assembler. Version candidates + latest.
      { url: `${CDN}/npm/wabt@1.0.37/index.js`, save: "index.js", group: "watjs" },
      { url: `${CDN}/npm/wabt@1.0.36/index.js`, save: "index.js", group: "watjs" },
      { url: `${CDN}/npm/wabt/index.js`, save: "index.js", group: "watjs" },
      { url: `${CDN}/npm/wabt@1.0.37/LICENSE`, save: "LICENSE", group: "watlic" },
      { url: `${CDN}/npm/wabt/LICENSE`, save: "LICENSE", group: "watlic" },
    ],
  },
};

async function fetchTo(url, destDir, saveAs) {
  const name = saveAs || url.split("/").pop();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(join(destDir, name), buf);
  return { name, url, bytes: buf.length };
}

const summary = {};
let failed = false;
for (const [lang, spec] of Object.entries(RUNTIMES)) {
  const dir = join(VENDOR, lang);
  await mkdir(dir, { recursive: true });
  const got = [];
  const groupsSatisfied = new Set();
  for (const f of spec.files) {
    if (f.group && groupsSatisfied.has(f.group)) continue;   // alternate already landed
    try {
      const r = await fetchTo(f.url, dir, f.save);
      got.push(r);
      if (f.group) groupsSatisfied.add(f.group);
      console.log(`  ✓ ${lang}: ${r.name} (${(r.bytes / 1024).toFixed(0)} KB)`);
    } catch (e) {
      const note = f.group ? "(candidate — trying alternate)" : f.required ? "(REQUIRED)" : "(optional)";
      console.log(`  ✗ ${lang}: ${f.url.split("/").pop()} ${e.message} ${note}`);
      if (f.required) failed = true;
    }
  }
  const groups = [...new Set(spec.files.filter((f) => f.group).map((f) => f.group))];
  for (const g of groups) if (!groupsSatisfied.has(g)) { console.log(`  ✗ ${lang}: no candidate satisfied '${g}'`); failed = true; }
  await writeFile(join(dir, "manifest.json"),
    JSON.stringify({ lang, version: spec.version, license: spec.license, files: got, fetchedAt: new Date().toISOString() }, null, 2));
  summary[lang] = { version: spec.version, license: spec.license, files: got.map((f) => f.name) };
}
// PGlite's index.js is a multi-chunk ESM bundle; chunk names are content
// hashes that change per release. Discover and fetch them by scanning the
// JS we already downloaded, to a fixpoint (chunks can import chunks).
{
  const { readFile, readdir } = await import("node:fs/promises");
  const dir = join(VENDOR, "postgres");
  const base = RUNTIMES.postgres.files[0].url.replace(/index\.js$/, "");
  const have = new Set(await readdir(dir));
  let queue = ["index.js"];
  while (queue.length) {
    const file = queue.shift();
    const text = await readFile(join(dir, file), "utf8").catch(() => "");
    for (const m of text.matchAll(/[A-Za-z0-9_-]+\.(?:wasm|data)|chunk-[A-Za-z0-9_-]+\.js/g)) {
      const chunk = m[0];
      if (have.has(chunk)) continue;
      have.add(chunk);
      try {
        const r = await fetchTo(base + chunk, dir);
        summary.postgres.files.push(r.name);
        console.log(`  ✓ postgres: ${chunk} (${(r.bytes / 1024).toFixed(0)} KB) [auto-discovered]`);
        queue.push(chunk);
      } catch (e) {
        // js chunks are required; wasm/data hits may be regex false positives
        const hard = chunk.endsWith(".js");
        console.log(`  ✗ postgres: ${chunk} ${e.message} [auto-discovered${hard ? " — REQUIRED" : ", tolerated"}]`);
        if (hard) failed = true;
      }
    }
  }
}

await writeFile(join(VENDOR, "VERSIONS.json"), JSON.stringify(summary, null, 2));
console.log(`\n${failed ? "INCOMPLETE — see ✗ lines above" : "Done"}. web/vendor/VERSIONS.json records what shipped (use it to amend THIRD_PARTY_NOTICES.md).`);
process.exit(failed ? 1 : 0);
