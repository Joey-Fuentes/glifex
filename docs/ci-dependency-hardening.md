# CI dependency hardening — every deploy fetches from someone else's server

**Status: not started. This is a roadmap item, not a Bx track — it affects every
track already shipped.**

## The incident that surfaced it

Bx-10's vendor step bumped the cache key (`vendor-v5` → `v6`), which forced the
first full re-vendor in a long time. It failed:

```
✗ java: compiler.wasm 415 (REQUIRED)          x4, from https://teavm.org/playground/
```

Headers were added to `web/fetch-runtimes.mjs` (a bare `fetch(url)` sends none,
and undici defaults to `user-agent: node`; a GET has no body, so a 415 is the
server rejecting the *client*). The next run passed.

**The cause is unconfirmed and should not be recorded as fixed.** A retry loop
was already wrapped around the fetch, and the failing log shows
`fetch-runtimes attempt 2 failed` — so a transient upstream hiccup and the header
fix produce identical green results, and nothing separates them. The diagnostics
added in the same commit only print on *failure*, so a passing run says nothing.
The cheap experiment, if anyone wants certainty: revert the header commit, re-run,
see if it 415s. One CI run turns a guess into a fact.

## The real finding

**The stale cache was hiding a broken cold re-vendor on `main`.** Nobody would
have known until the next key bump. That is a bad way to discover that your
deploy cannot reproduce itself.

## The structural risk

Every vendored runtime is fetched at deploy time from a third party. A pinned ref
protects you from *change*. It does not protect you from *unavailability*.

| runtime | fetched from | shape |
|---|---|---|
| **Java** | `teavm.org/playground/` | **a single project's own web server** |
| Python/Ruby/TS/Postgres/PHP/WAT/6502 | jsDelivr / GitHub raw, via `fetch-runtimes.mjs` | CDN |
| C | wasmer registry (`clang/clang` webc, ~100 MB) | registry |
| C++ | `raw.githubusercontent.com` (binji) | CDN |
| Rust | `github.com/LyonSyonII/rubri` clone | repo |
| x86-64 | `raw.githubusercontent.com` (robalb, pinned + sha) | CDN |
| arm64 | `ftp.gnu.org` (binutils) + `gitlab.arm.com` (VIXL) + robalb | **two more single-origin servers** |

Java is the outlier: everything else is a CDN or a repo host, Java is one
person's server. arm64 (mine) added two more single-origin dependencies —
`ftp.gnu.org` and `gitlab.arm.com` — so this is not a Java problem, it is a
pattern.

## Options, roughly in order of effort

1. **Mirror the fragile assets.** Java's four files are the obvious first case.
   Either commit them (they are small) or publish a release asset and
   `gh release download` it (the pattern the handoff already documents).
2. **A vendor-bundle release.** Build the full tree once, attach it to a release,
   have deploys fetch *that* — one dependency instead of eight. `pins.env`-style
   pinning per runtime makes it reproducible.
3. **A scheduled cold-vendor canary.** A weekly `workflow_dispatch`/cron job that
   vendors from scratch with no cache and fails loudly. Turns "we find out at the
   next key bump" into "we find out on Tuesday". Cheapest of the three and it
   catches the class, not the instance.

**Option 3 first**, probably: it costs one scheduled job and would have caught
this incident months earlier, without deciding anything about mirroring.

## Related

- `web/vendor-sync.test.mjs` already guards a different drift: every runtime the
  loaders probe must be vendored by **all three** pipelines (`pages.yml`,
  `ci.yml`, `export-vendor-bundle.yml`). It exists because Bx-10 taught two of
  them about arm64 and silently forgot the third.
- `tools/arm64-toolchain/pins.env` is the pinning shape worth copying: one file,
  one place to look, hashed into the vendor cache key. The other runtimes
  hardcode their pins inline in the workflows, which is worth fixing for
  readability -- but **not** because the key misses them. **Correction:** an
  earlier version of this line claimed the key does not see inline pins, and that
  "remember to bump the cache key" was a footgun everywhere except arm64. Both
  are false. The key hashes the workflow file itself, so an inline pin change
  busts it (measured: editing one flips the hash). Every place a pin can live --
  `web/fetch-runtimes.mjs`, `tools/**`, the workflow -- is hashed, so the key
  always self-bumps. See Invariant 10 in `docs/architecture.md`.
