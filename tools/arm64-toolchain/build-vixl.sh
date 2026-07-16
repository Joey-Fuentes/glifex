#!/usr/bin/env bash
# build-vixl.sh <out-dir>
# VIXL's AArch64 Simulator -> wasm32. Source is gitlab.arm.com (canonical);
# github.com/Linaro/vixl is a stale mirror. See docs/vixl-arm64.md section 3.
set -euo pipefail
OUT="${1:?}"; mkdir -p "$OUT"
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/pins.env"
PIN="$VIXL_COMMIT"

cd "$HOME"
if [ ! -d vixl-src ]; then
  git clone https://gitlab.arm.com/runtimes/vixl.git vixl-src
fi
git -C vixl-src checkout -q "$PIN"
echo "## vixl pinned at $(git -C vixl-src rev-parse HEAD)"

. "$EMSDK/emsdk_env.sh" >/dev/null 2>&1 || true
SRCS=$(find "$HOME/vixl-src/src" -name '*.cc' -not -path '*aarch32*' | sort)

emcc "$HERE/gx_vixl.cc" $SRCS \
  -I "$HOME/vixl-src/src" -std=c++17 -O2 \
  -DVIXL_INCLUDE_SIMULATOR_AARCH64 \
  -DVIXL_INCLUDE_TARGET_AARCH64 \
  -DVIXL_CODE_BUFFER_MALLOC \
  -fexceptions \
  -sSTACK_SIZE=8388608 -sINITIAL_MEMORY=33554432 -sSTACK_OVERFLOW_CHECK=1 \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 \
  -sEXPORTED_FUNCTIONS=_gx_init,_gx_reset,_gx_write_x,_gx_read_x,_gx_read_sp,_gx_run_from,_gx_set_pc,_gx_step,_gx_is_finished,_gx_ptr_bytes,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,HEAPU8,HEAPU32 \
  -o "$OUT/gx_vixl.mjs"

echo "## gx_vixl.wasm $(stat -c%s "$OUT/gx_vixl.wasm") bytes (gz $(gzip -c "$OUT/gx_vixl.wasm" | wc -c))"
EMV=$(emcc --version | head -1)
echo "{\"runtime\":\"asm-arm64\",\"vixl\":\"$PIN\",\"via\":\"gitlab.arm.com/runtimes/vixl\",\"mem\":\"wasm32\",\"emcc\":\"$EMV\"}" > "$OUT/vixl-manifest.json"
test "$(stat -c%s "$OUT/gx_vixl.wasm")" -gt 1000000
