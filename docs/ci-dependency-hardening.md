# CI dependency hardening — every deploy fetches from someone else's server

**Status: not started. This is a roadmap item, not a Bx track — it affects every
track already shipped.**

## The incident that surfaced it

A cache-key change forced the first full re-vendor in a long time. It failed:

```
✗ java: compiler.wasm 415 (REQUIRED)          x4, from https://teavm.org/playground/
```

Headers were added to `web/fetch-runtimes.mjs` (a bare `fetch(url)` sends none,
and undici defaults to `user-agent: node`; a GET has no body, so a 415 is the
server rejecting the *client*). The next run passed.

**RESOLVED 2026-07-18 (Bx-8b): the caution below was right, and the later
override of it was wrong.** The 415 recurred on 2026-07-17 *with the headers
still in place* -- which looked like proof the header fix had never worked. It
was not proof: a vendor run **succeeded ten minutes later** (production's
`manifest.json` records `fetchedAt` 21:49:41Z, from `teavm.org/playground`, after
the 21:38 failure), and a from-source build resolved against `teavm.org/maven`
without complaint. So the 415 is **intermittent**, three retries inside sixty
seconds is not a control, and this section's refusal to call it fixed was
correct. Java no longer touches that server at all, so the question is now moot
for Java -- but the reasoning error is worth keeping: a red run and a green run
ten minutes apart is data, and reading only the red one is not.

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
| ~~**Java**~~ | ~~`teavm.org/playground/`~~ **FIXED (Bx-8b)**: built from pinned source at deploy; Maven Central + the plugin portal + github.com | ~~a single project's own web server~~ the CDN class every other track already uses |
| Python/Ruby/TS/Postgres/PHP/WAT/6502 | jsDelivr / GitHub raw, via `fetch-runtimes.mjs` | CDN |
| C | wasmer registry (`clang/clang` webc, ~100 MB, pinned `@0.160000.1` + sha256) | registry |
| C++ | `raw.githubusercontent.com` (binji, pinned commit) | CDN |
| Rust | `github.com/LyonSyonII/rubri` clone (pinned commit SHA) | repo |
| x86-64 | `raw.githubusercontent.com` (robalb, pinned + sha) | CDN |
| arm64 | `ftp.gnu.org` (binutils) + `gitlab.arm.com` (VIXL) + robalb | **two more single-origin servers** |

Java is the outlier: everything else is a CDN or a repo host, Java is one
person's server. arm64 (mine) added two more single-origin dependencies —
`ftp.gnu.org` and `gitlab.arm.com` — so this is not a Java problem, it is a
pattern.

## Options, roughly in order of effort

1. **Mirror the fragile assets.** ~~Java's four files are the obvious first case.~~
   **Superseded for Java (Bx-8b), and the reason generalises.** Mirroring an
   artifact you cannot attribute to a source only pins a mystery: teavm-javac
   publishes no releases and no tags, so a digest would have frozen a
   hand-uploaded blob of unknown provenance -- which was, measurably, stale.
   Building from pinned source was both cheaper and stronger. **Ask first whether
   the fragile asset can be BUILT; mirror only what cannot.**
   Either commit them (they are small) or publish a release asset and
   `gh release download` it (the pattern the handoff already documents).
2. **A vendor-bundle release.** Build the full tree once, attach it to a release,
   have deploys fetch *that* — one dependency instead of eight. `pins.env`-style
   pinning per runtime makes it reproducible.
**Build what you can, mirror the rest.** The durable fix removes the external
dependency at deploy time rather than watching for it to break: build from pinned
source wherever possible (as Java now does, Bx-8b) and mirror every remaining
fetched asset into the repo or a release the deploy owns. That makes vendoring
hermetic and reproducible offline -- strictly stronger than detecting a break
after the fact.

## Related

- `web/vendor-sync.test.mjs` already guards a different drift: every runtime the
  loaders probe must be vendored by **all three** pipelines (`pages.yml`,
  `ci.yml`, `export-vendor-bundle.yml`). It exists because Bx-10 taught two of
  them about arm64 and silently forgot the third.
- `tools/arm64-toolchain/pins.env` is the pinning shape every runtime uses: one
  file, one place to look, hashed into the vendor cache key. Every pin lives in a
  hashed file -- a `pins.env` under `tools/**` (web-runtime fetch pins live in
  `tools/vendor-pins.env`), `web/fetch-runtimes.mjs`, `web/runtime-hashes.json`,
  or `web/csharp-runtime/*.cs` / `*.csproj` -- and never inline in a
  workflow, so the key is a content hash of exactly the things that can change a
  build, and it always self-versions. See Invariant 10 in
  `docs/architecture.md`.
- **Every GitHub Action is pinned to a full commit SHA** (with a `# tag`
  comment), first- and third-party alike, so a moved or compromised action tag
  cannot change a build. Dependabot's `github-actions` ecosystem opens PRs to
  bump the SHAs, keeping the pins current without hand-editing.
- **Updating a GNU/binutils signature is a documented two-command flow**, not an
  ad-hoc paste: `scout-signing-key` discovers and corroborates the signer
  fingerprint out-of-band, then `pin-binutils.sh --write <fpr> <ver>` re-verifies
  every leg and writes the key + both `pins.env` (unstaged) for you to review with
  `git diff` and commit. Full walkthrough: `tools/keys/README.md`.
