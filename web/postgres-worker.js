/*
 * Glifex Postgres worker. Runs PGlite (Postgres compiled to WASM) off
 * the main thread.
 *
 * Same class of unbounded-hang risk as the other L3 migrations: a
 * malicious or buggy query (e.g. an unbounded recursive CTE) has no
 * built-in step-count safeguard -- PGlite is a real Postgres engine
 * compiled to WebAssembly, running at whatever speed it runs at, no
 * different in kind from PHP's/Ruby's/Python's own WASM-compiled
 * interpreters.
 *
 * Module worker, matching how vendor/postgres/index.js is already
 * loaded on the main thread: `import("./vendor/postgres/index.js")`,
 * a genuine ES module dynamic import, not importScripts. Same
 * mechanism retro-worker.js/php-worker.js already use and have
 * directly confirmed working.
 *
 * Message in : { id:'run', schema, seed, sql }
 * Message out: { id:'result', rows }
 *            | { id:'error', error }
 */

let PGlitePromise = null;
async function getPGlite() {
  if (PGlitePromise) return PGlitePromise;
  PGlitePromise = import("./vendor/postgres/index.js").then((m) => m.PGlite);
  return PGlitePromise;
}

// runQuery() copied+adapted verbatim from runtimes.js's loadPostgres().
async function runQuery(PGlite, schema, seed, sql) {
  const db = new PGlite();
  await db.exec(schema);
  await db.exec(seed);
  const res = await db.query(sql);
  await db.close();
  return res.rows.map((r) => Object.values(r));
}

self.onmessage = async (e) => {
  const d = e.data || {};
  if (d.id !== "run") return;
  try {
    const PGlite = await getPGlite();
    const rows = await runQuery(PGlite, d.schema, d.seed, d.sql);
    self.postMessage({ id: "result", rows });
  } catch (err) {
    self.postMessage({ id: "error", error: String((err && err.message) || err) });
  }
};

self.onerror = (e) => {
  self.postMessage({ id: "error", error: "worker crashed (uncaught): " + String((e && e.message) || e) });
};
