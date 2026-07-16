#!/usr/bin/env bash
# probe-selfhost.sh -- Bx-13 spike 2.
#
# SPIKE 1 SETTLED (by reading, at commit 0315596):
#   - dart2js COMPILES dart:io. It emits code that throws UnsupportedError
#     ("_Namespace") at RUNTIME, only when the filesystem is touched. There is
#     no compile-time rejection. I had asserted the opposite. So the job is not
#     to strip dart:io out of the compiler -- it is to never CALL it.
#   - compiler_api.dart is intact, 280 lines, importing only dart:async and
#     dart:typed_data.
#   - pkg/compiler is 4/278 files on dart:io, and they are the CLI entrypoint
#     plus the two dart:io-backed providers -- i.e. exactly the host adapter
#     layer an embedder replaces.
#
# WHAT KILLED SPIKE 1 WAS MY OWN CHECKOUT.
#   "could not find package shell_arg_splitter at https://pub.dev"
#   pkg/compiler's pubspec says "resolution: workspace" and "we get our versions
#   from the DEPS file". I had sparse-checked-out five directories and then
#   resolved via an external path-dependency -- the wrong shape twice over. So
#   step 1 here is to stop building my own wall: check out ALL of pkg/ and
#   resolve AT THE WORKSPACE ROOT.
#
# THE TWO GATES, ordered by how much I have to guess. This ordering is the whole
# design: gate 1 needs no guesses at all and already answers the roadmap's
# literal question ("self-compile a modern dart2js and measure the artifact size
# + compile time"). If gate 2 dies, gate 1 still lands the number.
#
#   GATE 1  dart compile js on the CLI entrypoint. Zero guesses. Does the Dart
#           compiler compile ITSELF to JavaScript, and how big/slow is it?
#   GATE 2a the embeddable core on the VM. Isolates "is my API usage right?"
#           from every browser concern.
#   GATE 2b the same core as JS, no dart:io reachable, dill handed over by the
#           JS host, and THEN we run the JS it produced and check the answer.
#           Compiling is not the gate. Computing 55 is the gate.
set -uo pipefail

OUT="${1:?usage: probe-selfhost.sh <out-dir>}"
mkdir -p "$OUT"
SDKSRC="$HOME/dart-sdk-src"
DART_BIN="$(command -v dart)"
SDK_ROOT="$(dirname "$(dirname "$(readlink -f "$DART_BIN")")")"
DILL="$SDK_ROOT/lib/_internal/dart2js_platform.dill"

hr() { echo; echo "############################################################"; echo "## $1"; echo "############################################################"; }

# ---------------------------------------------------------------------------
hr "1. A WIDER CHECKOUT -- do not rebuild spike 1's self-inflicted wall"
# ---------------------------------------------------------------------------
if [ ! -d "$SDKSRC" ]; then
  git clone --depth 1 --filter=blob:none --sparse \
    https://github.com/dart-lang/sdk.git "$SDKSRC" > "$OUT/clone.log" 2>&1 || {
      echo "## CLONE FAILED"; tail -5 "$OUT/clone.log"; exit 0; }
  # ALL of pkg/ this time, plus the workspace root pubspec and DEPS.
  git -C "$SDKSRC" sparse-checkout set pkg tools sdk/lib/libraries.json >> "$OUT/clone.log" 2>&1
  git -C "$SDKSRC" sparse-checkout add /pubspec.yaml /DEPS >> "$OUT/clone.log" 2>&1
fi
echo "## commit  $(git -C "$SDKSRC" rev-parse HEAD)"
echo "## dated   $(git -C "$SDKSRC" log -1 --format=%cd --date=short)"
echo "## size    $(du -sh "$SDKSRC" 2>/dev/null | cut -f1)"
echo "## pkg/    $(ls "$SDKSRC/pkg" 2>/dev/null | wc -l) directories"

# ---------------------------------------------------------------------------
hr "2. THE DEPENDENCY CENSUS -- where does each of pkg/compiler's deps live?"
# ---------------------------------------------------------------------------
# Spike 1 died on ONE name. Enumerate them all up front rather than discovering
# them one CI round at a time.
python3 - "$SDKSRC" <<'PY'
import pathlib, re, sys
root = pathlib.Path(sys.argv[1])
spec = (root / "pkg/compiler/pubspec.yaml").read_text()
# Only the real dependencies block, not dev_dependencies.
m = re.search(r"^dependencies:\n((?:[ \t]+.*\n|\n)*)", spec, re.M)
deps = re.findall(r"^\s{2,}([A-Za-z_][A-Za-z0-9_]*):", m.group(1)) if m else []
print(f"## pkg/compiler declares {len(deps)} runtime dependencies")
inpkg, elsewhere = [], []
for d in deps:
    if (root / "pkg" / d).is_dir():
        inpkg.append(d)
    else:
        elsewhere.append(d)
print(f"##   in pkg/ (we now have them): {len(inpkg)}")
for d in inpkg:
    print(f"     {d}")
print(f"##   NOT in pkg/ (pub.dev or DEPS/third_party): {len(elsewhere)}")
for d in elsewhere:
    print(f"     {d}")
# The exact name that killed spike 1.
print()
print("## the spike-1 killer, specifically:")
p = root / "pkg/shell_arg_splitter"
print(f"     pkg/shell_arg_splitter exists: {p.is_dir()}")
PY

echo
echo "## ---- is the SDK a pub workspace? root pubspec.yaml, verbatim ----"
sed 's/^/     /' "$SDKSRC/pubspec.yaml" 2>/dev/null | head -60 || echo "     NO ROOT PUBSPEC -- then it is not a workspace and step 3 will say so"

# ---------------------------------------------------------------------------
hr "3. RESOLUTION -- at the workspace root, the shape the pubspec asks for"
# ---------------------------------------------------------------------------
echo "## ---- dart pub get, in $SDKSRC ----"
( cd "$SDKSRC" && timeout 600 dart pub get 2>&1 | head -40 | sed 's/^/     /' )
PKGCFG="$SDKSRC/.dart_tool/package_config.json"
if [ -f "$PKGCFG" ]; then
  echo "     RESOLVED -- $(python3 -c "import json;print(len(json.load(open('$PKGCFG'))['packages']))") packages in the config"
  python3 -c "
import json
d = json.load(open('$PKGCFG'))
names = sorted(p['name'] for p in d['packages'])
print('     compiler present:', 'compiler' in names)
print('     front_end present:', 'front_end' in names)
"
else
  echo "     DID NOT RESOLVE -- the log above names it. Gates below will fail; that is the finding."
fi

# ---------------------------------------------------------------------------
hr "4. THE REFERENCE IMPLEMENTATION -- print it BEFORE the gate that guesses"
# ---------------------------------------------------------------------------
# gx_core.dart has exactly one line written from expectation rather than
# evidence: the CompilerOptions.parse call. Print the real call sites here so
# that if the gate throws, THIS SAME LOG already contains the correction and
# spike 3 costs one round instead of two.
echo "## ---- who actually implements the three interfaces? ----"
echo "## ---- (spike 1 inferred this from filenames; confirm or correct it) ----"
grep -rn --include='*.dart' "implements CompilerInput\|implements CompilerOutput\|implements CompilerDiagnostics\|implements api.CompilerInput\|implements api.CompilerOutput" \
  "$SDKSRC/pkg/compiler/lib" 2>/dev/null | sed "s|$SDKSRC/||" | head -12 | sed 's/^/     /'
echo
echo "## ---- CompilerOptions: how is it actually constructed? ----"
grep -n "static CompilerOptions parse\|factory CompilerOptions\|CompilerOptions parse(" \
  "$SDKSRC/pkg/compiler/lib/src/options.dart" 2>/dev/null | head -6 | sed 's/^/     /'
python3 - "$SDKSRC" <<'PY'
import pathlib, re, sys
p = pathlib.Path(sys.argv[1]) / "pkg/compiler/lib/src/options.dart"
if p.is_file():
    src = p.read_text()
    m = re.search(r"(static\s+CompilerOptions\s+parse\s*\([^{]*\{)", src, re.S)
    if m:
        print("     ---- CompilerOptions.parse signature, verbatim ----")
        for line in m.group(1).split("\n")[:24]:
            print("       " + line)
    else:
        print("     no 'static CompilerOptions parse(' found -- construction is some other shape")
PY
echo
echo "## ---- the CLI's own call into api.compile -- the ground truth ----"
python3 - "$SDKSRC" <<'PY'
import pathlib, re, sys
p = pathlib.Path(sys.argv[1]) / "pkg/compiler/lib/src/dart2js.dart"
if not p.is_file():
    print("     dart2js.dart ABSENT"); raise SystemExit
lines = p.read_text().split("\n")
for i, l in enumerate(lines):
    if re.search(r"\bapi\.compile\(|\bcompileFunc\(|CompilerOptions\.parse\(", l):
        lo, hi = max(0, i - 6), min(len(lines), i + 10)
        print(f"     ---- dart2js.dart:{i+1} ----")
        for j in range(lo, hi):
            print(f"       {j+1:5d}  {lines[j]}")
        print()
PY

# ---------------------------------------------------------------------------
hr "5. GATE 1 -- ZERO GUESSES. Does dart2js compile ITSELF to JavaScript?"
# ---------------------------------------------------------------------------
# This is the roadmap's spike, literally: "self-compile a modern dart2js and
# measure the artifact size + compile time". No custom entrypoint, no API usage,
# nothing of mine in the compile path. Just: point dart2js at dart2js.
#
# The result will NOT be usable as-is (its dart:io will throw the moment it
# opens a file -- spike 1 proved that is a runtime, not a compile, failure).
# That is fine. This gate measures FEASIBILITY AND COST, which is the number
# nobody has had for this track.
G1="$OUT/gate1"; mkdir -p "$G1"
T0=$(date +%s%N)
( cd "$SDKSRC" && timeout 900 dart compile js \
    pkg/compiler/lib/src/dart2js.dart -o "$G1/dart2js_self.js" -O1 2>&1 | tail -20 | sed 's/^/     /' )
T1=$(date +%s%N)
if [ -f "$G1/dart2js_self.js" ]; then
  SZ=$(stat -c%s "$G1/dart2js_self.js")
  echo
  echo "     ################################################"
  echo "     SELF-HOST ARTIFACT : $SZ bytes ($(( SZ / 1048576 )) MB)"
  echo "     COMPILE TIME       : $(( (T1 - T0) / 1000000000 )) s"
  echo "     PLATFORM DILL      : $(stat -c%s "$DILL") bytes"
  echo "     TOTAL TO SERVE     : $(( (SZ + $(stat -c%s "$DILL")) / 1048576 )) MB"
  echo "     ################################################"
  echo "     for scale, glifex already vendors: wat 1.3M, php 10M, python 12M,"
  echo "     ruby 30M, csharp 39M, rust 122M"
  gzip -c "$G1/dart2js_self.js" > "$G1/dart2js_self.js.gz" 2>/dev/null
  echo "     gzipped            : $(stat -c%s "$G1/dart2js_self.js.gz" 2>/dev/null) bytes (what the wire sees)"
else
  echo "     NO ARTIFACT -- dart2js cannot compile itself. That would be decisive"
  echo "     against the whole thesis, so read the error above carefully."
fi

# ---------------------------------------------------------------------------
hr "6. GATE 2a -- the embeddable core, on the VM. Is my API usage right?"
# ---------------------------------------------------------------------------
G2="$OUT/gate2"; mkdir -p "$G2"
mkdir -p "$SDKSRC/pkg/compiler/tool/gx"
cp tools/dart-spike/embed/gx_core.dart tools/dart-spike/embed/gx_vm.dart tools/dart-spike/embed/gx_web.dart \
   "$SDKSRC/pkg/compiler/tool/gx/"
echo "## staged into $SDKSRC/pkg/compiler/tool/gx/ so it inherits pkg/compiler's own resolution"
echo
( cd "$SDKSRC" && timeout 600 dart run pkg/compiler/tool/gx/gx_vm.dart "$DILL" "$G2" 2>&1 | head -70 | sed 's/^/     /' )
if [ -f "$G2/gx_vm_out.js" ]; then
  echo "     ---- RUN the JS the embedded compiler produced ----"
  node "$G2/gx_vm_out.js" 2>&1 | head -4 | sed 's/^/       /'
fi

# ---------------------------------------------------------------------------
hr "7. GATE 2b -- the compiler AS JAVASCRIPT, with no filesystem at all"
# ---------------------------------------------------------------------------
T2=$(date +%s%N)
( cd "$SDKSRC" && timeout 900 dart compile js pkg/compiler/tool/gx/gx_web.dart -o "$G2/gx_web.js" -O1 2>&1 | tail -12 | sed 's/^/     /' )
T3=$(date +%s%N)
if [ -f "$G2/gx_web.js" ]; then
  echo "     embedded compiler artifact : $(stat -c%s "$G2/gx_web.js") bytes"
  echo "     compile time               : $(( (T3 - T2) / 1000000000 )) s"
  echo "     ---- drive it in node: no dart:io reachable, dill handed over by the host ----"
  timeout 600 node tools/dart-spike/drive-web.cjs "$G2/gx_web.js" "$DILL" 2>&1 | head -60 | sed 's/^/     /'
else
  echo "     no gx_web.js -- see gate 2a; if 2a passed, the fault is interop, not the API"
fi

# ---------------------------------------------------------------------------
hr "8. Did Google already ship a self-host config?"
# ---------------------------------------------------------------------------
python3 - "$SDKSRC" <<'PY'
import json, pathlib, sys
p = pathlib.Path(sys.argv[1]) / "tools/bots/test_matrix.json"
if not p.is_file():
    print("     test_matrix.json ABSENT"); raise SystemExit
raw = p.read_text()
hits = [l.strip() for l in raw.split("\n") if "self" in l.lower() and "host" in l.lower()]
print(f"     lines mentioning self-host: {len(hits)}")
for h in hits[:15]:
    print("       " + h[:150])
PY

hr "SUMMARY"
echo "##   GATE 1 (zero guesses) -- self-host size + compile time: section 5"
echo "##   GATE 2a (API usage)   -- section 6"
echo "##   GATE 2b (browser path)-- section 7"
echo "##"
echo "## If 2a/2b failed on a missing input, section 6/7 printed the exact list"
echo "## of Uris the compiler asked for. That list is the finding, not the error."
