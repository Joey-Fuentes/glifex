#!/usr/bin/env bash
# get-host-zig.sh <version> <destdir>   -> prints the host zig binary path
#
# NOT mlugg/setup-zig. Round 5 died on its very first step:
#     Fetching zig-linux-x86_64-0.16.0.tar.xz
#     ... 404 from every mirror, INCLUDING "Attempting official: ziglang.org/builds"
# Two things wrong there, both the action's: /builds is the NIGHTLY path (releases
# live under /download/<ver>/), and zig-linux-x86_64-<ver> is the OLD filename
# order (current releases are zig-x86_64-linux-<ver>). setup-zig@v1 is simply out
# of date; the playground uses @v2.
#
# But the deeper point is that I already had a proven answer and did not use it:
# round 3's get-zigs.sh downloaded 0.16.0 from index.json and ran "zig version"
# on it successfully. I fixed SOURCE acquisition that way and then left the HOST
# BINARY on a third-party action. index.json names the real URL and the real
# shasum. One dependency fewer, and it is the one that already worked.
set -uo pipefail
VER="$1"; DEST="$2"
mkdir -p "$DEST"
IDX="$DEST/index.json"
curl -sSfL --retry 3 https://ziglang.org/download/index.json -o "$IDX" || {
  echo "get-host-zig: cannot fetch index.json" >&2; exit 1; }

read -r URL SHA <<EOF
$(python3 - "$IDX" "$VER" <<'PY'
import json, sys
idx = json.load(open(sys.argv[1]))
v = sys.argv[2]
if v not in idx:
    print("get-host-zig: index.json has no key %s; it has: %s"
          % (v, ", ".join(sorted(idx))), file=sys.stderr)
    raise SystemExit(1)
e = idx[v].get("x86_64-linux")
if not e:
    print("get-host-zig: %s has no x86_64-linux build" % v, file=sys.stderr)
    raise SystemExit(1)
print(e["tarball"], e.get("shasum", ""))
PY
)
EOF
[ -n "${URL:-}" ] || { echo "get-host-zig: no tarball url for $VER" >&2; exit 1; }
echo "get-host-zig: $VER -> $URL" >&2

TB="$DEST/host.tar.xz"
curl -sSfL --retry 3 "$URL" -o "$TB" || { echo "get-host-zig: download failed" >&2; exit 1; }
if [ -n "${SHA:-}" ]; then
  GOT=$(sha256sum "$TB" | cut -d' ' -f1)
  [ "$GOT" = "$SHA" ] || { echo "get-host-zig: shasum mismatch" >&2; exit 1; }
  echo "get-host-zig: shasum ok" >&2
fi
D="$DEST/host"; mkdir -p "$D"
tar -xJf "$TB" -C "$D" --strip-components=1 || { echo "get-host-zig: untar failed" >&2; exit 1; }
[ -x "$D/zig" ] || { echo "get-host-zig: no zig binary at $D/zig" >&2; exit 1; }
echo "$D/zig"
