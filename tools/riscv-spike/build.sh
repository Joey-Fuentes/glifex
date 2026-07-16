#!/usr/bin/env bash
# build.sh <out-dir> <ext_c ON|OFF>
#
# This is not a guess. Every line below was executed by hand, locally, before it
# was written here -- emsdk installed on a real box, libriscv cloned, our
# wrapper built, three RV64GC katas driven. add=12, loop=55,
# auipc=0x1122334455667788.
#
# Four earlier CI rounds died on MY plumbing: a generated header, a missing
# -fexceptions, a relative add_subdirectory broken by copying the dir, and a
# renamed .wasm that the .mjs could no longer find. None of them were libriscv's
# fault. What fixed it was building it once by hand instead of shipping a batch
# per bug.
set -uo pipefail
OUT="${1:?}"; EXTC="${2:-ON}"; mkdir -p "$OUT"
HERE="$(cd "$(dirname "$0")" && pwd)"
D="$HOME/rv-libriscv"
[ -d "$D" ] || git clone --depth 1 https://github.com/libriscv/libriscv.git "$D" >/dev/null 2>&1
. "$EMSDK/emsdk_env.sh" >/dev/null 2>&1 || true
W="$D/examples/wasm"

# Their build.sh is STALE: it passes -DCMAKE_TOOLCHAIN_FILE=../cmake/wasm.cmake
# and examples/wasm/cmake/ does not exist in the repo. emcmake is what works.
# Their OPTIONS are still the source of truth, and BINARY_TRANSLATION=OFF is the
# one that matters -- the translator dispatches through indirect calls, which
# cannot exist in wasm, and leaving it on produced "table index is out of bounds".
cp "$HERE/gx_rv.cpp" "$W/gx_rv.cpp"
grep -q "gx_rv" "$W/CMakeLists.txt" || cat >> "$W/CMakeLists.txt" <<'EOF'

# glifex spike: our target ALONGSIDE their wasm_example, which stays as the
# control. Their CMAKE_CXX_FLAGS already carry -fexceptions and TOTAL_MEMORY.
add_executable(gx_rv gx_rv.cpp)
target_link_libraries(gx_rv PRIVATE riscv)
set_target_properties(gx_rv PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON SUFFIX ".mjs")
target_link_options(gx_rv PRIVATE
  "-sEXPORTED_FUNCTIONS=['_gx_load_elf','_gx_init','_gx_reset','_gx_read_x','_gx_write_x','_gx_set_pc','_gx_get_pc','_gx_step','_gx_sym','_gx_ptr_bytes','_gx_icount','_malloc','_free']"
  "-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPU8']"
  "-sMODULARIZE=1" "-sEXPORT_ES6=1" "-sENVIRONMENT=web,worker,node" "-sASSERTIONS=1")
EOF

# Each config gets its OWN directory. Do NOT rename the artifacts: the generated
# .mjs hardcodes findWasmBinary() -> new URL("gx_rv.wasm", import.meta.url), so
# renaming the wasm breaks the module's reference to it. That was round 6.
B="$W/.build-$EXTC"
rm -rf "$B" && mkdir -p "$B" && cd "$B"
echo "## configuring with RISCV_EXT_C=$EXTC"
emcmake cmake -DCMAKE_BUILD_TYPE=Release \
  -DRISCV_32I=OFF -DRISCV_64I=ON \
  -DRISCV_EXT_C="$EXTC" -DRISCV_EXT_V=OFF \
  -DRISCV_MEMORY_TRAPS=OFF \
  -DRISCV_BINARY_TRANSLATION=OFF \
  -DRISCV_EXPERIMENTAL=ON \
  -DRISCV_ENCOMPASSING_ARENA=ON -DRISCV_ENCOMPASSING_ARENA_BITS=28 \
  .. > "$OUT/cmake-$EXTC.log" 2>&1 \
  || { echo "## CMAKE FAILED"; grep -iE "CMake Error|error" "$OUT/cmake-$EXTC.log" | head -8 | sed 's/^/   /'; exit 1; }

make wasm_example gx_rv -j"$(nproc)" > "$OUT/build-$EXTC.log" 2>&1 \
  || { echo "## BUILD FAILED"; grep -iE " error" "$OUT/build-$EXTC.log" | head -10 | sed 's/^/   /'; exit 1; }

grep -o "\-fexceptions" "$OUT/build-$EXTC.log" | head -1 | sed 's/^/## compile carries: /' || echo "## WARNING: -fexceptions not seen"
mkdir -p "$OUT/$EXTC" && cp "$B"/gx_rv.mjs "$B"/gx_rv.wasm "$OUT/$EXTC/" 2>/dev/null
echo "## THEIR control : $(ls -la "$B"/wasm_example.wasm 2>/dev/null | awk '{print $5}') bytes  wasm_example.wasm"
echo "## OUR wrapper   : $(stat -c%s "$OUT/$EXTC/gx_rv.wasm" 2>/dev/null) bytes  gx_rv.wasm"
test -f "$OUT/$EXTC/gx_rv.wasm"
