#!/usr/bin/env bash
# gate.sh <zig.wasm> <outdir-with-crt-and-tgz> <src-tree> <katadir> <label>
#
# LABELLED, because round 7 gates several compilers in one run: upstream 0.16.0
# patched, upstream 0.16.0 plain, and the fork. 0.16.0 is the only one that can
# ship: it is the newest RELEASE, so the CLI can pin it via brew/ziglang.org.
# The fork stamps version-string "0.17.0" but there IS no 0.17 release, and a
# nightly pin is not a pin -- round 2 watched 0.17.0-dev.1413 404 on every mirror.
#
# The wasmtime gate: prove zig.wasm compiles Zig and the result runs, BEFORE
# spending Playwright time on it. Also decides WHICH kata spelling the browser
# demo will use -- round 3 encoded one spelling and called its failure a result.
#
# The FS layout mirrors the playground worker exactly: cwd holds main.zig and
# libcompiler_rt.a, /lib holds the std tree, /cache is writable and empty.
set -uo pipefail
ZW="$1"; OUT="$2"; SRC="$3"; KD="$4"; LABEL="$5"
REPORT="$GITHUB_WORKSPACE/zig-spike-out/report.txt"
G="$HOME/gate-$LABEL"; rm -rf "$G"; mkdir -p "$G/lib" "$G/cache"
cp "$OUT/libcompiler_rt.a" "$G/" || { echo "G/$LABEL: no libcompiler_rt.a" >> "$REPORT"; exit 1; }
cp -r "$SRC/lib/std" "$G/lib/" || exit 1

for V in a b c; do
  echo "======== gate [$LABEL]: kata spelling $V"
  cp "$KD/kata-$V.zig" "$G/main.zig"
  WANT=$(cat "$KD/expected-$V.txt")
  rm -f "$G/main.wasm"
  ( cd "$G" && timeout 600 wasmtime run --dir .::. --dir ./lib::/lib --dir ./cache::/cache \
      "$ZW" build-exe main.zig libcompiler_rt.a -fno-compiler-rt -fno-entry 2>&1 ) \
    | head -25 | sed 's/^/     /'
  if [ ! -s "$G/main.wasm" ]; then
    echo "     spelling $V: no main.wasm produced on $LABEL"
    continue
  fi
  GOT=$(cd "$G" && wasmtime run main.wasm 2>&1)
  echo "     spelling $V: main.wasm $(stat -c%s "$G/main.wasm") bytes, printed [$GOT], want [$WANT]"
  if [ "$GOT" = "$WANT" ]; then
    echo "$V" > "$GITHUB_WORKSPACE/zig-spike-out/spelling-$LABEL.txt"
    cp "$KD/kata-$V.zig" "$GITHUB_WORKSPACE/zig-spike-out/kata-$LABEL.zig"
    cp "$KD/expected-$V.txt" "$GITHUB_WORKSPACE/zig-spike-out/expected-$LABEL.txt"
    cp "$G/main.wasm" "$GITHUB_WORKSPACE/zig-spike-out/main-$LABEL.wasm"
    echo "G/$LABEL: GATE PASS -- compiled kata-$V.zig to $(stat -c%s "$G/main.wasm") bytes; it printed $GOT" >> "$REPORT"
    exit 0
  fi
done
# Which spelling compiles is itself a FINDING: the fork is a 0.17-dev tree and
# accepted "pub fn main(init: std.process.Init)". Upstream 0.16.0 is a different
# std and may need a different spelling -- or none of the three. That is exactly
# why all three are tried instead of one being encoded.
echo "G/$LABEL: GATE FAILED -- no kata spelling compiled AND printed its expected value" >> "$REPORT"
exit 1
