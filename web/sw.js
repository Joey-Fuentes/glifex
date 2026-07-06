// Cache-first service worker: after one visit, the playground works with the
// network fully severed. Version-bump CACHE on breaking asset changes.
const CACHE = "glifex-v3";
const ASSETS = ["./", "index.html", "style.css", "app.js", "assertions.js", "runtimes.js", "storage.js", "editor.js", "problems.generated.json", "privacy.html", "licenses.html"];

self.addEventListener("install", (e) => {
  // Resilient install: one missing asset must not fail the whole SW
  // (e.g. a clone that hasn't vendored yet). Cache what exists.
  e.waitUntil(caches.open(CACHE).then((c) =>
    Promise.allSettled(ASSETS.map((a) => c.add(a)))));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
});
self.addEventListener("fetch", (e) => {
  // version.json must never be cached — it IS the freshness signal.
  if (e.request.url.endsWith("version.json")) return;
  // Navigations are network-first: online visitors always get the newest
  // page (so the version badge can never be one deploy behind); the cache
  // answers only when the network can't — where showing the older version,
  // and SAYING so, is the honest behavior.
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || caches.match("index.html"))));
    return;
  }
  // Other assets: stale-while-revalidate (instant + background refresh).
  e.respondWith(caches.match(e.request).then((hit) => {
    const refresh = fetch(e.request).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => hit);
    return hit || refresh;
  }));
});
