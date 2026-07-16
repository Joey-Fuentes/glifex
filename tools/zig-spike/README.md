# tools/zig-spike -- THROWAWAY (round 2)

PR-0 for Bx-11 Zig. Lives only on chore/export-zig-spike-* branches; never
merged. Findings belong in docs/ (PR-1); this code belongs in the bin.

Round 1 settled: -fno-llvm -fno-lld is REAL for wasm32-wasi (22,199 byte
hello.wasm printed 55 under wasmtime), so the in-browser-linker problem that
forced Bx-6 onto Miri does not exist for Zig. It also settled that zig1.wasm is
C-backend-only, and that Zig's self-hosted linker emits a START section that
breaks any JS WASI host.

Round 2 asks: why did the compiler-for-wasm32-wasi build die in 3.7s with no
message (autopsy.sh), does -Ddev=wasm fix it, and does master behave differently
from the 0.14.0 pin.

Read the SUMMARY step of the run, not the step statuses: every probe is
continue-on-error so one run returns all the data.
