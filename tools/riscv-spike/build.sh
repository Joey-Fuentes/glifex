#!/usr/bin/env bash
# build.sh <out-dir> <EXT_C on|off>
#
# Build IN THEIR TREE, with THEIR flags. Round 5 copied examples/wasm elsewhere
# and CMake died on add_subdirectory(../../lib libriscv) -- a relative path that
# only resolves in place. Round 4 invented options. Round 3 hand-rolled emcc.
# Three rounds of me writing a build next to one that already works.
#
# Their build.sh, verbatim, is the baseline:
#   -DCMAKE_TOOLCHAIN_FILE=../cmake/wasm.cmake
#   -DRISCV_32I=OFF -DRISCV_64I=ON
#   -DRISCV_EXT_C=OFF          <-- the one switch this spike flips
#   -DRISCV_EXT_V=OFF -DRISCV_MEMORY_TRAPS=OFF
#   -DRISCV_BINARY_TRANSLATION=OFF   <-- almost certainly round 4's "table index
#                                        out of bounds": the translator dispatches
#                                        through indirect calls, impossible in wasm
#   -DRISCV_EXPERIMENTAL=ON
#   -DRISCV_ENCOMPASSING_ARENA=ON -DRISCV_ENCOMPASSING_ARENA_BITS=28
#
# THE QUESTION: RISCV_EXT_C is ON by libriscv's own default; their wasm example
# turns it off. But round 1 measured that -march=rv64gc COMPRESSES AUTOMATICALLY
# -- plain "add a0,a0,a1 / ret" came out as two 2-byte instructions. So their
# proven config cannot decode what our assembler emits by default. Flip it and
# find out, rather than assume either way.
set -uo pipefail
OUT="${1:?}"; EXTC="${2:-off}"; mkdir -p "$OUT"
HERE="$(cd "$(dirname "$0")" && pwd)"
D="$HOME/rv-libriscv"
[ -d "$D" ] || git clone --depth 1 https://github.com/libriscv/libriscv.git "$D" >/dev/null 2>&1
. "$EMSDK/emsdk_env.sh" >/dev/null 2>&1 || true
W="$D/examples/wasm"

# Add our target ALONGSIDE theirs -- their wasm_example stays as the control.
cp "$HERE/gx_rv.cpp" "$W/gx_rv.cpp"
if ! grep -q "gx_rv" "$W/CMakeLists.txt"; then
  cat >> "$W/CMakeLists.txt" <<'EOF'

# Appended by the glifex spike. Their wasm_example target is untouched -- it is
# the control. Ours links the same riscv lib with the same CMAKE_CXX_FLAGS
# (which already carry -fexceptions and TOTAL_MEMORY).
add_executable(gx_rv gx_rv.cpp)
target_link_libraries(gx_rv PRIVATE riscv)
set_target_properties(gx_rv PROPERTIES
  CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON CXX_EXTENSIONS ON SUFFIX ".mjs")
target_link_options(gx_rv PRIVATE
  "-sEXPORTED_FUNCTIONS=['_gx_load_elf','_gx_init','_gx_reset','_gx_read_x','_gx_write_x','_gx_set_pc','_gx_get_pc','_gx_step','_gx_sym','_gx_ptr_bytes','_gx_icount','_malloc','_free']"
  "-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPU8']"
  "-sMODULARIZE=1" "-sEXPORT_ES6=1" "-sENVIRONMENT=web,worker,node" "-sASSERTIONS=1")
EOF
fi

B="$W/.build-$EXTC"
rm -rf "$B" && mkdir -p "$B" && cd "$B"
TC=""
[ -f "$W/cmake/wasm.cmake" ] && TC="-DCMAKE_TOOLCHAIN_FILE=$W/cmake/wasm.cmake"
echo "## building with RISCV_EXT_C=$(echo "$EXTC" | tr a-z A-Z)  toolchain=${TC:-none found}"
export CXX=em++ CC=emcc
cmake -DCMAKE_BUILD_TYPE=Release $TC \
  -DRISCV_32I=OFF -DRISCV_64I=ON \
  -DRISCV_EXT_C="$(echo "$EXTC" | tr a-z A-Z)" \
  -DRISCV_EXT_V=OFF \
  -DRISCV_MEMORY_TRAPS=OFF \
  -DRISCV_BINARY_TRANSLATION=OFF \
  -DRISCV_EXPERIMENTAL=ON \
  -DRISCV_ENCOMPASSING_ARENA=ON \
  -DRISCV_ENCOMPASSING_ARENA_BITS=28 \
  .. > "$OUT/cmake-$EXTC.log" 2>&1 \
  || { echo "## CMAKE FAILED"; grep -iE "error|CMake Error" "$OUT/cmake-$EXTC.log" | head -8 | sed 's/^/   /'; exit 1; }
make -j"$(nproc)" > "$OUT/build-$EXTC.log" 2>&1 \
  || { echo "## BUILD FAILED"; grep -iE " error" "$OUT/build-$EXTC.log" | head -10 | sed 's/^/   /'; exit 1; }

for f in gx_rv.mjs gx_rv.wasm; do
  s=$(find "$B" -name "$f" | head -1); [ -n "$s" ] && cp "$s" "$OUT/${f%.*}-$EXTC.${f##*.}"
done
mv "$OUT/gx_rv-$EXTC.mjs" "$OUT/gx_rv-$EXTC.mjs" 2>/dev/null || true
ls -la "$OUT"/gx_rv-$EXTC.* 2>/dev/null | awk '{print "   "$5, $9}'
# their control, if it built
find "$B" -name "wasm_example.*" | head -2 | sed 's/^/   control: /'
test -f "$OUT/gx_rv-$EXTC.wasm" && echo "## BUILT (EXT_C=$EXTC)" || { echo "## no gx_rv wasm for EXT_C=$EXTC"; exit 1; }
