#!/usr/bin/env bash
# build.sh <out-dir>
#
# STOP INVENTING THE BUILD. Their examples/wasm builds and runs; mine does not.
# Round 3 hand-rolled emcc and died on a generated header. Round 4 wrote its own
# CMakeLists, got -fexceptions right, and STILL died -- "table index is out of
# bounds" inside invoke_* -- because I copied their structure and invented their
# OPTIONS. libriscv has build switches (binary translation, JIT paths) that
# cannot work under wasm, and their example must already turn them off.
#
# Round 2's probe printed their CMakeLists and the log truncated at line 1, so I
# have never actually read the config that works. This round reads it, prints it
# whole, and then builds our wrapper INSIDE their example -- same CMakeLists,
# same flags, one source swapped. Minimal deviation from a known-good build.
set -uo pipefail
OUT="${1:?}"; mkdir -p "$OUT"
HERE="$(cd "$(dirname "$0")" && pwd)"
D="$HOME/rv-libriscv"
[ -d "$D" ] || git clone --depth 1 https://github.com/libriscv/libriscv.git "$D" >/dev/null 2>&1
echo "## libriscv $(git -C "$D" rev-parse --short HEAD)"
. "$EMSDK/emsdk_env.sh" >/dev/null 2>&1 || true

echo
echo "## ================= THE KNOWN-GOOD BUILD, IN FULL ================="
echo "## Everything that works about this is in these files. Read them."
for f in "$D/examples/wasm/CMakeLists.txt" "$D/examples/wasm/build.sh" "$D/examples/wasm/main.cpp"; do
  [ -f "$f" ] || continue
  echo "---- ${f#$D/}"
  cat "$f" | sed 's/^/   /'
  echo
done
echo "## ---- libriscv's own options (what must be OFF under wasm?) ----"
grep -n "option(\|set(RISCV" "$D/lib/CMakeLists.txt" 2>/dev/null | head -25 | sed 's/^/   /'

echo
echo "## ================= BUILD OURS INSIDE THEIRS ================="
W="$OUT/wasmex"
rm -rf "$W" && cp -r "$D/examples/wasm" "$W"
cp "$HERE/gx_rv.cpp" "$W/gx_rv.cpp"
# Swap their main.cpp for ours in whatever target they declare, and add our
# exports to whatever link flags they already use -- do not replace their flags.
if [ -f "$W/CMakeLists.txt" ]; then
  sed -i 's/main\.cpp/gx_rv.cpp/g' "$W/CMakeLists.txt"
  cat >> "$W/CMakeLists.txt" <<'EOF'

# Appended by the glifex spike: keep every flag their example already sets and
# only ADD the C API surface we need. Their example is the known-good build.
get_property(_gx_targets DIRECTORY PROPERTY BUILDSYSTEM_TARGETS)
list(GET _gx_targets 0 _gx_main)
message(STATUS "glifex: attaching exports to target ${_gx_main}")
target_link_options(${_gx_main} PRIVATE
  "-sEXPORTED_FUNCTIONS=['_gx_load_elf','_gx_init','_gx_reset','_gx_read_x','_gx_write_x','_gx_set_pc','_gx_get_pc','_gx_step','_gx_sym','_gx_ptr_bytes','_gx_icount','_malloc','_free']"
  "-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPU8']"
  "-sMODULARIZE=1" "-sEXPORT_ES6=1" "-sENVIRONMENT=web,worker,node"
  "-sALLOW_MEMORY_GROWTH=1" "-sASSERTIONS=1")
set_target_properties(${_gx_main} PROPERTIES SUFFIX ".mjs")
EOF
fi
cd "$W"
if ! emcmake cmake -B build -DCMAKE_BUILD_TYPE=Release . > "$OUT/cmake.log" 2>&1; then
  echo "## CMAKE FAILED"; grep -iE "error|CMake Error" "$OUT/cmake.log" | head -12 | sed 's/^/   /'; exit 1
fi
grep -i "glifex: attaching" "$OUT/cmake.log" | sed 's/^/## /'
if ! cmake --build build -j"$(nproc)" > "$OUT/build.log" 2>&1; then
  echo "## BUILD FAILED"; grep -iE "error" "$OUT/build.log" | head -12 | sed 's/^/   /'; exit 1
fi
grep -o "\-fexceptions\|\-fwasm-exceptions" "$OUT/build.log" | sort -u | sed 's/^/## compile carries: /'
find build -name "*.mjs" -o -name "*.wasm" -o -name "*.js" | head -6 | sed 's/^/   /'
M=$(find build -name "*.mjs" | head -1)
[ -n "$M" ] && { cp "$M" "$OUT/gx_rv.mjs"; cp "${M%.mjs}.wasm" "$OUT/gx_rv.wasm" 2>/dev/null; echo "## WRAPPER BUILT: $(stat -c%s "$OUT/gx_rv.wasm" 2>/dev/null) bytes"; } \
  || echo "## no .mjs produced -- see the file list above"
