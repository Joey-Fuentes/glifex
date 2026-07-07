// Cache-first service worker: after one visit, the playground works with the
// network fully severed. Asset URLs are content-stamped (?v=<sha>) at deploy and
// CACHE becomes glifex-<sha>, so each deploy self-versions -- no manual bumps, and
// fresh HTML never pairs with a stale cached asset. Local/CI use this placeholder.
//
// It also stamps cross-origin isolation headers (COOP/COEP/CORP) onto every
// response: GitHub Pages can't send those headers, but SharedArrayBuffer -- which
// the WASIX C/C++ toolchain requires -- needs the page to be crossOriginIsolated.
// Every Glifex asset is same-origin, so require-corp blocks nothing.
const CACHE = "glifex-dev";
const ASSETS = ["./", "index.html", "style.css", "app.js", "md.js", "assertions.js", "runtimes.js", "storage.js", "editor.js", "js-runtime.js", "wiring.js", "problems.generated.json", "privacy.html", "licenses.html"];

function coi(res) {
  if (!res || res.status === 0) return res;   // opaque response -- leave untouched
  const h = new Headers(res.headers);
  h.set("Cross-Origin-Embedder-Policy", "require-corp");
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("Cross-Origin-Resource-Policy", "cross-origin");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

self.addEventListener("install", (e) => {
  // Resilient install: one missing asset must not fail the whole SW
  // (e.g. a clone that hasn't vendored yet). Cache what exists.
  e.waitUntil(caches.open(CACHE).then((c) =>
    Promise.allSettled(ASSETS.map((a) => c.add(a)))));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();   // control open pages so the COI headers apply after one reload
  })());
});
self.addEventListener("fetch", (e) => {
  // version.json must never be cached -- it IS the freshness signal. (Same-origin
  // fetch, so COEP allows it even though the SW doesn't stamp this one.)
  if (e.request.url.endsWith("version.json")) return;
  // Navigations are network-first: online visitors always get the newest page
  // (so the version badge can never be one deploy behind); the cache answers only
  // when the network can't. Every returned response is COI-stamped.
  if (e.request.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const res = await fetch(e.request);
        caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return coi(res);
      } catch {
        return coi((await caches.match(e.request)) || (await caches.match("index.html")));
      }
    })());
    return;
  }
  // Other assets: stale-while-revalidate (instant + background refresh), COI-stamped.
  e.respondWith((async () => {
    const hit = await caches.match(e.request);
    if (hit) {
      fetch(e.request).then((res) => {
        if (res && res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
      }).catch(() => {});
      return coi(hit);
    }
    try {
      const res = await fetch(e.request);
      if (res && res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
      return coi(res);
    } catch {
      return undefined;
    }
  })());
});
