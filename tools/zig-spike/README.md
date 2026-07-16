# tools/zig-spike -- THROWAWAY (round 3)

PR-0 for Bx-11 Zig. Lives only on chore/export-zig-spike-* branches; never
merged. Findings belong in docs/ (PR-1); this code belongs in the bin.

ROUND 3 ASKS ONE QUESTION: can we get a zig.wasm at all.

Settled already, rounds 1-2:
  * -fno-llvm -fno-lld is real for wasm32-wasi (22,199 byte hello.wasm -> 55).
    Zig's own backend AND linker work, so the in-browser-linker problem that
    forced Bx-6 onto Miri does not exist here.
  * The browser half is done: browser_wasi_shim (the shim web/rust-worker.js
    already bundles) runs Zig's wasm output once the START section is stripped.
  * zig1.wasm is C-backend only. Route B is really route C.
  * -Ddev=wasm does not dodge the crash, but src/dev.zig documents that preset
    as, verbatim: zig build-* -fno-llvm -fno-lld -target wasm32-* --listen=-

The one blocker: zig 0.14.0's HOST compiler SIGSEGVs (silent, ~2.5s) building
the compiler for wasm32-wasi. Two levers, both pulled here: the stack ladder
(round 2 crashed at RLIMIT_STACK=16 MB with 14.5 GB free), and newer compilers
acquired by reading ziglang.org's index.json rather than trusting a mirror list.

Read the SUMMARY step, not the step statuses: every probe is continue-on-error
so one run returns all the data.
