# tools/keys -- signing-key trust anchors

This directory holds the committed public keys used to verify the source
tarballs we build from. A key here is a **trust anchor**: everything downstream
(the sha256 pins, the reproducible builds) rests on it being the genuine signer.
Establishing that is a human decision -- the tooling corroborates the fingerprint
and writes the files for you, but a person confirms the identity and commits.

## What lives here

- `binutils-signing.asc` -- the GNU binutils release signing key. Written by
  `pin-binutils.sh --write` (below) into the working tree; committed by a human
  after the identity check. NOT fetched or committed automatically.

The matching fingerprint is pinned as `BINUTILS_SIGNING_FPR` in each toolchain's
`pins.env` (arm64 and riscv). The version string names WHICH tarball; the
signing-key fingerprint names WHO must have signed it; the sha256 proves the
exact bytes.

## TL;DR -- how to update binutils / GNU signatures

A signature only means something if you already trust the key that made it, and
you cannot learn that trust from the key file, a keyserver, or a mirror -- an
attacker can hand you a self-consistent key + signature + tarball. Two commands
corroborate the fingerprint across sources that would have to be compromised at
the same time to fool you; a final by-eye check confirms the person. It is rare
(a new binutils release, or a signer rotation), so the flow is uniform rather
than optimized for shortcuts.

**1. Discover + corroborate the fingerprint** (out-of-band, writes nothing).
Run the `scout-signing-key` workflow (Actions -> scout-signing-key ->
Run workflow), giving it the binutils version. It reads the signer's fingerprint
out of the release's OWN signature -- verified keyserver-free against the GNU
curated keyring -- then corroborates it across independent legs (public
keyservers, Web Key Directory at the signer's email domain, and temporal
consistency across neighboring releases). It assumes no fingerprint or signer
name, commits nothing, opens no PR. Output: a corroborated 40-hex fingerprint.

**2. Verify + write the anchor, then confirm the person.**
Hand that fingerprint to `--write` (fingerprint first, version last):

    cd ~/glifex
    bash tools/pin-binutils.sh --write <40-hex-fingerprint> 2.43

This re-runs every mechanical leg locally -- release-signature authenticity
against the GNU keyring, the key's UID, independent keyservers, WKD at the
signer's domain, and the temporal same-signer check. **Only if all legs pass**,
it writes -- into the WORKING TREE, never staged:

  - `tools/keys/binutils-signing.asc` (exported from the verified keyring)
  - `BINUTILS_VERSION`, `BINUTILS_SHA256`, `BINUTILS_SIGNING_FPR` in BOTH
    `tools/arm64-toolchain/pins.env` and `tools/riscv-toolchain/pins.env`

If any leg fails, it writes nothing and exits nonzero. It then prints the one
step it cannot do for you: the URLs to the binutils `MAINTAINERS` file and the
release announcement on the mailing list. Open those in a browser and confirm
the UID/email/name match the person who should be signing.

When the UID, the release announcement, and `MAINTAINERS` all name the same
person, the identity leg is closed: review the changes with `git diff` and
commit them. Git is the gate -- nothing is trusted until you commit it.

    git diff                         # review the key + both pins.env
    git add tools/keys/binutils-signing.asc tools/*/pins.env && git commit ...

To preview without writing, use the same grammar with `--verify` -- identical
legs, identical identity URLs, but it touches no files:

    bash tools/pin-binutils.sh --verify <40-hex-fingerprint> 2.43

> The temporal check looks at neighboring releases (default `2.42 2.44`) to
> confirm the SAME key signs more than just the one tarball you're pinning -- a
> lone good signature is weaker evidence than a signer used consistently across
> releases. They're corroborating extras, not required; override the set with
> `VERIFY_EXTRA="2.41 2.44"` if a default neighbor doesn't exist yet (e.g. when
> pinning the newest release).

Signer identity can differ per release (binutils was historically signed by
Nick Clifton, more recently by Sam James), so re-run both steps for each version
you pin -- `--write` overwrites the existing anchor in place, so `git diff`
shows the old -> new rotation cleanly.
