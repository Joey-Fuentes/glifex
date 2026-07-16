#!/usr/bin/env bash
# fork-delta.sh <fork-sha> <workdir>
#
# THE QUESTION THAT DECIDES BX-11 IN PRODUCTION: what does zigtools/zig's
# wasm32-wasi branch ACTUALLY change against upstream?
#
# Round 7 proved the published zig.patch is NOT the delta. Upstream 0.16.0 fails
# to build for wasm32-wasi with
#     src/main.zig:3743: error: expected type '?[]const u8', found 'void'
#                        self_exe_path,
# which is in main.zig and nowhere near dev.zig. So the fork fixes things the
# 8-line patch never mentions. "Vendor 8 lines against a pinned tag" is dead as
# stated -- but "vendor the WHOLE delta" may be perfectly fine, if the delta is
# small. Nobody has looked. That is all this does: look.
#
# Also reports WHICH upstream release the fork branched from. If its base is far
# past 0.16.0, no amount of patching gets 0.16.0 there, and that is the answer.
set -uo pipefail
SHA="$1"; W="$2"
OUT="$GITHUB_WORKSPACE/zig-spike-out"
REPORT="$OUT/report.txt"
rm -rf "$W"; mkdir -p "$W"; cd "$W" || exit 1

# blobless: all commits and trees, blobs fetched on demand. Enough for merge-base
# and log; the diff pulls only the blobs it needs.
git init -q .
git remote add origin https://github.com/zigtools/zig
git remote add upstream https://github.com/ziglang/zig
echo "## fetching the fork branch (blobless)"
git fetch -q --filter=blob:none origin wasm32-wasi || { echo "D: fork fetch failed" >> "$REPORT"; exit 1; }
echo "## fetching upstream master (blobless)"
git fetch -q --filter=blob:none upstream master || { echo "D: upstream fetch failed" >> "$REPORT"; exit 1; }
echo "## fetching upstream tags"
git fetch -q --filter=blob:none upstream 'refs/tags/*:refs/tags/*' || true

git cat-file -e "$SHA^{commit}" 2>/dev/null || { echo "## $SHA not present after fetch"; exit 1; }
echo "## fork head: $(git log -1 --format='%h %cd %s' --date=short "$SHA")"

BASE=""
BASE=$(git merge-base "$SHA" upstream/master 2>/dev/null) || true
if [ -z "$BASE" ]; then
  echo "## no merge-base with upstream/master -- the fork may be rebased or unrelated"
  echo "D: no merge-base found" >> "$REPORT"
  exit 1
fi
echo "## merge-base with upstream/master: $(git log -1 --format='%h %cd %s' --date=short "$BASE")"

# Which release is that base near? If it is well past 0.16.0, then no patch gets
# 0.16.0 there and the CLI-parity plan must target whatever ships next.
DESC=$(git describe --tags --abbrev=0 "$BASE" 2>/dev/null || echo "none")
echo "## nearest upstream tag at or before the base: $DESC"
echo "## is the base an ancestor of tag 0.16.0 (i.e. is the fork based at/below 0.16.0)?"
if git merge-base --is-ancestor "$BASE" 0.16.0 2>/dev/null; then
  echo "     YES -- 0.16.0 contains the fork's base. Patching 0.16.0 is coherent."
else
  echo "     NO -- the fork's base is AFTER 0.16.0. A 0.16.0 build can never carry"
  echo "     these commits, and CLI parity must target a later release."
fi

echo
echo "## THE DELTA -- every commit the fork carries on top of upstream:"
git log --oneline --no-merges "$BASE..$SHA" | sed 's/^/     /'
N=$(git log --oneline --no-merges "$BASE..$SHA" | wc -l)
echo "## $N commit(s)"
echo
echo "## files touched:"
git diff --stat "$BASE..$SHA" | sed 's/^/     /'
git diff "$BASE..$SHA" > "$OUT/fork-delta.patch" 2>/dev/null || true
if [ -s "$OUT/fork-delta.patch" ]; then
  L=$(wc -l < "$OUT/fork-delta.patch")
  F=$(git diff --name-only "$BASE..$SHA" | wc -l)
  echo "## fork-delta.patch: $L lines across $F file(s) -- saved to the artifact"
  echo "D: fork delta = $N commit(s), $F file(s), $L patch lines" >> "$REPORT"
  echo
  echo "## does the published zig.patch account for it? (dev.zig only, or more?)"
  git diff --name-only "$BASE..$SHA" | sed 's/^/     touched: /'
else
  echo "## the diff is EMPTY -- the fork carries nothing over its base?"
  echo "D: fork delta is empty" >> "$REPORT"
fi
