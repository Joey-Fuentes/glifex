# tools/zig-spike -- THROWAWAY

PR-0 for Bx-11 Zig. This directory and .github/workflows/export-zig-spike.yml
exist only on chore/export-zig-spike-* branches and are never merged to main.
The findings belong in docs/ (PR-1); the code here belongs in the bin.

The decisive question: can a Zig compiler, itself running as wasm32-wasi under a
JS WASI host, take one main.zig and emit a runnable .wasm -- offline, no LLVM,
no external linker? The workflow header carries the routes, the probes and the
kill criteria. Read the SUMMARY step of the run, not the step statuses: every
probe is continue-on-error on purpose, so that one run returns all the data.
