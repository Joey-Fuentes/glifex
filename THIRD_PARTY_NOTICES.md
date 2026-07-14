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
| Miri (rust-lang/miri, wasm build) | ~1.78.0-dev nightly | Rust MIR interpreter compiled to wasm; runs the Rust track (Bx-6) in-browser, vendored at web/vendor/rust/ | MIT OR Apache-2.0 |
| rubri (LyonSyonII/rubri) | 1.78-dev | Miri-in-browser wrapper + prebuilt miri.wasm + sysroot rlibs that glifex's rust-worker vendors/adapts | MIT |
| browser_wasi_shim (bjorn3) | bundled | JS WASI implementation + virtual FS used by the Rust worker; bundled into web/rust-worker.js | MIT OR Apache-2.0 |
| Rust standard library (sysroot rlibs) | ~1.78.0-dev | precompiled std/core/alloc + deps Miri interprets against, vendored at web/vendor/rust/wasm-rustc/ | MIT OR Apache-2.0 |

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

## x86-64 assembly track (browser)

The x86-64 track assembles and links with the GNU assembler and linker, then executes the
resulting ELF on the Blink emulator compiled to WebAssembly. All three are vendored at build
time from robalb/x86-64-playground (pinned commit d617f6a19879157c1debbe0454b6c4cff2ebe094); every file is sha256-verified
against the exact bytes validated in-browser.

- Blink (blinkenlib.wasm, blinkenlib.js) -- ISC License, Copyright 2022 Justine Alexandra Roberts Tunney.
- GNU as and ld (gnu-as.elf, gnu-ld.elf; GNU Binutils 2.43.50) -- GPL-3.0-or-later. Unmodified static
  musl builds redistributed by robalb/x86-64-playground. The corresponding source is GNU Binutils
  2.43.50 (https://ftp.gnu.org/gnu/binutils/, configured per that repo's compile_musl_binutils.sh);
  a copy corresponding to these binaries is available on written request. A future migration to a
  permissive assembler/linker (llvm-mc + lld, Apache-2.0-with-LLVM-exception) is planned to remove
  this GPL dependency.
