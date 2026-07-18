# tools/keys -- signing-key trust anchors

This directory holds the committed public keys used to verify the source
tarballs we build from. A key here is a **trust anchor**: everything downstream
(the sha256 pins, the reproducible builds) rests on it being the genuine signer.
Establishing that is a human decision -- do not let automation accept it.

## What lives here

- binutils-signing.asc -- the GNU binutils release signing key, vetted and
  committed by a human (NOT added automatically).

The matching fingerprint is pinned as BINUTILS_SIGNING_FPR in each toolchain's
pins.env (arm64 and riscv). The version string names WHICH tarball; the
signing-key fingerprint names WHO must have signed it; the sha256 proves the
exact bytes.

## Establishing the anchor (do this out-of-band, once, per signer)

A signature only means something if you already trust the key that made it, and
you cannot learn that trust from the key file, a keyserver, or a mirror -- an
attacker can hand you a self-consistent key + signature + tarball. So the
fingerprint must be corroborated across sources that would have to be
compromised at the same time to fool you:

1. Obtain the candidate fingerprint from independent channels and confirm they
   ALL agree on the same 40 hex:
     - keys.openpgp.org (verified identity for the signer)
     - the GNU keyring at https://ftp.gnu.org/gnu/gnu-keyring.gpg
     - the signer's distribution / project developer keyring
     - a cross-project release the same key signs (e.g. a GCC tarball you can
       independently sha-check), verified against the same fingerprint
2. Verify the ACTUAL release against that fingerprint from a machine you control:

       gpg --no-default-keyring --keyring ./bu.gpg --import <key>
       gpg --no-default-keyring --keyring ./bu.gpg --status-fd 1 \
           --verify binutils-<ver>.tar.xz.sig binutils-<ver>.tar.xz

   Require: Good signature, the VALIDSIG primary fingerprint equals your
   candidate, and the signing subkey is neither revoked nor expired.
3. Only then commit the vetted key here as binutils-signing.asc and set
   BINUTILS_SIGNING_FPR in both pins.env.

Signer identity can differ per release (binutils was historically signed by
Nick Clifton, more recently by Sam James), so re-verify for each version you pin.

## Using the anchor

Once the key and fingerprint are committed, set (or re-derive) a version's
sha256 pin with an authenticated helper -- it refuses unless the committed key
matches the pin and the GNU signature verifies:

    cd ~/glifex
    bash tools/pin-binutils.sh 2.43            # prints the verified sha256 line
    bash tools/pin-binutils.sh 2.43 --write    # writes it into both pins.env

That replaces the old trust-on-first-use flow (paste whatever the mirror served)
with a pin that is provably from a signed release.
