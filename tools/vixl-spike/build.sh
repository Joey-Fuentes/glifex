#!/usr/bin/env bash
# build.sh <wasm32|wasm64> <vixl-src-dir> <out-dir>
# Builds vixl::aarch64::Simulator + gx_vixl.cc to wasm via emcc.
# NOTE: deliberately does NOT set -e on the compile itself -- a failure is a
# RESULT, not an accident. We capture it, print the first errors, and let the
# other matrix leg still report.
set -uo pipefail

MEM="${1:?usage: build.sh <wasm32|wasm64> <vixl-src> <out>}"
SRC="${2:?}"
OUT="${3:?}"
mkdir -p "$OUT"

MEMFLAGS=""
if [ "$MEM" = "wasm64" ]; then
  MEMFLAGS="-sMEMORY64=1"
fi

# VIXL core + aarch64 backend. No AArch32, no assembler-only bits we do not need.
SRCS=$(find "$SRC/src" -name '*.cc' -not -path '*aarch32*' | sort)
echo "## vixl translation units: $(echo "$SRCS" | wc -l)"

EXPORTS='_gx_init,_gx_reset,_gx_write_x,_gx_read_x,_gx_read_sp,_gx_run_from,_gx_set_pc,_gx_step,_gx_is_finished,_gx_ptr_bytes,_malloc,_free'

set -x
emcc gx_vixl.cc $SRCS \
  -I "$SRC/src" \
  -std=c++17 -O2 \
  -DVIXL_INCLUDE_SIMULATOR_AARCH64 \
  -DVIXL_CODE_BUFFER_MALLOC \
  -fexceptions \
  $MEMFLAGS \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 \
  -sEXPORTED_FUNCTIONS="$EXPORTS" \
  -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,HEAPU8,HEAPU32 \
  -o "$OUT/gx_vixl.mjs" \
  2> "$OUT/build-$MEM.log"
STATUS=$?
set +x

echo "## emcc exit status: $STATUS"
if [ "$STATUS" != "0" ]; then
  echo "## ===== FIRST 60 ERROR LINES ($MEM) ====="
  grep -i "error" "$OUT/build-$MEM.log" | head -60
  echo "## ===== (full log uploaded as artifact) ====="
  # Distinguish the two failure modes we actually care about.
  if grep -qi "uintptr\|LP64\|64-bit\|static_assert\|VIXL_STATIC_ASSERT" "$OUT/build-$MEM.log"; then
    echo "## VERDICT($MEM): looks like a POINTER-WIDTH / LP64 rejection"
  else
    echo "## VERDICT($MEM): failure is NOT obviously pointer-width -- read the log"
  fi
  exit "$STATUS"
fi

echo "## build OK ($MEM)"
ls -la "$OUT"
for f in "$OUT"/gx_vixl.wasm "$OUT"/gx_vixl.mjs; do
  test -f "$f" && echo "## size $(basename "$f"): $(stat -c%s "$f") bytes"
done
