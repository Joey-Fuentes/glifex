#!/usr/bin/env bash
# build-dart2js.sh <out-dir>
#
# dart2js, compiled to JavaScript by dart2js, driven through the SDK's own
# embeddable compiler API over an in-memory provider. The browser fetches the
# platform as bytes; nothing here reaches a filesystem at runtime.
#
# Built from pinned sources at deploy, like riscv64's binutils -- not vendored as
# an opaque blob. See docs/dart2js-self-hosted.md for why this route and not
# dart2wasm (shells out to a wasm-opt subprocess) or the whole VM under emcc
# (36.5 MB, unlicensed, needs gclient).
set -euo pipefail
OUT="${1:?usage: build-dart2js.sh <out-dir>}"; mkdir -p "$OUT"
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/pins.env"

SDKSRC="$HOME/dart-sdk-src"
SDK_ROOT="$(dirname "$(dirname "$(readlink -f "$(command -v dart)")")")"
DILL="$SDK_ROOT/lib/_internal/dart2js_platform.dill"
LIBSPEC="$SDK_ROOT/lib/libraries.json"

# ---- the pin is only a pin if it is checked --------------------------------
HAVE="$(dart --version 2>&1 | sed -E 's/.*version:[ ]*([0-9]+\.[0-9]+\.[0-9]+).*/\1/')"
if [ "$HAVE" != "$DART_SDK_VERSION" ]; then
  echo "REFUSE: dart is $HAVE, pins.env says $DART_SDK_VERSION."
  echo "  The workflow must ask setup-dart for the pinned version, not 'stable'."
  echo "  Compiling one SDK's sources with another's compiler is what sank spikes 3-4."
  exit 1
fi
for F in "$DILL" "$LIBSPEC"; do
  [ -f "$F" ] || { echo "REFUSE: missing platform input $F"; exit 1; }
done
echo "## dart $HAVE (pinned), sources at tag $DART_SDK_TAG"

# ---- sources at the SAME tag ------------------------------------------------
if [ ! -d "$SDKSRC" ]; then
  git clone --depth 1 --filter=blob:none --sparse --branch "$DART_SDK_TAG" \
    https://github.com/dart-lang/sdk.git "$SDKSRC" > "$OUT/clone.log" 2>&1
  # Ask the pubspec which directories the workspace needs. Guessing cost three
  # rounds: "pkg tools sdk" hit runtime/tests/vm/dart, then samples/ffi/http.
  DIRS="$(python3 - "$SDKSRC" <<'PY'
import pathlib, re, sys
root = pathlib.Path(sys.argv[1])
lines = (root / "pubspec.yaml").read_text().split(chr(10))
members, inb = [], False
for line in lines:
    if line.startswith("workspace:"):
        inb = True; continue
    if not inb: continue
    if not line.strip() or line.strip().startswith("#"): continue
    if not line[:1].isspace(): break
    m = re.match(r"\s*-\s*(\S+)", line)
    if m: members.append(m.group(1))
# third_party is gclient's; git does not have it at any tag.
tops = sorted({q.split("/")[0] for q in members if not q.startswith("third_party")})
for extra in ("sdk",):
    if extra not in tops: tops.append(extra)
print(" ".join(tops))
PY
)"
  echo "## sparse: $DIRS"
  git -C "$SDKSRC" sparse-checkout set $DIRS >> "$OUT/clone.log" 2>&1
fi
[ -f "$SDKSRC/pkg/compiler/pubspec.yaml" ] || { echo "REFUSE: checkout has no pkg/compiler"; exit 1; }

# ---- THE PATCH -- four edits, each anchor asserted unique --------------------
python3 - "$SDKSRC" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1]) / "pkg/kernel/lib/binary/ast_from_binary.dart"
src = p.read_text()
if "GX KERNEL PATCH" in src:
    print("## kernel patch: already applied"); raise SystemExit
# Anchor 4 is a prefix hazard: without the semicolon it also matches the packed
# line (2 matches) and would corrupt it. With it, unique. Assert regardless -- a
# silently-missed anchor leaves the packed key and the build "succeeds" unfixed.
EDITS = [
    ("late Map<int, Name?> _nameCache;",
     "late Map<(int, int), Name?> _nameCache;  // GX KERNEL PATCH: record key, not a packed int"),
    ("final int nameCacheIndex;", "final (int, int) nameCacheIndex;"),
    ("nameCacheIndex = stringReference | ((libraryReferenceIndex) << 30);",
     "nameCacheIndex = (stringReference, libraryReferenceIndex);"),
    ("nameCacheIndex = stringReference;", "nameCacheIndex = (stringReference, 0);"),
]
for old, new in EDITS:
    n = src.count(old)
    if n != 1:
        print("## REFUSE: kernel patch anchor matched %d times, want 1:" % n)
        print("##   %s" % old)
        print("## ast_from_binary.dart changed shape at this tag. See")
        print("## docs/dart2js-self-hosted.md section 4 and retarget.")
        sys.exit(1)
    src = src.replace(old, new, 1)
p.write_text(src)
print("## kernel patch: 4/4 edits, each anchor unique")
PY
grep -q "stringReference | ((libraryReferenceIndex) << 30)" \
  "$SDKSRC/pkg/kernel/lib/binary/ast_from_binary.dart" && { echo "REFUSE: packed key survived"; exit 1; }

# ---- resolve: a trimmed workspace ------------------------------------------
# The full SDK workspace names third_party/pkg/* members that gclient owns and
# git does not have at any tag, so it can never resolve from a clone. The
# in-pkg closure of pkg/compiler can, and dev_dependencies are IN: pub resolves
# every member's dev_deps whether or not we list them, so an SDK-local dev_dep
# must also be a member.
python3 - "$SDKSRC" <<'PY'
import pathlib, re, sys
root = pathlib.Path(sys.argv[1])
def deps_of(pkg):
    q = root / "pkg" / pkg / "pubspec.yaml"
    if not q.is_file(): return []
    spec, names = q.read_text(), []
    for block in ("dependencies", "dev_dependencies"):
        m = re.search(rf"^{block}:\n((?:[ \t]+.*\n|\n)*)", spec, re.M)
        if m: names += re.findall(r"^\s{2,}([A-Za-z_][A-Za-z0-9_]*):", m.group(1), re.M)
    return names
seen, queue = set(), ["compiler"]
while queue:
    cur = queue.pop()
    if cur in seen or not (root / "pkg" / cur).is_dir(): continue
    seen.add(cur); queue += deps_of(cur)
members = sorted(seen)
body = ["name: _", "publish_to: none", "environment:", "  sdk: ^3.12.0-0", "workspace:"]
body += [f"  - pkg/{m}" for m in members]
(root / "pubspec.yaml").write_text(chr(10).join(body) + chr(10))
print("## workspace: %d members" % len(members))
PY
( cd "$SDKSRC" && dart pub get > "$OUT/pubget.log" 2>&1 ) || { echo "REFUSE: pub get failed"; tail -15 "$OUT/pubget.log"; exit 1; }
[ -f "$SDKSRC/.dart_tool/package_config.json" ] || { echo "REFUSE: no package_config"; exit 1; }

# ---- compile the compiler ---------------------------------------------------
mkdir -p "$SDKSRC/pkg/compiler/tool/gx"
cp "$HERE/gx_core.dart" "$HERE/gx_web.dart" "$SDKSRC/pkg/compiler/tool/gx/"
T0=$(date +%s)
( cd "$SDKSRC" && dart compile js pkg/compiler/tool/gx/gx_web.dart -o "$OUT/gx_web.js" -O1 ) \
  > "$OUT/compile.log" 2>&1 || { echo "REFUSE: dart compile js failed"; tail -20 "$OUT/compile.log"; exit 1; }
T1=$(date +%s)
cp "$DILL" "$OUT/dart2js_platform.dill"
cp "$LIBSPEC" "$OUT/libraries.json"
rm -f "$OUT/gx_web.js.deps"

SZ=$(stat -c%s "$OUT/gx_web.js")
test "$SZ" -gt 8000000 || { echo "REFUSE: gx_web.js is $SZ bytes -- too small to be a compiler"; exit 1; }
printf '{"runtime":"dart","dart_sdk":"%s","sdk_tag":"%s","route":"dart2js self-hosted to JS via compiler_api","kernel_patch":"%s","license":"BSD-3-Clause","compiler_bytes":%s,"platform_dill_bytes":%s,"build_seconds":%s}\n' \
  "$DART_SDK_VERSION" "$DART_SDK_TAG" "$DART_KERNEL_PATCH" "$SZ" "$(stat -c%s "$OUT/dart2js_platform.dill")" "$((T1-T0))" > "$OUT/manifest.json"
rm -f "$OUT/clone.log" "$OUT/pubget.log" "$OUT/compile.log"
echo "## gx_web.js $SZ bytes in $((T1-T0))s"
