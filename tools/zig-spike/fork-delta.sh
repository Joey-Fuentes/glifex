#!/usr/bin/env bash
# fork-delta.sh <fork-sha> <workdir>
#
# ROUND 8 MEASURED THIS AGAINST THE WRONG BASELINE AND GOT NONSENSE:
#     D: fork delta = 1588 commit(s), 5765 file(s), 728279 patch lines
# I diffed against upstream/master. The fork branched from the 0.16.0 RELEASE,
# which master does not contain, so the "delta" swallowed 1588 unrelated
# release-branch commits -- and I then concluded "the fork's base is AFTER
# 0.16.0", which is exactly backwards.
#
# The log was already saying it plainly:
#     fork head: 1c430bc13 2026-04-17 "make it possible compile to wasm32-wasi with -Ddev=wasm"
#     ...and "24fdd5b7a Release 0.16.0" sits in its ancestry.
# The fork is 0.16.0 plus a handful of commits, and one of them is titled after
# the exact thing we want.
#
# So: baseline on the newest TAG that is an ancestor of the fork head. That is
# what "what does this fork add" actually means.
set -uo pipefail
SHA="$1"; W="$2"
OUT="$GITHUB_WORKSPACE/zig-spike-out"
REPORT="$OUT/report.txt"
rm -rf "$W"; mkdir -p "$W"; cd "$W" || exit 1

git init -q .
git remote add origin https://github.com/zigtools/zig
git remote add upstream https://github.com/ziglang/zig
echo "## fetching the fork branch (blobless)"
git fetch -q --filter=blob:none origin wasm32-wasi || { echo "D: fork fetch failed" >> "$REPORT"; exit 1; }
echo "## fetching upstream tags"
git fetch -q --filter=blob:none upstream 'refs/tags/*:refs/tags/*' || { echo "D: tag fetch failed" >> "$REPORT"; exit 1; }

git cat-file -e "$SHA^{commit}" 2>/dev/null || { echo "## $SHA not present"; exit 1; }
echo "## fork head: $(git log -1 --format='%h %cd %s' --date=short "$SHA")"

# The newest tag reachable FROM the fork head. Not merge-base with master --
# that was round 8's mistake.
TAG=$(git describe --tags --abbrev=0 "$SHA" 2>/dev/null || echo "")
if [ -z "$TAG" ]; then
  echo "## no tag is an ancestor of the fork head; cannot baseline"
  echo "D: no ancestor tag" >> "$REPORT"; exit 1
fi
echo "## newest upstream tag in the fork's ancestry: $TAG"
echo "## which is: $(git log -1 --format='%h %cd %s' --date=short "$TAG^{commit}")"

if git merge-base --is-ancestor "$TAG^{commit}" "$SHA" 2>/dev/null; then
  echo "## confirmed: $TAG IS an ancestor of the fork head."
else
  echo "## $TAG is NOT an ancestor -- describe lied; stopping rather than guessing"
  exit 1
fi

echo
echo "## THE DELTA: every commit the fork adds on top of $TAG"
git log --oneline --no-merges "$TAG..$SHA" | sed 's/^/     /'
N=$(git log --oneline --no-merges "$TAG..$SHA" | wc -l)
echo "## $N commit(s) on top of $TAG"
echo
echo "## files touched:"
git diff --stat "$TAG..$SHA" | sed 's/^/     /'
F=$(git diff --name-only "$TAG..$SHA" | wc -l)
git diff "$TAG..$SHA" > "$OUT/fork-delta.patch" 2>/dev/null || true
L=$(wc -l < "$OUT/fork-delta.patch" 2>/dev/null || echo 0)
echo "## fork-delta.patch: $L lines, $F file(s) -- in the artifact, go read it"
echo "D: fork delta vs $TAG = $N commit(s), $F file(s), $L lines" >> "$REPORT"

# Each commit as its own patch, so the vendoring story is legible rather than one blob.
git format-patch -o "$OUT/fork-commits" "$TAG..$SHA" >/dev/null 2>&1 || true
if [ -d "$OUT/fork-commits" ]; then
  echo "## individual commits, vendorable one by one:"
  ls -la "$OUT/fork-commits" | awk 'NR>3 {print "     " $5, $9}'
fi
echo
echo "## and the head commit on its own -- the one whose message names our exact goal:"
git show --stat "$SHA" | head -25 | sed 's/^/     /'
