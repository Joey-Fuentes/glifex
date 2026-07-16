# tools/zig-spike -- THROWAWAY (round 6)

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

Read the SUMMARY step, not the step statuses.
