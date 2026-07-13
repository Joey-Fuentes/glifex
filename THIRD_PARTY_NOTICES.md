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
| php-wasm (via @webreflection/php) | latest | PHP in the browser (official interpreter on WASM) | Apache-2.0 |
| CodeMirror | 5.65.18 | In-browser code editor | MIT |
| customasm | latest | 6502 assembler compiled to WASM (in-browser assembly) | Apache-2.0 |
| customasm std 6502 ruledef | 0.14.1 | 6502 instruction set, vendored at web/retro/6502.ruledef.asm (assembles plain mnemonics) | Apache-2.0 |
| customasm std sm83 ruledef | 0.14.1 | SM83 (Game Boy) instruction set, vendored at web/retro/sm83.ruledef.asm (patched: upstream ADD HL,r16 rule bug) | Apache-2.0 |
| .NET runtime (browser-wasm) | 10.0 | C# runtime executed in-browser for the C# track (Bx-5), vendored at web/vendor/csharp/ via `dotnet publish` | MIT |
| Roslyn (Microsoft.CodeAnalysis.CSharp) | 4.x | in-browser C# compiler for the C# track (Bx-5), shipped inside the vendored .NET-wasm bundle | MIT |
| Basic.Reference.Assemblies.Net90 | latest | byte-image BCL reference assemblies Roslyn compiles against in wasm (a.Location is empty there) | MIT |

Each project's full license text ships alongside its vendored files under
`web/vendor/<name>/` once distributed. Nothing else on glifex.dev embeds
third-party runtime code; the site's own HTML/CSS/JS is original and MIT.

## Repo-only test fixtures (not deployed)

The 8080 CPU diagnostic ROMs under `web/retro/test-roms/8080/` are third-party
test data executed only by the local/CI test harness and excluded from the
site deploy: TST8080 (Microcosm Associates 1980, regarded public domain),
8080PRE and 8080EXM (Bartholomew/Cringle, **GPLv3**, sources included), and
CPUTEST (SuperSoft Associates 1981, abandonware, no formal license). Full
provenance, links, and reference cycle totals: `web/retro/test-roms/8080/README.md`.
The GPLv3 fixtures do not affect the MIT licensing of Glifex's own code: they
are neither linked against nor distributed with the product. The
`web/retro/8080.ruledef.asm` instruction table is first-party (MIT), authored
from the Intel 8080 User's Manual, unlike the upstream customasm std ruledefs
listed above.
