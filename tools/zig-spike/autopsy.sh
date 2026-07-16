#!/usr/bin/env bash
# autopsy.sh <zig-bin> <src-dir> <label> <stack-kb|unlimited> [zig build flags...]
#
# Round 2's autopsy REFUTED my own hypothesis, and that was its value. I predicted
# --listen=- was swallowing the child's diagnostics. With --listen=- removed the
# child STILL printed nothing and segfaulted: there was never a message to
# swallow. What it did establish is the only thing that mattered -- rc=139
# SIGSEGV, not 137 SIGKILL. So: not memory (14.5 GB free), not a compile error.
#
# Round 3 asks WHERE. The zig tarball binary is STRIPPED ("statically linked,
# stripped" -- round 1's file(1)), so a gdb backtrace is addresses, not names.
# Do not pretend otherwise. But stripped or not, ONE comparison decides the open
# question:
#
#     if the FAULT ADDRESS sits just below the STACK POINTER  -> stack exhaustion
#     if it is far away, or near null                         -> a real backend bug
#
# and the kernel prints both, without gdb, in dmesg:
#     zig[2547]: segfault at 7ffc.. ip 55.. sp 7ffc.. error 6 in zig[..]
# That is why this leans on dmesg first and treats gdb as a bonus.
set -uo pipefail

ZIG="$1"; SRC="$2"; LABEL="$3"; STACK="$4"; shift 4
LOG="$GITHUB_WORKSPACE/zig-spike-out/autopsy-$LABEL.log"
REPORT="$GITHUB_WORKSPACE/zig-spike-out/report.txt"
cd "$SRC" || exit 1

ulimit -s "$STACK" 2>/dev/null || true
ulimit -c unlimited 2>/dev/null || true
echo "## stack=$(ulimit -s)  core=$(ulimit -c)"
sudo sysctl -w kernel.core_pattern="$GITHUB_WORKSPACE/zig-spike-out/core.%p" >/dev/null 2>&1 \
  && echo "## core_pattern redirected to the artifact dir" \
  || echo "## could not set core_pattern (apport may eat the core); dmesg is the fallback"

sudo dmesg -C 2>/dev/null || true    # clear, so the only segfault line is ours

( set -o pipefail; "$ZIG" build "$@" --prefix "$GITHUB_WORKSPACE/zig-spike-out/autopsy-$LABEL" ) > "$LOG" 2>&1
echo "## zig build rc=$?"

CMD=$(awk '/the following command terminated unexpectedly:/{getline; print; exit}' "$LOG")
if [ -z "$CMD" ]; then
  echo "## no child command in the failure text -- it did not fail that way this time."
  tail -25 "$LOG" | sed 's/^/     /'
  exit 0
fi
CMD2=${CMD/ --listen=-/}
echo "## re-running the child directly, no --listen=- :"
set +e
eval "$CMD2" 2>&1 | head -25 | sed 's/^/     /'
RC2=${PIPESTATUS[0]}
set -e
echo "## child exit status: $RC2"
case "$RC2" in
  139) echo "## 139 = 128+11 SIGSEGV" ;;
  137) echo "## 137 = 128+9  SIGKILL -- memory, not a compiler bug" ;;
  134) echo "## 134 = 128+6  SIGABRT" ;;
  0)   echo "## 0 -- it did NOT crash this time. The stack limit is the difference." ;;
  *)   echo "## exit $RC2" ;;
esac

echo "## what the KERNEL saw:"
SEG=$(sudo dmesg 2>/dev/null | grep -i "segfault\|general protection" | tail -3)
if [ -n "$SEG" ]; then
  echo "$SEG" | sed 's/^/     /'
  python3 - "$SEG" <<'PY'
import re, sys
line = sys.argv[1]
m = re.search(r"segfault at ([0-9a-f]+).*\bsp ([0-9a-f]+)", line)
if not m:
    print("     (no fault/sp pair to compare)"); raise SystemExit
fault, sp = int(m.group(1), 16), int(m.group(2), 16)
d = fault - sp
print("     fault=0x%x  sp=0x%x  fault-sp=%d bytes" % (fault, sp, d))
if abs(d) < 1 << 20:
    print("     VERDICT: the fault is within 1 MB of the stack pointer -> STACK EXHAUSTION.")
    print("              This is a limit, not a compiler bug. Raise it and route A opens.")
elif fault < 1 << 16:
    print("     VERDICT: fault address is near NULL -> a null deref. A real backend bug.")
else:
    print("     VERDICT: fault is %d bytes from sp -- NOT the stack. A real backend bug;" % d)
    print("              a raised limit will not fix it and a newer zig is the only lever.")
PY
else
  echo "     (dmesg has no segfault line -- may need sudo, or the core was eaten)"
fi

C=$(ls -1 "$GITHUB_WORKSPACE/zig-spike-out"/core.* 2>/dev/null | head -1 || true)
if [ -n "$C" ] && command -v gdb >/dev/null 2>&1; then
  echo "## gdb on the core. The binary is STRIPPED, so expect addresses, not names."
  echo "## The useful signal is the DEPTH: hundreds of identical frames = runaway recursion."
  gdb -batch -ex "bt 25" -ex "info registers rsp rip" "$ZIG" "$C" 2>&1 | head -40 | sed 's/^/     /'
  echo "## frame count (a stack overflow shows a very large number here):"
  gdb -batch -ex "bt -1" "$ZIG" "$C" 2>&1 | grep -c "^#" | sed 's/^/     frames: /'
else
  echo "## no core file to inspect (core_pattern or ulimit -c blocked it)"
fi
echo "A/$LABEL-autopsy: child rc=$RC2 stack=$(ulimit -s)" >> "$REPORT"
