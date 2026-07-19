# Hermetic, reproducible builds + full dependency mirroring

**Status: proposal / design. Nothing here is implemented yet.** This is the plan
behind the ROADMAP item of the same name. Commands like `make hydrate` and files
like the lockfile are the *target* design, not current behaviour. It exists so the
decision is written down before any code lands, and so the open questions at the
end get answered deliberately.

## Why

Every vendored runtime is currently fetched at deploy time from a third party.
Pinning a ref protects against *change*; it does nothing for *unavailability* --
`ftp.gnu.org` (binutils), `gitlab.arm.com` (VIXL), the wasmer registry, and the
jsDelivr/GitHub-raw CDNs are all single points of failure the deploy cannot
survive if they blink. The integrity/change axis is already hardened (every pin
lives in a hashed file, the vendor cache key self-versions, all actions are
SHA-pinned). This closes the availability axis at the root: make the build depend
on nothing external, and make the built output reproducible and verifiable.

## Requirements (the constraints this design must satisfy)

- **Fully offline builds** after a one-time online hydration.
- **Local stays in sync with the GitHub Actions builds** -- same scripts, same
  pins, same lockfile, same pinned toolchains, verified identically in both places.
- **You do not HAVE to build.** A prebuilt bundle can be fetched and verified
  instead; building from source is the audit/reproduce path, not a chore.
- **Local work cannot make the official GHA builds stale or out of sync.** A local
  pin experiment must never overwrite or diverge from what `main` publishes.
- **Dependency repos are NOT inside glifex.** Forks are fine; submodules are not.
- **On demand only. No scheduled jobs of any kind.**

## The linchpin: a lockfile keyed by the input-hash

glifex already computes a vendor input-hash -- the
`hashFiles('web/fetch-runtimes.mjs', 'tools/**', 'web/runtime-hashes.json',
'web/csharp-runtime/*.cs', 'web/csharp-runtime/*.csproj')` cache key. Two additions
turn that into a reproducible-build contract:

1. **Extend `runtime-hashes.json` into a complete lockfile** that records the
   expected sha256 of *every* vendored artifact -- the built runtimes
   (c / cpp / rust / go / asm-\* / dart / java) as well as the fetched ones. This is
   the natural next step after the `--verify` inventory: the files currently listed
   as "built from pinned source" get real pinned hashes.
2. **Publish the fully-built `web/vendor` tree as a bundle** (a tarball) named by
   the input-hash, hosted outside glifex. Deploys and local dev *fetch* that bundle
   and verify it against the lockfile -- one dependency instead of nineteen.

The committed lockfile is the contract. Local and CI both verify against it, so
they cannot drift silently: a byte that does not match is caught, never merged.

## Repositories: one authored repo, plus forks

- **Forks (`glifex-mirror` org).** Every *git-source* dependency -- binji, rubri,
  robalb/x86-64-playground, VIXL, libriscv, teavm-javac, customasm, and the
  binutils source -- is forked into `glifex-mirror`, and glifex pins to
  `glifex-mirror/<repo>@<sha>`. Build scripts clone these into a gitignored temp
  dir (exactly as rubri is cloned to `/tmp` today), so nothing lands in glifex's
  tree. Not submodules.
- **One authored repo (`glifex-vendor`).** Forks only cover repos. The non-git
  blobs -- the wasmer `clang.webc` and the CDN runtimes (python / ruby / typescript
  / postgres / php / wat) -- are not forkable, so their exact pinned bytes are
  mirrored into `glifex-vendor`, pinned by sha256.
- **The built bundle needs no repo of its own.** Publish it to `glifex-vendor`'s
  releases, or (cleaner) to **GHCR as an OCI artifact** under the org, which is
  content-addressed by nature. glifex itself stays lean: pins, lockfile, build
  scripts, Makefile.

Net effect: every input comes from a GitHub repo/release the project controls,
immutable and available regardless of upstream. Forking each dependency and
**tagging the pinned SHA in the fork** (e.g. `pin/binji-<sha>`) means even an
upstream force-push or repo deletion can never GC a commit the build depends on --
that tag is the real availability guarantee.

## Two modes, one verification

- **`make vendor`** -- fetch the published bundle for the current input-hash and
  verify it against the lockfile. Fast, offline once cached. The default; nobody
  has to build.
- **`make vendor-from-source`** -- rebuild everything from the mirrored forks,
  offline, and assert the output matches the lockfile. The hermetic
  reproduce/audit path; run it when a pin changes or to prove reproducibility.
- **CI runs the same scripts.** PRs verify against the lockfile and never publish;
  only `main` publishes the bundle for its input-hash.

## Why local can never make official stale

Because the bundle is addressed by the input-hash and the lockfile is committed:

- A local pin change lives on a branch -> a different input-hash -> a *different
  bundle slot*. It never overwrites `main`'s bundle. `main`'s hash, lockfile, and
  bundle are untouched until merge.
- Local builds write only to gitignored `web/vendor/` and a local cache. Nothing
  local is authoritative.
- The only path to changing official output is: bump a pin -> rebuild locally ->
  commit the updated lockfile -> PR -> CI rebuilds and asserts the lockfile matches
  what it produces -> merge -> CI publishes the new bundle. The lockfile diff is
  the reviewable, enforced gate. Official is never stale because the lockfile *is*
  the definition of "current," and CI refuses a mismatch.

## Keeping up with upstream (on demand, no scheduled jobs)

Mirroring deliberately decouples the build from upstream, so pulling upstream
changes is an explicit, tested act -- the feature, not the cost. Four parts:

1. **A single pins registry.** Extend `tools/vendor-pins.env` and the toolchain
   `pins.env` files into one manifest where every dependency declares: upstream
   URL, kind (git / npm / webc / cdn), the pinned ref-or-sha, and its mirror
   location. This is the single source of truth and what lets one uniform loop
   check *everything*.
2. **Detection -- `make check-upstream`.** Loops the registry and does
   `git ls-remote <upstream> <ref>` / registry queries, printing drift between
   upstream and the pins. Run it whenever you want to know what moved. No cron, no
   watcher -- it answers only when asked. (Renovate could do this hands-off, but
   the explicit no-scheduled-jobs decision means the manual target is the path.)
3. **Updating a dependency -- `make update DEP=<name>`.** Resolve the new upstream
   ref -> sync the fork to it (`gh repo sync`) and tag the pinned SHA in the fork
   -> for non-git blobs, re-download the new pinned bytes into `glifex-vendor` and
   record the sha256 -> re-pin in the registry -> `make vendor-from-source` to
   rebuild and regenerate the lockfile -> commit the registry bump + lockfile diff
   (+ any new blob bytes). The PR triggers CI, which rebuilds and asserts the
   lockfile matches; green CI plus the lockfile diff is the reviewable gate.
4. **Why this cannot drift.** The registry and lockfile are committed and *are* the
   contract. Upstream moving does nothing until pulled through step 3. Local
   experiments live on branches with a different input-hash, so they never
   overwrite main's bundle, and CI refuses a lockfile mismatch.

Cadence: `make check-upstream` tells you what upstream did; you pull each change
deliberately through the same build+lock+test flow `main` uses; you are current
by choice and provably in sync, and you never touch upstream at deploy time again.

## The fully-offline build, start to finish

You cannot literally start from nothing offline -- something crosses the wire once.
The sequence has a one-time online **hydration**, after which every build is fully
offline. The only hand-installed prerequisite is a container runtime; every
compiler/toolchain is pinned inside a container image that mirrors the exact
versions the GHA `setup-*` actions use, which is what keeps local == CI.

**Prerequisite:** Docker or Podman. *(Or Nix -- see below -- which replaces the
hydrate/build steps with `nix build` + a binary cache.)*

1. **`git clone https://github.com/Joey-Fuentes/glifex && cd glifex`** *(online)* --
   the repo carries only the pins registry, the lockfile, the build scripts, and
   the Makefile. No dependencies in-tree.
2. **`make hydrate`** *(online, once)* -- the whole acquisition phase, driven by the
   registry: clone every `glifex-mirror/*` fork at its pinned SHA into
   `.cache/mirror/` (via the `pin/<sha>` tags, so nothing can have been GC'd);
   download every pinned non-git blob from `glifex-vendor` into `.cache/blobs/`,
   sha256-verified against the lockfile as it lands; build or pull the pinned
   toolchain image. After this, everything needed is on disk.
3. **Cut the network** -- airplane mode, or rely on step 4 running the container
   with `--network=none` so any accidental fetch *fails* instead of silently
   reaching upstream. This is how hermeticity is proven.
4. **`make vendor-from-source`** *(offline)* -- runs each vendor script inside the
   network-disabled container: clones resolve from `.cache/mirror`, blobs from
   `.cache/blobs`, compilers from the image. Produces `web/vendor/*`, regenerates
   every artifact hash, and asserts it matches the committed lockfile -- fails loud
   on any drift. This is the fully offline, hermetic, reproducible build.
5. **`make verify && make serve`** *(offline)* -- `verify` re-runs the lockfile
   audit (the `--verify` inventory, now covering built artifacts); `serve` starts a
   local static server on `web/`. glifex now runs entirely offline.

**Shortcut (run, don't build):** replace step 4 with **`make vendor`** *(online,
once)* -- fetch the prebuilt bundle for the current input-hash and verify it
against the lockfile. Seconds, not minutes; offline thereafter. This is the
default path for anyone who does not need to build from source.

Day-to-day: `make hydrate` once, then `make vendor-from-source` forever (offline)
-- or `make vendor` if you just want the bundle.

## Open questions (decide before building)

- **Toolchain image: build or pull?** (a) Build from a pinned Dockerfile during
  `hydrate` -- most hermetic, slower first run; (b) pull prebuilt from GHCR under
  the org -- fast, and provably the same image CI used. Leaning (b) as default with
  (a) available: the same fetch-or-build, verify-either-way pattern as the vendor
  bundle, one level down. **Undecided.**
- **From-source byte-reproducibility.** Hash-pinning built outputs only works if
  the builds are deterministic (no embedded timestamps/paths, no nondeterministic
  codegen). wasm output is often reproducible; some toolchains need
  `SOURCE_DATE_EPOCH`, sorted inputs, pinned compilers. Recommendation: do not
  block on 100%. Default to trust-the-CI-bundle (CI builds once, records the hash,
  publishes; everyone fetches+verifies -- trivially in sync), and tighten
  `vendor-from-source` reproducibility per toolchain over time. Where a toolchain
  is not yet reproducible, the fetched bundle is canonical and from-source is
  best-effort. The sync/isolation guarantees land immediately; full from-scratch
  reproducibility is earned incrementally.
- **Bundle host:** `glifex-vendor` releases vs GHCR OCI artifact. **Undecided.**
- **Nix as the convergence point.** Everything above -- hermetic,
  content-addressed, reproducible, a remote cache (= the bundle), forks-as-pinned-
  inputs (`flake.lock`) -- is what Nix provides out of the box; `nix build` + a
  binary cache (Cachix or self-hosted) is the industrial version of this design.
  Not recommended as step one: the bespoke pipeline is already clean and most of
  the way there. But if the vendor problem keeps growing, Nix is where it
  converges, and it would subsume the hand-rolled lockfile/bundle logic.

## Implementation order

1. **Extend the lockfile** to cover the built artifacts and make `--verify` enforce
   them against it. This is the foundation; glifex is one small step from it after
   the `--verify` inventory work.
2. **Publish the bundle** from CI on `main`, keyed by the input-hash; switch
   `pages.yml` to fetch+verify it.
3. **Add `make vendor` (fetch) and `make vendor-from-source` (rebuild+verify)**
   around the existing vendor scripts, plus `make hydrate`, `make verify`,
   `make serve`.
4. **Stand up the forks + `glifex-vendor`** and repoint the pins, plus
   `make check-upstream` / `make update` -- the availability win, done incrementally
   per runtime.

Steps 1--3 deliver the sync and isolation guarantees; step 4 retires the
single-origin risk, without a big-bang rewrite.
