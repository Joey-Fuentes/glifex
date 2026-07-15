#!/usr/bin/env bash
# build.sh <wasm32|wasm64> <vixl-src-dir> <out-dir>
#
# v2. Run 1 died on "cpu-aarch64.h requires VIXL_INCLUDE_TARGET_AARCH64".
# VIXL gates its headers with #error directives and clang stops at the FIRST
# one -- so naively adding macros costs one CI round-trip per macro. Instead:
# discover the required macro set by compiling syntax-only in a bounded loop,
# parsing each #error for the macro it names, and retrying. One run converges.
set -uo pipefail

MEM="${1:?usage: build.sh <wasm32|wasm64> <vixl-src> <out>}"
SRC="${2:?}"
OUT="${3:?}"
mkdir -p "$OUT"

MEMFLAGS=""
if [ "$MEM" = "wasm64" ]; then
  MEMFLAGS="-sMEMORY64=1"
fi

SRCS=$(find "$SRC/src" -name '*.cc' -not -path '*aarch32*' | sort)
echo "## vixl translation units: $(echo "$SRCS" | wc -l)"

# Seed with what we know: the simulator, the a64 target (learned from run 1),
# and malloc-backed code buffers (emscripten has no executable mmap).
DEFINES="-DVIXL_INCLUDE_SIMULATOR_AARCH64 -DVIXL_INCLUDE_TARGET_AARCH64 -DVIXL_CODE_BUFFER_MALLOC"
DISCOVERED=""

echo "## ---- macro discovery loop (syntax-only, bounded) ----"
CONVERGED=0
for i in 1 2 3 4 5 6 7 8; do
  echo "## discovery pass $i with: $DEFINES"
  if emcc -fsyntax-only $DEFINES -I "$SRC/src" -std=c++17 gx_vixl.cc $SRCS \
        > "$OUT/discover-$MEM.log" 2>&1; then
    echo "## macro set CONVERGED on pass $i"
    CONVERGED=1
    break
  fi

  # Pull the macro name out of a VIXL #error line, e.g.
  #   error: cpu-aarch64.h requires VIXL_INCLUDE_TARGET_AARCH64 (scons target=a64).
  NEW=$(grep -o "requires VIXL_[A-Z0-9_]*" "$OUT/discover-$MEM.log" | head -1 | sed 's/^requires //')
  if [ -z "$NEW" ]; then
    # Fall back: any VIXL_ token on an error line.
    NEW=$(grep "error:" "$OUT/discover-$MEM.log" | grep -o "VIXL_[A-Z0-9_]*" | head -1)
  fi

  if [ -z "$NEW" ]; then
    echo "## no further macro gate found -- this is a REAL compile error, not a gate"
    echo "## ===== FIRST 60 ERROR LINES ($MEM) ====="
    grep -i "error" "$OUT/discover-$MEM.log" | head -60
    break
  fi

  case "$DEFINES" in
    *"-D$NEW"*)
      echo "## LOOP GUARD: $NEW already defined but still demanded -- stopping"
      echo "## ===== FIRST 40 ERROR LINES ($MEM) ====="
      grep -i "error" "$OUT/discover-$MEM.log" | head -40
      break
      ;;
  esac

  echo "## discovered required macro -> $NEW"
  DEFINES="$DEFINES -D$NEW"
  DISCOVERED="$DISCOVERED $NEW"
done

echo "## ---- final macro set ----"
echo "## $DEFINES"
echo "## auto-discovered beyond the seed:${DISCOVERED:- (none)}"

if [ "$CONVERGED" != "1" ]; then
  echo "## VERDICT($MEM): never reached a clean syntax pass -- see discover-$MEM.log"
  exit 1
fi

EXPORTS='_gx_init,_gx_reset,_gx_write_x,_gx_read_x,_gx_read_sp,_gx_run_from,_gx_set_pc,_gx_step,_gx_is_finished,_gx_ptr_bytes,_malloc,_free'

echo "## ---- real build ($MEM) ----"
set -x
emcc gx_vixl.cc $SRCS \
  -I "$SRC/src" \
  -std=c++17 -O2 \
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
  2> "$OUT/build-$MEM.log"
STATUS=$?
set +x

echo "## emcc exit status: $STATUS"
if [ "$STATUS" != "0" ]; then
  echo "## ===== FIRST 60 ERROR LINES ($MEM) ====="
  grep -i "error" "$OUT/build-$MEM.log" | head -60
  if grep -qi "uintptr\|LP64\|static_assert\|VIXL_STATIC_ASSERT\|pointer" "$OUT/build-$MEM.log"; then
    echo "## VERDICT($MEM): looks like a POINTER-WIDTH / LP64 rejection"
  else
    echo "## VERDICT($MEM): link/codegen failure, NOT obviously pointer-width -- read the log"
  fi
  exit "$STATUS"
fi

echo "## build OK ($MEM)"
ls -la "$OUT"
for f in "$OUT"/gx_vixl.wasm "$OUT"/gx_vixl.mjs; do
  test -f "$f" && echo "## size $(basename "$f"): $(stat -c%s "$f") bytes"
done
