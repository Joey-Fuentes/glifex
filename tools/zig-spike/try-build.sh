#!/usr/bin/env bash
# try-build.sh <zig-bin> <src-dir> <label> [zig build flags...]
#
# Round 1's report line LIED. The step ran
#     time zig build ... | tail -80
# under GitHub's default shell, "bash -e {0}" -- which has NO pipefail. The
# pipeline's status was tail's (0), set -e never fired, and the step walked
# straight into an unconditional "P3 built something" echo while no wasm existed.
# The artifact listing told the truth; my own report contradicted it.
#
# The fix is structural, not a promise to be careful:
#   1. pipefail ON, and the build's status captured explicitly.
#   2. The report line is gated on a wasm that EXISTS AND IS NON-EMPTY -- never
#      on control reaching a line. rc=0 with no artifact still reports FAILED.
set -uo pipefail

ZIG="$1"; SRC="$2"; LABEL="$3"; shift 3
OUT="$GITHUB_WORKSPACE/zig-spike-out/routeA-$LABEL"
LOG="$GITHUB_WORKSPACE/zig-spike-out/build-$LABEL.log"
REPORT="$GITHUB_WORKSPACE/zig-spike-out/report.txt"

rm -rf "$OUT"
cd "$SRC" || { echo "A/$LABEL: FAILED no src dir $SRC" >> "$REPORT"; exit 1; }

echo "## [$LABEL] $ZIG build $*"
( set -o pipefail; time "$ZIG" build "$@" --prefix "$OUT" ) > "$LOG" 2>&1
RC=$?
echo "## [$LABEL] real exit status: $RC"
tail -45 "$LOG" | sed 's/^/     /'

WASM=$(find "$OUT" -name '*.wasm' 2>/dev/null | head -1 || true)
if [ -n "$WASM" ] && [ -s "$WASM" ]; then
  SZ=$(stat -c%s "$WASM")
  echo "A/$LABEL: BUILT $WASM $SZ bytes (rc=$RC)" >> "$REPORT"
  echo "$WASM" > "$GITHUB_WORKSPACE/zig-spike-out/routeA-$LABEL.path"
  echo "## [$LABEL] BUILT $WASM ($SZ bytes)"
  exit 0
fi
echo "A/$LABEL: FAILED rc=$RC, no wasm under $OUT" >> "$REPORT"
echo "## [$LABEL] FAILED rc=$RC and no wasm exists -- the report says so"
exit 1
