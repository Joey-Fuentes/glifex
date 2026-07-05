# Glifex web — docs + playground

A **fully static** site: docs plus an in-browser practice playground. It ships to
`glifex.dev` and runs identically offline (from disk, or `python -m http.server`),
because of one rule:

> **No server-side compute, and no runtime fetched at run time.**
> Everything executes client-side. Heavy language runtimes are *vendored* once
> (via `fetch-runtimes.mjs`), never fetched live. That's what makes offline ≡ hosted.

## Build & serve

```bash
node web/build.mjs          # bake problems/ -> web/problems.generated.json
# then serve the web/ folder any way you like:
python3 -m http.server -d web 8080     # → http://localhost:8080
```

Open `web/index.html` directly from disk and it works too — no server required.

## What runs where

| Tier | Languages | Needs |
|------|-----------|-------|
| Native, zero setup | **JavaScript** | nothing — runs in the browser offline |
| Vendored WASM | Python, TypeScript, Ruby | `node web/fetch-runtimes.mjs` (one time) |
| Vendored WASM (DB) | PostgreSQL (PGlite) | `node web/fetch-runtimes.mjs` |
| CLI-only (for now) | Go, Java, C# | use `glifex test …` |

The playground reads `problems.generated.json`, which is **baked from the same
`problems/` the CLI uses** — so the browser can never drift from the command line.
Re-run `node web/build.mjs` whenever problems change (a later CI phase enforces this).

## Files

- `index.html` / `style.css` — the shell and styling (no external CSS/JS)
- `app.js` — problem loading, the JavaScript execution engine, results, docs
- `runtimes.js` — vendor-first runtime detection (the offline rule lives here)
- `build.mjs` — corpus baker (problems → JSON)
- `fetch-runtimes.mjs` — one-time WASM vendoring (the only network touch)
- `vendor/` — fetched runtimes (gitignored; created by `fetch-runtimes.mjs`)

## Deploying to glifex.dev

Any static host works. With the Coolify setup already in the toolchain, point a
static service at `web/` with a build step of `node web/build.mjs`, and a CNAME
from `glifex.dev`. No backend, no database server — the whole site is files.
