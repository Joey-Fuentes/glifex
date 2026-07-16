#!/usr/bin/env bash
# autopsy.sh <zig-bin> <src-dir> <label> [zig build flags...]
#
# WHY ROUND 1 SAW NOTHING. "zig build" drives the compiler as a child with
# --listen=- : the binary compiler-server protocol. Diagnostics go INTO that
# protocol stream, so a child that dies mid-protocol surfaces only as the build
# runner's own "error: the following command terminated unexpectedly". That
# message is the PARENT's, not the child's. The child never got to speak.
#
# So: let the build fail, lift the exact child command out of the failure text
# (round 1 proved it is printed there, on the line after the message), drop
# --listen=- , and run it directly. Now stderr and the signal reach us.
set -uo pipefail

ZIG="$1"; SRC="$2"; LABEL="$3"; shift 3
LOG="$GITHUB_WORKSPACE/zig-spike-out/autopsy-$LABEL.log"
cd "$SRC" || exit 1

echo "## host limits, in case this is a stack or memory wall rather than a bug:"
ulimit -a 2>/dev/null | sed 's/^/     /' || true
free -m 2>/dev/null | sed 's/^/     /' || true

( set -o pipefail; "$ZIG" build "$@" --prefix "$GITHUB_WORKSPACE/zig-spike-out/autopsy-$LABEL" ) > "$LOG" 2>&1
RC=$?
echo "## zig build rc=$RC"

CMD=$(awk '/the following command terminated unexpectedly:/{getline; print; exit}' "$LOG")
if [ -z "$CMD" ]; then
  echo "## no child command in the failure text -- it did not fail that way this time."
  tail -30 "$LOG" | sed 's/^/     /'
  exit 0
fi

echo "## the child command the build runner reported:"
echo "$CMD" | sed 's/^/     /'
CMD2=${CMD/ --listen=-/}
echo "## re-running it WITHOUT --listen=- so the child can actually speak:"
set +e
eval "$CMD2" 2>&1 | head -60 | sed 's/^/     /'
RC2=${PIPESTATUS[0]}
set -e
echo "## raw child exit status: $RC2"
case "$RC2" in
  139) echo "## 139 = 128+11 SIGSEGV -- a genuine crash inside the compiler" ;;
  134) echo "## 134 = 128+6  SIGABRT -- a panic or failed assert" ;;
  137) echo "## 137 = 128+9  SIGKILL -- almost certainly the OOM killer" ;;
  132) echo "## 132 = 128+4  SIGILL  -- often a reached-unreachable" ;;
  1)   echo "## 1 = an ordinary compile error, and the text above is it" ;;
  *)   echo "## exit $RC2" ;;
esac
echo "A/$LABEL-autopsy: child rc=$RC2" >> "$GITHUB_WORKSPACE/zig-spike-out/report.txt"
