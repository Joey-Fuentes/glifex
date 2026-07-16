# tools/zig-spike -- THROWAWAY (round 7)

PR-0 for Bx-11 Zig. Only on chore/export-zig-spike-* branches; never merged.

ROUNDS 1-4 CRASHED BECAUSE OF ME. zigtools/playground has been running a Zig
compiler in the browser in production this whole time. Their build.zig passes
target/optimize/version-string/no-lib/dev -- and NOT use-llvm. zig's --help:

    -Duse-llvm      Use the llvm backend                                 <- the HOST compiles WITH
    -Denable-llvm   Build self-hosted compiler with LLVM backend enabled <- the RESULT CONTAINS

I set both false. -Duse-llvm=false forced the host onto zig's self-hosted wasm
backend, which SIGSEGVs on a wild pointer. The host is a build machine; let it
use LLVM. -Ddev=wasm keeps LLVM out of the artifact.

The rest of the recipe, all theirs:
  * fork zigtools/zig ref wasm32-wasi; zig.patch (vendored, 8 lines) trims the
    wasm DevEnv and ADDS .build_exe_command -- upstream's wasm env speaks the
    --listen=- protocol and cannot be invoked as "zig build-exe".
  * -fno-entry stops the backend emitting a start section (my round-2 finding,
    fixed properly).
  * -fno-compiler-rt plus a host-built libcompiler_rt.a, because the self-hosted
    wasm backend cannot compile compiler_rt.
  * ship only lib/std as tar.gz; gunzip via DecompressionStream, untar in JS.
  * @bjorn3/browser_wasi_shim -- already bundled by web/rust-worker.js for Bx-6.

This job builds it, gates it under wasmtime, then demos it in a real headless
Chromium under Playwright, and asks whether an 8-line patch on a pinned upstream
tag can replace the fork.

Round 5 never ran a single probe: mlugg/setup-zig@v1 could not fetch 0.16.0
(it asks /builds for zig-linux-x86_64-<ver>; releases are under /download/<ver>/
and named zig-x86_64-linux-<ver>) and the job aborted at step 4. The host zig now
comes from index.json via get-host-zig.sh -- the path round 3 already proved.

ROUND 6/7 PROVED THE PIPELINE, ON THE FORK. zig.wasm 3,949,969 bytes; lib/std
tar.gz ~3.4 MB; a real headless Chromium compiled a kata in ~1.4-1.6 s into a
451,601 byte main.wasm and printed a COMPUTED 140. No LLVM, no LLD, no server.

BUT THE FORK CANNOT SHIP. It stamps version-string "0.17.0" and there is no 0.17
release; users install releases; and Bx-11 needs the browser verdict-identical to
the CLI, so browser and CLI must be the SAME zig.

ROUND 7 KILLED THE EASY ANSWER. Upstream 0.16.0 does not build for wasm32-wasi at
all: src/main.zig:3743, self_exe_path is void where ?[]const u8 is wanted. That is
nowhere near dev.zig, so the published 8-line zig.patch is NOT the fork's delta.
(Round 7 also never learned whether the patch applies -- a bash -e bug killed the
step before it could print the rc. Fixed here, and audited: every rc capture in
this workflow now uses "|| RC=$?", proven against a real failing curl.)

ROUND 8 ASKS THE ONLY QUESTION LEFT: what does the fork ACTUALLY change against
upstream? fork-delta.sh computes the merge-base, lists every commit, saves the
whole diff as fork-delta.patch, and reports whether the fork's base is even an
ancestor of 0.16.0. If the delta is small and confined, Bx-11 vendors it against
a pinned tag and never touches someone else's branch. If the base is past 0.16.0,
no patch gets 0.16.0 there and Bx-11 waits for the next release -- which is a real
answer, not a failure.

Read the SUMMARY step, not the step statuses.
