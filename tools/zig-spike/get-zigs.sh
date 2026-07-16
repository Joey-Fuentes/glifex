#!/usr/bin/env bash
# get-zigs.sh <destdir>   -> prints "<label> <zig-binary-path>" per acquired zig
#
# Round 2 used mlugg/setup-zig with version: master. It DID resolve master, to
# 0.17.0-dev.1413+addc3c3b8 -- and then every mirror 404'd, so the newest-compiler
# axis (the most promising one) went untested. Nightlies rotate out of mirrors;
# releases do not. So read ziglang.org's OWN index.json, print what it actually
# offers, and pull the tarballs it names. Read, do not guess -- and do not depend
# on a third-party action's mirror list.
#
# The shasum in index.json is verified. index.json is the same file that names
# the tarball, so this is an integrity check, not a trust anchor -- said plainly
# rather than dressed up as provenance.
set -uo pipefail
DEST="$1"
mkdir -p "$DEST"
IDX="$DEST/index.json"

if ! curl -sSfL --retry 3 https://ziglang.org/download/index.json -o "$IDX"; then
  echo "get-zigs: cannot fetch index.json" >&2
  exit 1
fi

python3 - "$IDX" > "$DEST/plan.txt" <<'PY'
import json, sys, re
idx = json.load(open(sys.argv[1]))
keys = [k for k in idx if k != "master"]
def sortkey(v):
    m = re.match(r"^(\d+)\.(\d+)\.(\d+)$", v)
    return tuple(int(x) for x in m.groups()) if m else (-1, -1, -1)
rel = sorted([k for k in keys if sortkey(k) != (-1, -1, -1)], key=sortkey, reverse=True)
print("# index.json offers %d keys; newest releases first: %s" % (len(idx), ", ".join(rel[:6])), file=sys.stderr)
if "master" in idx:
    print("# master is %s" % idx["master"].get("version", "?"), file=sys.stderr)
pick = rel[:2] + (["master"] if "master" in idx else [])
for k in pick:
    ent = idx[k].get("x86_64-linux")
    if not ent:
        print("# %s has no x86_64-linux build" % k, file=sys.stderr)
        continue
    label = idx[k].get("version", k) if k == "master" else k
    print("%s\t%s\t%s" % (label, ent["tarball"], ent.get("shasum", "")))
PY

while IFS=$'\t' read -r LABEL URL SHA; do
  [ -n "${LABEL:-}" ] || continue
  TB="$DEST/$LABEL.tar.xz"
  if ! curl -sSfL --retry 2 "$URL" -o "$TB"; then
    echo "get-zigs: $LABEL download FAILED ($URL)" >&2
    continue
  fi
  if [ -n "$SHA" ]; then
    GOT=$(sha256sum "$TB" | cut -d' ' -f1)
    if [ "$GOT" != "$SHA" ]; then
      echo "get-zigs: $LABEL shasum MISMATCH; discarding" >&2
      rm -f "$TB"; continue
    fi
  fi
  D="$DEST/x-$LABEL"; mkdir -p "$D"
  tar -xJf "$TB" -C "$D" --strip-components=1 || { echo "get-zigs: $LABEL untar failed" >&2; continue; }
  B="$D/zig"
  if [ -x "$B" ]; then
    echo "$LABEL $B"
  else
    echo "get-zigs: $LABEL has no zig binary at $B" >&2
  fi
done < "$DEST/plan.txt"
