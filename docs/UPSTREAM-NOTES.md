# Upstream notes -- to file later, in one batch

Findings in third-party projects we depend on. Policy: collect here, file
upstream in one pass once the retro track settles (we will surely find more).

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
