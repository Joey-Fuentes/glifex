#!/usr/bin/env bash
# get-src.sh <label> <destdir>
#
# The compiler source must match the compiler binary or "zig build" is compiling
# a different program than the one running. For a RELEASE the tag is the label.
# For a NIGHTLY the semver build metadata after "+" IS THE COMMIT -- round 2's
# master resolved to 0.17.0-dev.1413+addc3c3b8, so addc3c3b8 is the exact tree
# that binary was cut from. Use it, rather than cloning master and hoping it has
# not moved since.
set -uo pipefail
LABEL="$1"; DEST="$2"
rm -rf "$DEST"; mkdir -p "$DEST"
cd "$DEST" || exit 1

case "$LABEL" in
  *+*)
    SHA="${LABEL##*+}"
    echo "## $LABEL is a nightly; its build metadata names commit $SHA"
    git init -q .
    git remote add origin https://github.com/ziglang/zig.git
    if git fetch -q --depth 1 origin "$SHA" 2>/dev/null && git checkout -q FETCH_HEAD; then
      echo "## src at $(git rev-parse HEAD) -- exactly the tree the binary was built from"
    else
      echo "## could not fetch $SHA directly; falling back to master HEAD (NOT an exact match)"
      git fetch -q --depth 1 origin master && git checkout -q FETCH_HEAD || exit 1
      echo "## src at $(git rev-parse HEAD) -- master HEAD, may differ from the binary"
    fi
    ;;
  *)
    cd .. && rm -rf "$DEST"
    git clone -q --depth 1 --branch "$LABEL" https://github.com/ziglang/zig.git "$DEST" || exit 1
    cd "$DEST" && echo "## src at $(git rev-parse HEAD) (tag $LABEL)"
    ;;
esac
echo "## tree $(du -sh . 2>/dev/null | cut -f1), dev.zig $(test -f src/dev.zig && echo present || echo ABSENT)"
