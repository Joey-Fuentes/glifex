# Upstream notes -- to file later, in one batch

Findings in third-party projects we depend on. Policy: collect here, file
upstream in one pass once the retro track settles (we will surely find more).

> Not an upstream finding, but filed near the other dependency-trust notes: the
> procedure for updating GNU/binutils release signatures (discover -> verify ->
> write the anchor) lives in `tools/keys/README.md`.

## customasm (hlorenzi/customasm) -- found on v0.14.1

1. **BUG -- std/cpu/sm83.asm `ADD HL,{r16}` emits garbage.** The rule reads
   `ADD HL,{r16: sm83_r16} => (r16 @ 0b1 @ 0o1)`8 @ $le(n16)` -- but no `n16`
   capture exists in that rule (copy-paste from the `LD {r16},{n16}` line above).
   `ADD HL,DE` either fails to resolve or appends two garbage bytes to a 1-byte
   instruction. Our vendored copy at `web/retro/sm83.ruledef.asm` is patched
   (search "PATCHED (Glifex)").
2. **Docs gap -- std include syntax.** `#include <std/cpu/6502.asm>` errors with
   "expected string"; the quoted form `#include "<std/cpu/6502.asm>"` reads the
   angle brackets as a literal filename. Unclear how the CLI's std ruledefs are
   meant to be included in v0.14.1; we sidestep it by vendoring the ruledef text
   and prepending it before assembly. Worth asking upstream for the intended form.

## 6502.ts (6502ts/6502.ts)

3. **Packaging -- npm package has no entry point.** The published package ships
   `lib/` with NO `main`/`module`/`exports` in package.json, so `import "6502.ts"`
   is unresolvable by node or any bundler. Probably intentional (the package is a
   by-product of the Stellerator app), but a one-line `exports` map would make the
   excellent cycle-exact core usable as a library. Low priority; we wrote our own.

## Dart SDK (dart-lang/sdk) -- found on 3.12.2, reproduced on 3.14.0-edge

**Being filed now, not batched** -- the first item is a live correctness bug in a
package every Dart backend depends on, and Bx-13 cannot ship without it.

4. **BUG -- `package:kernel`'s dill reader conflates private `Name`s on web
   targets.** `pkg/kernel/lib/binary/ast_from_binary.dart`, `BinaryBuilder.readName`
   (line 1213 at 3.12.2, 1261 on main -- byte-identical, only the line moved), keys its
   `Name` cache as `stringReference | ((libraryReferenceIndex) << 30)`. `_nameCache` is a
   `Map<int, Name?>`, not a `List`, so the key never needed to be a packed int. **Both
   bitwise operators are 32-bit on web targets**, so the key retains only
   `libraryReferenceIndex & 3`: two libraries congruent mod 4 collide, and the cache
   returns the `Name` built for whichever was read first. Measured on
   `dart2js_platform.dill` -- `dart:_rti` (libIdx 9035) and `dart:js_interop` (libIdx
   37275) share string index 5036 and both key to `-1073736788` on web, distinctly on the
   VM. Proven by `identical()`: under dart2js the two `_isJSObject` `Name`s are the same
   object. Component-wide, `LibraryIndex` then skips **2987** members under dart2js
   against the VM's 90. **dart2js is not at fault** -- it compiled a 64-bit assumption to
   correct 32-bit web semantics. Latent since `e3d4fbec80c` (2022, "[kernel] Deduplicate
   Names when loading dill"), a well-measured optimisation in code that had only ever run
   on the VM. *Fix:* key on a record `(int, int)` -- structural equality, no arithmetic,
   exact everywhere (four edits; see `docs/dart2js-self-hosted.md` §4). *Do not* key on
   `stringReference * 1073741824 + libraryReferenceIndex`: both are UInt30, so at declared
   ranges the product needs 60 bits, past 2^53, and it fails silently by rounding.
   *Impact beyond us:* any dart2js-compiled program that reads a dill. On main the
   symptom is gone but 1651 names are still misattributed -- a silent-miscompilation risk
   where our crash was at least honest.
5. **BUG -- `front_end`'s crash reporter is browser-hostile, and destroys the error it
   exists to report.** `pkg/front_end/lib/src/base/crash.dart:94` constructs an
   `HttpClient` to POST a crash report to `http://127.0.0.1:59410/`. Under dart2js that
   constructor reads `Platform.version` and throws `Unsupported operation`, **one line
   before** the `try` whose `on SocketException` branch would have assumed the crash
   logger was not running and rethrown the original error. So the real error is replaced
   by a confusing one. It cost this track three CI rounds. The design intent is already
   right; the constructor just needs to be inside the guarded region.
6. **Ergonomics -- `LibraryIndex` drops members silently.** `library_index.dart:329`
   returns without a word when a private member's `Name.library` is not the indexed
   library. The comment acknowledges it as a known limitation. A `LibraryIndex` that
   cannot find a member it was handed should be able to say so; the silence is what made
   item 4 surface 20 members from its cause.
7. **Ergonomics -- `pkg/_js_interop_checks` resolves ~40 members eagerly in
   constructors, unguarded** (`shared_interop_transformer.dart`,
   `js_util_optimizer.dart`, `js_interop_checks.dart`). One missing member takes down the
   whole transformer with an error nowhere near the cause.
