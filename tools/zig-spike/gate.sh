#!/usr/bin/env bash
# gate.sh <zig.wasm> <outdir-with-crt-and-tgz> <src-tree> <katadir>
#
# The wasmtime gate: prove zig.wasm compiles Zig and the result runs, BEFORE
# spending Playwright time on it. Also decides WHICH kata spelling the browser
# demo will use -- round 3 encoded one spelling and called its failure a result.
#
# The FS layout mirrors the playground worker exactly: cwd holds main.zig and
# libcompiler_rt.a, /lib holds the std tree, /cache is writable and empty.
set -uo pipefail
ZW="$1"; OUT="$2"; SRC="$3"; KD="$4"
REPORT="$GITHUB_WORKSPACE/zig-spike-out/report.txt"
G="$HOME/gate"; rm -rf "$G"; mkdir -p "$G/lib" "$G/cache"
cp "$OUT/libcompiler_rt.a" "$G/" || { echo "G: no libcompiler_rt.a" >> "$REPORT"; exit 1; }
cp -r "$SRC/lib/std" "$G/lib/" || exit 1

for V in a b c; do
  echo "======== gate: kata spelling $V"
  cp "$KD/kata-$V.zig" "$G/main.zig"
  WANT=$(cat "$KD/expected-$V.txt")
  rm -f "$G/main.wasm"
  ( cd "$G" && timeout 600 wasmtime run --dir .::. --dir ./lib::/lib --dir ./cache::/cache \
      "$ZW" build-exe main.zig libcompiler_rt.a -fno-compiler-rt -fno-entry 2>&1 ) \
    | head -25 | sed 's/^/     /'
  if [ ! -s "$G/main.wasm" ]; then
    echo "     spelling $V: no main.wasm produced"
    continue
  fi
  GOT=$(cd "$G" && wasmtime run main.wasm 2>&1)
  echo "     spelling $V: main.wasm $(stat -c%s "$G/main.wasm") bytes, printed [$GOT], want [$WANT]"
  if [ "$GOT" = "$WANT" ]; then
    echo "$V" > "$GITHUB_WORKSPACE/zig-spike-out/spelling.txt"
    cp "$KD/kata-$V.zig" "$GITHUB_WORKSPACE/zig-spike-out/kata.zig"
    cp "$KD/expected-$V.txt" "$GITHUB_WORKSPACE/zig-spike-out/expected.txt"
    cp "$G/main.wasm" "$GITHUB_WORKSPACE/zig-spike-out/"
    echo "G: GATE PASS -- zig.wasm compiled kata-$V.zig to $(stat -c%s "$G/main.wasm") bytes; it printed $GOT" >> "$REPORT"
    exit 0
  fi
done
echo "G: GATE FAILED -- no kata spelling compiled AND printed its expected value" >> "$REPORT"
exit 1
