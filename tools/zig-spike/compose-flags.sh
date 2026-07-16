#!/usr/bin/env bash
# compose-flags.sh <zig-bin> <src-dir> [dev-preset]
#
# Echo "zig build" flags composed from THIS zig's REAL --help. Round 1 proved the
# technique: every option it picked existed, and zig lowered them correctly to
# -fno-llvm -fno-lld -fstrip -fsingle-threaded. Kept because master's build.zig
# need not match 0.14.0's -- and a wrong guess costs a 40-minute round trip.
#
# The dev preset is checked against the help's OWN Supported Values list rather
# than assumed: a substring match on a value that no longer exists would compose
# a flag that fails the build for the wrong reason.
set -uo pipefail
ZIG="$1"; SRC="$2"; DEV="${3:-}"
cd "$SRC" || exit 1
HELP=$("$ZIG" build --help 2>&1 || true)
has() { printf '%s' "$HELP" | grep -q -- "$1"; }

F="-Dtarget=wasm32-wasi -Doptimize=ReleaseSmall"
if has "-Duse-llvm=";        then F="$F -Duse-llvm=false"; fi
if has "-Denable-llvm=";     then F="$F -Denable-llvm=false"; fi
if has "-Dsingle-threaded="; then F="$F -Dsingle-threaded=true"; fi
if has "-Dstrip=";           then F="$F -Dstrip=true"; fi
if has "-Dno-lib=";          then F="$F -Dno-lib"; fi

if [ -n "$DEV" ]; then
  if ! has "-Ddev="; then
    echo "compose-flags: this zig has no -Ddev option; skipping preset $DEV" >&2
  elif printf '%s' "$HELP" | grep -qE "^[[:space:]]+$DEV$"; then
    F="$F -Ddev=$DEV"
  else
    echo "compose-flags: -Ddev exists but has no value named $DEV; skipping" >&2
    printf '%s' "$HELP" | sed -n '/-Ddev=/,/^[[:space:]]*-D/p' | sed 's/^/    /' >&2
  fi
fi
printf '%s' "$F"
