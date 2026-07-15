#!/usr/bin/env bash
# build.sh <wasm32|wasm64> <vixl-src-dir> <out-dir> <debug|release>
#
# v3. Runs 1-2 proved VIXL builds to wasm in BOTH memory models and then traps
# in gx_init(). debug mode exists to say WHY: emscripten assertions + SAFE_HEAP
# catch the bad access at its source, and -DVIXL_DEBUG turns on VIXL's own
# VIXL_ASSERT checks, which may name the broken invariant outright.
# NOTE VIXL's README: VIXL_DEBUG must be consistent between library and headers
# -- it is here, since we compile the lot in one emcc invocation.
set -uo pipefail

MEM="${1:?usage: build.sh <wasm32|wasm64> <vixl-src> <out> <debug|release>}"
SRC="${2:?}"
OUT="${3:?}"
MODE="${4:?}"
mkdir -p "$OUT"

MEMFLAGS=""
if [ "$MEM" = "wasm64" ]; then
  MEMFLAGS="-sMEMORY64=1"
fi

if [ "$MODE" = "debug" ]; then
  MODEFLAGS="-O0 -g3 -DVIXL_DEBUG -sASSERTIONS=2 -sSAFE_HEAP=1 -sSTACK_OVERFLOW_CHECK=2"
else
  MODEFLAGS="-O2"
fi

SRCS=$(find "$SRC/src" -name '*.cc' -not -path '*aarch32*' | sort)
echo "## vixl translation units: $(echo "$SRCS" | wc -l)"

# Converged on pass 1 in run 2 -- VIXL_INCLUDE_TARGET_AARCH64 was the only gate.
# The discovery loop stays: it costs nothing and a repo change may add a gate.
DEFINES="-DVIXL_INCLUDE_SIMULATOR_AARCH64 -DVIXL_INCLUDE_TARGET_AARCH64 -DVIXL_CODE_BUFFER_MALLOC"
DISCOVERED=""

echo "## ---- macro discovery loop ($MEM/$MODE) ----"
CONVERGED=0
for i in 1 2 3 4 5 6 7 8; do
  if emcc -fsyntax-only $DEFINES -I "$SRC/src" -std=c++17 gx_vixl.cc $SRCS \
        > "$OUT/discover-$MEM-$MODE.log" 2>&1; then
    echo "## macro set CONVERGED on pass $i"
    CONVERGED=1
    break
  fi
  NEW=$(grep -o "requires VIXL_[A-Z0-9_]*" "$OUT/discover-$MEM-$MODE.log" | head -1 | sed 's/^requires //')
  if [ -z "$NEW" ]; then
    NEW=$(grep "error:" "$OUT/discover-$MEM-$MODE.log" | grep -o "VIXL_[A-Z0-9_]*" | head -1)
  fi
  if [ -z "$NEW" ]; then
    echo "## REAL compile error, not a macro gate:"
    grep -i "error" "$OUT/discover-$MEM-$MODE.log" | head -40
    break
  fi
  case "$DEFINES" in
    *"-D$NEW"*) echo "## LOOP GUARD: $NEW demanded but already defined"; grep -i "error" "$OUT/discover-$MEM-$MODE.log" | head -20; break ;;
  esac
  echo "## discovered required macro -> $NEW"
  DEFINES="$DEFINES -D$NEW"
  DISCOVERED="$DISCOVERED $NEW"
done
echo "## final macros: $DEFINES"
echo "## auto-discovered beyond the seed:${DISCOVERED:- (none)}"

if [ "$CONVERGED" != "1" ]; then
  echo "## VERDICT($MEM/$MODE): no clean syntax pass"
  exit 1
fi

EXPORTS='_gx_init,_gx_reset,_gx_write_x,_gx_read_x,_gx_stack_base,_gx_run_from,_gx_set_pc,_gx_step,_gx_is_finished,_gx_ptr_bytes,_malloc,_free'

echo "## ---- build ($MEM/$MODE) ----"
emcc gx_vixl.cc $SRCS \
  -I "$SRC/src" \
  -std=c++17 \
  $MODEFLAGS \
  $DEFINES \
  -fexceptions \
  $MEMFLAGS \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 \
  -sEXPORTED_FUNCTIONS="$EXPORTS" \
  -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,HEAPU8,HEAPU32 \
  -o "$OUT/gx_vixl.mjs" \
  2> "$OUT/build-$MEM-$MODE.log"
STATUS=$?

echo "## emcc exit status: $STATUS"
if [ "$STATUS" != "0" ]; then
  echo "## ===== FIRST 60 ERROR LINES ($MEM/$MODE) ====="
  grep -i "error" "$OUT/build-$MEM-$MODE.log" | head -60
  exit "$STATUS"
fi

echo "## build OK ($MEM/$MODE)"
for f in "$OUT"/gx_vixl.wasm "$OUT"/gx_vixl.mjs; do
  test -f "$f" && echo "## size $(basename "$f"): $(stat -c%s "$f") bytes"
done
