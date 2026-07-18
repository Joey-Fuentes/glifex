# Bx-13b handoff — the Dart browser track, and what it taught

The working record for the Dart browser track: what shipped, the one bug that ate
most of the effort (and the four wrong fixes before the right one), and the
testing gaps that bug exposed. If you read one section, read
[Testing gaps](#testing-gaps-the-actionable-part) — it generalizes past Dart.

## What shipped

- **Bx-13a (#124)** — the toolchain vendored. Pinned SDK + one `pkg/kernel` patch
  + `dart compile js`, built into `web/vendor/dart/` at deploy, never committed.
  `tools/dart-toolchain/verify-dart.mjs` compiles a passing kata against the built
  compiler in CI.
- **Bx-13b worker (#128)** — a thin `web/dart-worker.js` relay over a
  `web/dart-core.mjs` logic module. Split this way because the e2e job runs
  `npm init -y` at the repo root, giving a typeless `package.json`, under which
  node resolves a `.js` entry as CommonJS and rejects its `export`s. So the entry
  is import-free and the logic lives in a `.mjs` — the same shape the asm workers
  use. The relay uses `addEventListener("message", …)`, never `self.onmessage`
  (assigning `onmessage` clobbered a loader's own handler and hung `dotnet.create()`
  back in Bx-5).
- **Corpus (#129)** — 001/002/003, each with practice / brute-force / clean /
  optimized. Every algorithm checked by transliteration against the real
  `test_cases.json`, and each `optimized` cross-checked against `clean` past the
  case range (fib to n=200 in exact integers; two-sum over 2000 random inputs).
  `optimized` is distinct from `clean` everywhere — 002's `optimized` had been a
  byte-for-byte copy of its `clean` and was replaced with a genuinely tighter
  single-probe map.
- **e2e smoke (#130, `e2e/dart-smoke.spec.js`)** — two tests: the happy path (001
  clean → 7/7) and, uniquely, the **diagnostic path** (a dropped semicolon must
  show the compiler's own words and a remapped `practice.dart:line:col`, never a
  boxed object). First smoke in the repo to assert the error path. The capture fix
  landed on this same PR so the test and the code it needs merged together.

## The one bug, and the four wrong fixes

A compile **error** crosses gx_web.dart's `.toJS` bridge **boxed**. The rejection
reason's own `toString` is only the generic bridge instruction:

> "Dart exception thrown from converted Future. Use the properties 'error' to
> fetch the boxed error and 'stack' to recover the stack trace."

That instruction is a trap for this payload. CI's shape report — a fallback that
dumps the object's `getOwnPropertyNames` and `toString` — proved, from a real
browser, that the Dart message does **not survive onto the thrown object at all**:

- `reason.error` — zero own properties, `toString()` is `[object Object]`.
- `reason.stack` — pure stack frames (`    at Object.wrapException (…)`).
- `reason.message` — the generic wrapper sentence.

The diagnostic exists in exactly one place: what `gx_core.report` **prints to
console** during the compile (`     [error] …@72 Expected ';'`). `report()`
collects each diagnostic into `messages` (which gx_web.dart later joins and throws
— where it gets boxed and lost) **and** `print()`s it. The print happens before
the boxing, so it survives. `driveProblem` captures `console.log/error/warn`
across the compile and keeps the reporter's own `[error]`/`[warning]` lines.

### The four wrong fixes, in order — don't repeat them

1. **`String(err.error)`** → `[object Object]`. The boxed object isn't a string.
2. **`err.error.toString()` / recursive enumerable scan** → nothing; `.error`
   enumerates empty.
3. **Read `err.stack`** → frames, no message. This one *looked* right and passed
   its own test, because the test's fake put the message on `.stack` — the fake
   was built to match the theory, so it agreed with the fix and not with reality.
   CI failed it.
4. **Rewriting gx_web.dart to return a tagged string instead of throwing** —
   attempted twice, reverted twice. A `.dart` change forces a vendor rebuild and
   was unnecessary once the console print was understood.

The right fix (console capture) was **rejected earlier** for a "race," but that
race was a node-rig artifact of a capture that didn't restore cleanly — it does
not exist in a dedicated worker, and the node verify awaits `driveProblem` to
completion before it logs. The capture is restored in `finally` before any await
returns, and only diagnostic-marker lines are kept.

### Why the tests kept lying

Four fixes passed their own tests and failed CI. The cause each time: the test
**fake was built to match the current theory of the boxed shape**, so fake and
fix shared the same wrong assumption and agreed with each other. The fix that
worked was tested against a fake built from **what CI's shape report actually
printed** — empty `.error`, frame-only `.stack`, *plus the console print* — so
passing it meant passing CI. Lesson: model the fake from observed reality, never
from the hypothesis under test.

<a name="testing-gaps-the-actionable-part"></a>
## Testing gaps — the actionable part

The headline, because it generalizes to every compiled track: **a track that only
ever compiles correct code has never tested its diagnostics, and the diagnostics
are the product.** A passing kata proves the compiler *runs*; only a missing
semicolon proves it can *explain*. The Bx-13b spike (21 rounds of correct katas)
never reached the one path a learner lives in.

Concrete follow-ups:

1. **Audit every compiled-language worker for happy-path-only testing.** Each
   `*-smoke.spec.js` except the new Dart one asserts only a passing compile. None
   proves a *compile error* renders as a readable diagnostic in the browser. Give
   each a bad-code case. No node rig substitutes: `verify-*-worker` proves the core
   headless; only a browser proves the learner sees it.
2. **Audit assert-absent checks repo-wide for the vacuous-pass trap.** An
   "absent X" check passes on garbage — `[object Object]` passed three absence
   checks before positive assertions were added. Pair every
   `expect(x).not.toContain(…)` with a positive `expect(x).toMatch(…)` that proves
   `x` is real content first.
3. **Strip comments before checking source in guards.** Prose-reading guards fired
   repeatedly this track: a check matched its own explanatory comment;
   `"dart-worker.mjs"` matched a substring of `verify-dart-worker.mjs`. Make
   comment-stripping a standing rule for any guard that greps source.
4. **The brute-force silent-wrong-answer risk.** `glifex.py`'s `test`/`verify`
   iterate `practice/clean/optimized` — until this track they never ran
   `brute-force`, so a wrong brute-force would pass silently. The harness template
   now has a `brute-force` dispatch arm (unconditional import, like go's
   `main.go`). Confirm the other tracks' harnesses actually exercise brute-force
   too, not just import it.

## Parked items

- **Cosmetic verify nit:** the verify's `r.error` banner line itself picks up
  GitHub's `Error:` stderr prefix, because a diagnostic line goes to
  `console.error`. Harmless, one-line fix — fold into a later batch.
- `[Bx-13b-go-worker-clock-comment-wrong]` — go-worker's timing comment claims the
  page isn't cross-origin-isolated; it is (sw.js stamps COOP/COEP). Cosmetic.
- `[go-worker-exports-unimportable]` — go-worker.js has dead, unimportable exports
  that would hit the same typeless-`package.json` CommonJS wall the Dart split was
  built to avoid. Harmless today; remove or `.mjs` them if anything ever imports
  them.
- `[Bx-8b-ceiling-message-suspect]` — Java's compile-ceiling message may overstate
  its certainty; re-read against `docs/teavm-javac-compile-ceiling.md`.

## What is proven, and what is not

The e2e smoke proves the browser path — happy and diagnostic — in CI. It was not
run locally in the build sandbox: no network to fetch the ~5.4 MB compiler, and
the vendored artifacts are gitignored and unbuildable there. The core is proven
headless by `verify-dart-worker.mjs`; the browser end-to-end is proven by the
smoke in CI. If the browser ever surfaces something the node core did not, the
shape report (now using `getOwnPropertyNames`) prints exactly what the object
carries — no guessing left.
