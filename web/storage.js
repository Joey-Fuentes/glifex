// Glifex progress store. Local-first: everything lives in the browser's
// localStorage under one versioned key, and the user can export/import it as
// a file they own. No server ever sees it (see privacy.html — this module is
// that promise implemented).
//
// Schema v1:
//   { schema: "glifex-progress-v1", exportedAt, entries: {
//       "<track>:<problemId>:<lang>": {
//         code, updatedAt, solved, attempts, bestNsPerCase } } }

const GlifexStorage = (() => {
  const SCHEMA = "glifex-progress-v1";
  const LS_KEY = SCHEMA;

  const entryKey = (track, problemId, lang) => `${track}:${problemId}:${lang}`;

  function emptyStore() {
    return { schema: SCHEMA, entries: {} };
  }

  function normalize(raw) {
    if (!raw || raw.schema !== SCHEMA || typeof raw.entries !== "object" || !raw.entries) return emptyStore();
    return { schema: SCHEMA, entries: raw.entries };
  }

  function putEntry(store, key, patch, now) {
    const prev = store.entries[key] || { attempts: 0, solved: false };
    store.entries[key] = { ...prev, ...patch, updatedAt: now };
    return store;
  }

  function recordResult(store, key, passed, nsPerCase, now) {
    const prev = store.entries[key] || { attempts: 0, solved: false };
    const next = { ...prev, attempts: (prev.attempts || 0) + 1, updatedAt: now };
    if (passed) {
      next.solved = true;
      if (typeof nsPerCase === "number" && (prev.bestNsPerCase == null || nsPerCase < prev.bestNsPerCase)) {
        next.bestNsPerCase = Math.round(nsPerCase);
      }
    }
    store.entries[key] = next;
    return store;
  }

  function mergeStores(current, imported) {
    // Newest-wins per entry; solved is OR'd, attempts take max — history can't un-happen.
    const out = { schema: SCHEMA, entries: { ...current.entries } };
    for (const [k, imp] of Object.entries(imported.entries || {})) {
      const cur = out.entries[k];
      if (!cur) { out.entries[k] = { ...imp }; continue; }
      const newer = (imp.updatedAt || "") > (cur.updatedAt || "") ? imp : cur;
      const older = newer === imp ? cur : imp;
      out.entries[k] = {
        ...older, ...newer,
        solved: !!(cur.solved || imp.solved),
        attempts: Math.max(cur.attempts || 0, imp.attempts || 0),
        bestNsPerCase: [cur.bestNsPerCase, imp.bestNsPerCase].filter((x) => x != null).sort((a, b) => a - b)[0],
      };
    }
    return out;
  }

  function exportBlobText(store, now) {
    return JSON.stringify({ ...store, exportedAt: now }, null, 2);
  }

  function load() {
    try { return normalize(JSON.parse(localStorage.getItem(LS_KEY))); }
    catch { return emptyStore(); }
  }
  function persist(store) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(store)); return true; }
    catch { return false; }
  }

  return { SCHEMA, entryKey, emptyStore, normalize, putEntry, recordResult, mergeStores, exportBlobText, load, persist };
})();

if (typeof module !== "undefined") module.exports = GlifexStorage;
if (typeof window !== "undefined") window.GlifexStorage = GlifexStorage;
