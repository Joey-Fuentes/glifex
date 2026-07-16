#!/usr/bin/env bash
# try-build.sh <zig-bin> <src-dir> <label> <stack-kb|unlimited> [zig build flags...]
#
# Round 1's report line LIED: "zig build ... | tail -80" under GitHub's default
# "bash -e {0}" (NO pipefail) returned tail's status, set -e never fired, and the
# step walked into an unconditional success echo while no wasm existed. Fixed
# structurally, not by promising care:
#   1. pipefail on, real exit status captured.
#   2. The report line is gated on a wasm that EXISTS and is NON-EMPTY. rc=0 with
#      no artifact still reports FAILED. Proven against a fake zig that exits 0
#      producing nothing.
#
# The stack argument is round 3's point. Round 2's crash was a silent SIGSEGV at
# a 16 MB RLIMIT_STACK with 14.5 GB free -- a stack-exhaustion shape. Note the
# glibc subtlety this ladder exists to handle: pthread's DEFAULT stack size is
# RLIMIT_STACK, but when RLIMIT_STACK is UNLIMITED glibc falls back to 8 MB. The
# compiler runs Sema on a thread pool, so "unlimited" can be WORSE than a large
# explicit value. That is why this takes a number and reports what it really got.
set -uo pipefail

ZIG="$1"; SRC="$2"; LABEL="$3"; STACK="$4"; shift 4
OUT="$GITHUB_WORKSPACE/zig-spike-out/routeA-$LABEL"
LOG="$GITHUB_WORKSPACE/zig-spike-out/build-$LABEL.log"
REPORT="$GITHUB_WORKSPACE/zig-spike-out/report.txt"

rm -rf "$OUT"
cd "$SRC" || { echo "A/$LABEL: FAILED no src dir $SRC" >> "$REPORT"; exit 1; }

echo "## [$LABEL] hard stack limit is $(ulimit -Hs); requesting $STACK"
ulimit -s "$STACK" 2>/dev/null || echo "## [$LABEL] could not set stack to $STACK"
ACTUAL=$(ulimit -s)
echo "## [$LABEL] stack is now $ACTUAL"
if [ "$ACTUAL" != "$STACK" ]; then
  # An unreported failed ulimit would silently turn this arm into a duplicate of
  # the control and quietly "confirm" the wrong conclusion.
  echo "## [$LABEL] WARNING requested $STACK but got $ACTUAL -- this arm is NOT testing what it claims"
  echo "A/$LABEL: stack requested=$STACK actual=$ACTUAL" >> "$REPORT"
fi

echo "## [$LABEL] $ZIG build $*"
( set -o pipefail; time "$ZIG" build "$@" --prefix "$OUT" ) > "$LOG" 2>&1
RC=$?
echo "## [$LABEL] real exit status: $RC (stack=$ACTUAL)"
tail -35 "$LOG" | sed 's/^/     /'

WASM=$(find "$OUT" -name '*.wasm' 2>/dev/null | head -1 || true)
if [ -n "$WASM" ] && [ -s "$WASM" ]; then
  SZ=$(stat -c%s "$WASM")
  echo "A/$LABEL: BUILT $WASM $SZ bytes (rc=$RC stack=$ACTUAL)" >> "$REPORT"
  echo "$WASM" > "$GITHUB_WORKSPACE/zig-spike-out/routeA-$LABEL.path"
  echo "## [$LABEL] BUILT $WASM ($SZ bytes)"
  exit 0
fi
echo "A/$LABEL: FAILED rc=$RC stack=$ACTUAL, no wasm" >> "$REPORT"
echo "## [$LABEL] FAILED rc=$RC and no wasm exists -- the report says so"
exit 1
