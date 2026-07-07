# Third-Party Notices

Glifex itself is MIT licensed (see LICENSE). This file covers third-party
software that glifex.dev **distributes** when the in-browser WASM tier is
enabled via `node web/fetch-runtimes.mjs`.

> Status: **deployed.** glifex.dev distributes the runtimes below, fetched at
> build time by `web/fetch-runtimes.mjs`; each ships with its LICENSE under
> `web/vendor/<name>/`, and `web/vendor/VERSIONS.json` records the exact set.

| Project | Version | Purpose | License |
|---|---|---|---|
| Pyodide | 0.28.0 | Python in the browser (CPython on WASM) | MPL-2.0 |
| TypeScript (compiler) | 6.0.3 | In-browser TS → JS compilation | Apache-2.0 |
| ruby.wasm | 3.4 | Ruby in the browser (CRuby on WASM) | Ruby License / BSD-2-Clause |
| PGlite (ElectricSQL) | 0.5.4 | PostgreSQL in the browser (WASM) | Apache-2.0 |
| php-wasm (seanmorris) | 0.1.0 | PHP in the browser (official interpreter on WASM) | Apache-2.0 |
| CodeMirror | 5.65.18 | In-browser code editor | MIT |

Each project's full license text ships alongside its vendored files under
`web/vendor/<name>/` once distributed. Nothing else on glifex.dev embeds
third-party runtime code; the site's own HTML/CSS/JS is original and MIT.
