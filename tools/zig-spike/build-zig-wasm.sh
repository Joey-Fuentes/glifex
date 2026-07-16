#!/usr/bin/env bash
# build-zig-wasm.sh <host-zig> <zig-src> <label> <outdir>
#
# THE RECIPE, lifted from zigtools/playground's build.zig -- which is in
# production at playground.zigtools.org. Reproduced with ONE thing deliberately
# ABSENT, and that absence is the entire point:
#
#                        *** NO -Duse-llvm=false ***
#
# That flag killed rounds 1-4. zig's own --help distinguishes two options I
# treated as one:
#     -Duse-llvm       Use the llvm backend                                 <- what the HOST compiles WITH
#     -Denable-llvm    Build self-hosted compiler with LLVM backend enabled <- what the RESULT CONTAINS
# I set BOTH to false. -Duse-llvm=false forced the HOST to build zig.wasm using
# zig's own self-hosted wasm backend -- the path that SIGSEGVs on a wild pointer
# at ip=0xa596a4b. The playground lets the host use LLVM, because the host is a
# build machine and nobody cares what it links; -Ddev=wasm is what keeps LLVM out
# of the ARTIFACT. Four rounds of crashes were self-inflicted, on a road nothing
# required us to walk.
#
# So this composer will not set use-llvm at all, and asserts that it has not.
set -uo pipefail
ZIG="$1"; SRC="$2"; LABEL="$3"; OUT="$4"
REPORT="$GITHUB_WORKSPACE/zig-spike-out/report.txt"
mkdir -p "$OUT"
cd "$SRC" || { echo "B/$LABEL: FAILED no src" >> "$REPORT"; exit 1; }

HELP=$("$ZIG" build --help 2>&1 || true)
has() { printf '%s' "$HELP" | grep -q -- "$1"; }

# Exactly the playground's five, no more:
#   .target .optimize .@"version-string" .@"no-lib" .dev
F="-Dtarget=wasm32-wasi -Doptimize=ReleaseSmall"
if has "-Dno-lib=";         then F="$F -Dno-lib=true"; fi
if has "-Dversion-string="; then F="$F -Dversion-string=0.17.0"; fi
if has "-Ddev="; then
  if printf '%s' "$HELP" | grep -qE "^[[:space:]]+wasm$"; then
    F="$F -Ddev=wasm"
  else
    echo "## [$LABEL] -Ddev exists but has no 'wasm' value -- this source cannot do route A"
    echo "B/$LABEL: FAILED -Ddev has no wasm value" >> "$REPORT"; exit 1
  fi
else
  echo "## [$LABEL] no -Ddev option at all -- wrong source tree?"
  echo "B/$LABEL: FAILED no -Ddev option" >> "$REPORT"; exit 1
fi

# A guard, not a comment: the flag that caused four rounds of segfaults must not
# be able to sneak back in via a future edit to the lines above.
case "$F" in
  *use-llvm*) echo "## [$LABEL] GUARD: use-llvm is in the flags. That is the round 1-4 bug."; exit 1 ;;
esac
echo "## [$LABEL] host WILL use LLVM (correctly). Flags: $F"

LOG="$GITHUB_WORKSPACE/zig-spike-out/build-$LABEL.log"
( set -o pipefail; time "$ZIG" build $F --prefix "$OUT" ) > "$LOG" 2>&1
RC=$?
echo "## [$LABEL] zig build rc=$RC"
tail -25 "$LOG" | sed 's/^/     /'

W=$(find "$OUT" -name 'zig.wasm' 2>/dev/null | head -1 || true)
if [ -z "$W" ] || [ ! -s "$W" ]; then
  echo "B/$LABEL: FAILED rc=$RC, no zig.wasm" >> "$REPORT"
  echo "## [$LABEL] no zig.wasm -- the report says so"
  exit 1
fi
echo "## [$LABEL] zig.wasm = $(stat -c%s "$W") bytes"

# compiler_rt, precompiled on the HOST: playground's zig.ts says plainly
# "manually linked because the self hosted webassembly backend cannot compile it
# by itself". So the guest is handed a ready-made .a and told -fno-compiler-rt.
( cd "$OUT" && "$ZIG" build-lib "$SRC/lib/compiler_rt.zig" -target wasm32-wasi \
    -OReleaseSmall --name compiler_rt ) > "$OUT/crt.log" 2>&1
CRT=$(find "$OUT" -name 'libcompiler_rt.a' 2>/dev/null | head -1 || true)
if [ -z "$CRT" ]; then
  echo "## [$LABEL] compiler_rt did NOT build:"; tail -12 "$OUT/crt.log" | sed 's/^/     /'
  echo "B/$LABEL: zig.wasm ok but compiler_rt FAILED" >> "$REPORT"; exit 1
fi
echo "## [$LABEL] libcompiler_rt.a = $(stat -c%s "$CRT") bytes"

# Only lib/std -- playground ships exactly this, not the 196 MB lib/. This is
# the Rust-sysroot problem from Bx-6, and they already solved it.
tar -czf "$OUT/zig.tar.gz" -C "$SRC" lib/std || { echo "B/$LABEL: tar failed" >> "$REPORT"; exit 1; }
echo "## [$LABEL] zig.tar.gz (lib/std only) = $(stat -c%s "$OUT/zig.tar.gz") bytes"
echo "     vs the whole lib/ which is $(du -sh "$SRC/lib" | cut -f1)"

echo "$W" > "$GITHUB_WORKSPACE/zig-spike-out/zigwasm-$LABEL.path"
echo "B/$LABEL: BUILT zig.wasm $(stat -c%s "$W") + crt $(stat -c%s "$CRT") + std.tgz $(stat -c%s "$OUT/zig.tar.gz")" >> "$REPORT"
