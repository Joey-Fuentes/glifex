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

ROUND 6 PROVED THE PIPELINE. zig.wasm 3,949,969 bytes; lib/std tar.gz 3,422,382;
a real headless Chromium compiled kata-a.zig in 1624 ms into a 451,601 byte
main.wasm and ran it, printing a COMPUTED 140. No LLVM, no LLD, no server.

BUT IT PROVED IT ON THE FORK, WHICH CANNOT SHIP. The fork stamps version-string
"0.17.0" and there is no 0.17 release: index.json's newest is 0.16.0, master is
0.17.0-dev.NNNN+sha, and a nightly pin is not a pin -- round 2 watched exactly
that nightly 404 on every mirror. Users install zig from brew/ziglang.org, which
serve releases. And Bx-11 requires the browser to be verdict-identical to the
CLI, so browser and CLI must be the SAME zig. Today they are not even the same
dialect: the CLI pins 0.14 and its template says

    pub fn main() !void / std.io.getStdOut().writer()

while the fork accepted

    pub fn main(init: std.process.Init) / std.Io.File.stdout().writeStreamingAll

ROUND 7 ASKS THE ONLY QUESTION THAT SHIPS: does upstream 0.16.0 -- patched with
the vendored 8 lines, or maybe unpatched -- build and GATE? Builds cost 62
seconds each, so all three candidates are built and gated, and the demo runs on
the first that passes in PRODUCTION preference order, not the easy order.

Read the SUMMARY step, not the step statuses.
