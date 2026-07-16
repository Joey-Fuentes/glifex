# Build our wrapper THROUGH libriscv's own CMake -- round 2 failed because I
# hand-rolled emcc and skipped the config step that generates
# libriscv_settings.h. Their examples/wasm builds fine; use their build system
# rather than reinventing it.
cmake_minimum_required(VERSION 3.13)
project(gx_rv CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_BUILD_TYPE Release)

# -fexceptions MUST be on the COMPILE step, not just the link. libriscv throws
# (its ELF loader especially), and emscripten routes throw/catch through
# invoke_* trampolines in the indirect function table. Without this at compile
# time that table is never populated and the first throw dies with
# "RuntimeError: table index is out of bounds" -- which is exactly how round 3
# failed. Round 2's hand-rolled emcc had -fexceptions; converting to CMake lost
# it, and the symptom named a table rather than an exception.
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fexceptions")

# LIBRISCV_DIR is passed in; lib/ is what generates the settings header.
add_subdirectory(${LIBRISCV_DIR}/lib libriscv)

add_executable(gx_rv gx_rv.cpp)
target_link_libraries(gx_rv riscv)

# Same emscripten surface as gx_vixl (Bx-10), so asm-arm64-core.mjs's driving
# pattern ports unchanged. STACK_SIZE is deliberately generous: Bx-10 lost three
# rounds to emscripten's 64 KB default blowing a static initializer inside
# __wasm_call_ctors, and STACK_OVERFLOW_CHECK is what turned an anonymous OOB
# trap into a named abort.
set_target_properties(gx_rv PROPERTIES
  LINK_FLAGS "-fexceptions -sASSERTIONS=1 -sSTACK_SIZE=8388608 -sINITIAL_MEMORY=67108864 -sSTACK_OVERFLOW_CHECK=1 \
-sALLOW_MEMORY_GROWTH=1 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node \
-sEXPORTED_FUNCTIONS=['_gx_init','_gx_load_elf','_gx_reset','_gx_read_x','_gx_write_x','_gx_set_pc','_gx_get_pc','_gx_step','_gx_sym','_gx_ptr_bytes','_gx_icount','_malloc','_free'] \
-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPU8'] \
-sEXPORT_NAME=gx_rv"
  SUFFIX ".mjs")
