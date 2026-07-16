#!/usr/bin/env bash
# build-one.sh <vixl-src> <out-dir> <label> [stack-bytes]
set -euo pipefail
SRC="$1"; OUT="$2"; LABEL="$3"; BYTES="${4:-}"
mkdir -p "$OUT"
HERE="$(cd "$(dirname "$0")" && pwd)"
DEF=""
[ -n "$BYTES" ] && DEF="-DGX_SIM_STACK=$BYTES"
SRCS=$(find "$SRC/src" -name '*.cc' -not -path '*aarch32*' | sort)
emcc "$HERE/gx_stack.cc" $SRCS -I "$SRC/src" -std=c++17 -O2 \
  -DVIXL_INCLUDE_SIMULATOR_AARCH64 -DVIXL_INCLUDE_TARGET_AARCH64 \
  -DVIXL_CODE_BUFFER_MALLOC $DEF -fexceptions \
  -sSTACK_SIZE=8388608 -sINITIAL_MEMORY=67108864 -sSTACK_OVERFLOW_CHECK=1 \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 \
  -sEXPORTED_FUNCTIONS=_gx_init,_gx_reset,_gx_write_x,_gx_read_x,_gx_read_sp,_gx_run_from,_gx_set_pc,_gx_step,_gx_is_finished,_gx_ptr_bytes,_gx_stack_size,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,HEAPU8,HEAPU32 \
  -o "$OUT/gx_$LABEL.mjs"
echo "## $LABEL  wasm $(stat -c%s "$OUT/gx_$LABEL.wasm") bytes  stack=${BYTES:-default}"
