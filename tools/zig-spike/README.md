# tools/zig-spike -- THROWAWAY (round 10)

PR-0 for Bx-11 Zig. Only on chore/export-zig-spike-* branches; never merged.

THE ANSWER, after nine rounds of my own mistakes: the zigtools fork is
Release 0.16.0 plus EXACTLY ONE COMMIT -- 1c430bc13, "make it possible compile
to wasm32-wasi with -Ddev=wasm", 8 lines, src/dev.zig only. It is vendored here
as zig.patch, lifted from the fork's own history.

WHY THAT TOOK SO LONG:
  * The PUBLISHED zig.patch in zigtools/playground is STALE. It lacks .legalize
    and was cut when .wasm was the last arm of the enum (trailing context "};"
    "}"), while 0.16.0 has .@"x86_64-linux" after it. No fuzz or --3way could
    ever fix that. Rounds 7-9 were applying a patch cut against another tree.
  * ziglang/zig ON GITHUB IS A STALE MIRROR. Its own log says so:
    ci-remove-GitHub-Actions, adjust-issue-templates-for-Codeberg,
    Change-github-links-to-codeberg. Tags stopped after 0.15.x -- which is why
    round 3's "clone --branch 0.16.0" failed and why round 9's git describe
    returned 0.15.0 and reported a 2980-commit "delta". This job uses NO git for
    upstream at all: the source is ziglang.org's own release tarball.

VERIFIED OFFLINE before shipping: the patch's .wasm arm matches the 0.16.0
tarball byte-for-byte -- 254 bytes, indentation included.

NOT VERIFIABLE OFFLINE: whether 0.16.0's Feature enum has .legalize. PROBE 1
asks before anything is built.

Read the SUMMARY step, not the step statuses.
