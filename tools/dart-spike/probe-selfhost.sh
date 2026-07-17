#!/usr/bin/env bash
# probe-selfhost.sh -- Bx-13 spike 3.
#
# WHY THERE IS A SPIKE 3: spike 2 tested nothing about Dart. It died on my own
# git scaffolding, in one line:
#
#   git sparse-checkout set pkg tools sdk/lib/libraries.json
#   fatal: 'sdk/lib/libraries.json' is not a directory
#   fatal: specify directories rather than patterns (no leading slash)
#
# Cone mode takes DIRECTORIES ONLY -- no file paths, no leading slashes -- and
# "set" is atomic, so pkg/ and tools/ never landed either. The probe then spent
# six sections faithfully reporting on an empty tree. Two rounds in a row lost
# to the same step, which is exactly the shape adding-a-language.md warns about:
# "four CI rounds died on my own build scaffolding". The fixed command is now
# tested against a real git repo locally before shipping, and section 1 ASSERTS
# the checkout worked instead of narrating its absence.
#
# WHAT SPIKE 2 DID ESTABLISH, incidentally but for real:
#   - The SDK root pubspec.yaml IS a pub workspace and pkg/compiler is a listed
#     member. So resolving at the root is the right shape.
#   - Cone mode materialises root files automatically -- the root pubspec.yaml
#     printed even though BOTH sparse commands had failed. The /pubspec.yaml and
#     /DEPS lines were never needed and were the thing that broke it.
#   - Every one of the 27 Dart errors was a RESOLUTION error (Type not found,
#     Undefined name, Couldn't resolve the package). Not one was a syntax error.
#     The CFE parsed all 194 lines of gx_core.dart and both drivers, including
#     the dart:js_interop externals. So the embed code parses; it has simply
#     never had its imports resolved.
#   - The workspace lists pkg/dartpad AND pkg/dartpad_worker. Section 2 below.
set -uo pipefail

OUT="${1:?usage: probe-selfhost.sh <out-dir>}"
mkdir -p "$OUT"
SDKSRC="$HOME/dart-sdk-src"
DART_BIN="$(command -v dart)"
SDK_ROOT="$(dirname "$(dirname "$(readlink -f "$DART_BIN")")")"
DILL="$SDK_ROOT/lib/_internal/dart2js_platform.dill"
LIBSPEC="$SDK_ROOT/lib/libraries.json"

hr() { echo; echo "############################################################"; echo "## $1"; echo "############################################################"; }

# ---------------------------------------------------------------------------
hr "1. CHECKOUT -- pinned to the INSTALLED SDK's version, and ASSERT it"
# ---------------------------------------------------------------------------
# Spike 3's two failures, both mine, both the same shape -- I never made the
# source tree and the compiler agree:
#
#   No workspace packages matching 'runtime/tests/vm/dart'
#     -> the workspace has members under runtime/, which "set pkg tools sdk"
#        excluded. Add runtime.
#   Because testing requires SDK version ^3.13.0-0, version solving failed
#     -> setup-dart gave us STABLE 3.12.2 while I cloned SDK source at MAIN,
#        whose root pubspec demands ^3.14.0-0. I was compiling tomorrow's
#        sources with today's compiler and then reading the wreckage as if it
#        said something about Dart.
#
# The fix is the discipline this repo already applies to binutils and emsdk:
# PIN IT. Clone the source at the tag matching the compiler we were handed, so
# source and binary cannot disagree.
DART_VER="$(dart --version 2>&1 | sed -E 's/.*version:[ ]*([0-9]+\.[0-9]+\.[0-9]+).*/\1/')"
echo "## installed dart : $DART_VER"
if [ ! -d "$SDKSRC" ]; then
  git clone --depth 1 --filter=blob:none --sparse --branch "$DART_VER" \
    https://github.com/dart-lang/sdk.git "$SDKSRC" > "$OUT/clone.log" 2>&1 || {
      echo "## CLONE FAILED at tag $DART_VER"; tail -8 "$OUT/clone.log"; exit 1; }
  # A --sparse clone starts with ROOT FILES ONLY -- which is exactly enough,
  # because pubspec.yaml is a root file and it is the thing that knows which
  # directories matter. Spike 3 guessed "pkg tools sdk" and hit
  # runtime/tests/vm/dart; spike 4 added runtime and hit samples/ffi/http. That
  # is whack-a-mole with a five-minute CI round per mole. Ask the file.
  SPARSE_DIRS="$(python3 - "$SDKSRC" <<'PY'
import pathlib, re, sys
root = pathlib.Path(sys.argv[1])
spec = (root / "pubspec.yaml").read_text()
m = re.search(r"^workspace:\n((?:[ \t]*-[ \t]*\S+\n|[ \t]*\n)*)", spec, re.M)
members = re.findall(r"^[ \t]*-[ \t]*(\S+)", m.group(1), re.M) if m else []
tops = sorted({p.split("/")[0] for p in members})
# tools and sdk are not workspace members but we read them (test_matrix.json,
# libraries.json), so they are added explicitly rather than hoped for.
for extra in ("tools", "sdk"):
    if extra not in tops:
        tops.append(extra)
print(" ".join(tops))
PY
)"
  echo "## workspace names these top-level dirs: $SPARSE_DIRS"
  git -C "$SDKSRC" sparse-checkout set $SPARSE_DIRS 2>&1 | tee -a "$OUT/clone.log" | sed 's/^/     /'
fi
echo "## commit  $(git -C "$SDKSRC" rev-parse HEAD)"
echo "## tag     $(git -C "$SDKSRC" describe --tags --always 2>/dev/null)"
echo "## dated   $(git -C "$SDKSRC" log -1 --format=%cd --date=short)"
echo "## size    $(du -sh "$SDKSRC" 2>/dev/null | cut -f1)"
echo "## pkg/    $(ls "$SDKSRC/pkg" 2>/dev/null | wc -l) directories"

echo "## ---- every workspace member: present after checkout, or not? ----"
echo "## An ABSENT member is either a directory I failed to check out, or one"
echo "## that gclient manages and git does not have. The first is fixable here;"
echo "## the second means attempt A can never work and B is the only road."
python3 - "$SDKSRC" <<'PY'
import pathlib, re, sys
root = pathlib.Path(sys.argv[1])
spec = (root / "pubspec.yaml").read_text()
m = re.search(r"^workspace:\n((?:[ \t]*-[ \t]*\S+\n|[ \t]*\n)*)", spec, re.M)
members = re.findall(r"^[ \t]*-[ \t]*(\S+)", m.group(1), re.M) if m else []
missing = [p for p in members if not (root / p / "pubspec.yaml").is_file()]
print(f"     {len(members)} members declared, {len(members) - len(missing)} present, {len(missing)} MISSING")
for p in missing[:20]:
    print(f"       MISSING {p}")
if len(missing) > 20:
    print(f"       ... and {len(missing) - 20} more")
PY

# THE GUARD SPIKE 2 SHOULD HAVE HAD. If the tree is not there, say so in one
# line and stop, rather than producing six sections of confident nonsense about
# an empty directory.
if [ ! -f "$SDKSRC/pkg/compiler/pubspec.yaml" ]; then
  echo
  echo "## ####################################################################"
  echo "## CHECKOUT FAILED -- pkg/compiler/pubspec.yaml is absent."
  echo "## Everything below would be noise. Stopping here on purpose."
  echo "## sparse-checkout list:"
  git -C "$SDKSRC" sparse-checkout list 2>&1 | sed 's/^/##   /'
  echo "## ####################################################################"
  exit 1
fi
echo "## ASSERT ok: pkg/compiler/pubspec.yaml is present, the tree is real"

# THE SECOND ASSERT spike 3 needed. Source and compiler must agree, or every
# resolution error below is about my setup rather than about Dart.
ROOTSDK="$(grep -E "^[ ]+sdk: " "$SDKSRC/pubspec.yaml" 2>/dev/null | head -1 | sed 's/^ *sdk: *//')"
echo "## root pubspec sdk constraint : $ROOTSDK"
echo "## installed dart              : $DART_VER"
python3 - "$ROOTSDK" "$DART_VER" <<'PY'
import sys
con, ver = sys.argv[1].strip().strip("'").strip('"'), sys.argv[2]
base = con.lstrip("^><= ").split("-")[0]
cmaj = base.split(".")[:2]
vmaj = ver.split(".")[:2]
if cmaj == vmaj:
    print("## ASSERT ok: source tree and compiler agree on %s.%s" % tuple(vmaj))
else:
    print("## ####################################################################")
    print("## VERSION SKEW: source wants %s, compiler is %s." % (con, ver))
    print("## This is what sank spike 3. Every resolution error below would be")
    print("## about my setup, not about Dart. Read S4 with that in mind.")
    print("## ####################################################################")
PY

# ---------------------------------------------------------------------------
hr "2. DID GOOGLE ALREADY BUILD THIS? pkg/dartpad_worker"
# ---------------------------------------------------------------------------
# Spike 2's workspace list contains pkg/dartpad and pkg/dartpad_worker. The
# roadmap says DartPad "went server-side", which is why Bx-13 was ever framed as
# hard. But a package literally named dartpad_worker sitting in the SDK is worth
# reading before writing a line of my own: libriscv won Bx-10b on one fact --
# it already had a wasm example in-tree. Proven beats promising, and the answer
# to Bx-10's musl question was sitting in an upstream build script the whole
# time.
for P in dartpad dartpad_worker; do
  D="$SDKSRC/pkg/$P"
  echo "## ---- pkg/$P ----"
  if [ ! -d "$D" ]; then echo "     ABSENT"; continue; fi
  echo "     size    $(du -sh "$D" 2>/dev/null | cut -f1),  $(find "$D" -name '*.dart' | wc -l) .dart files"
  echo "     ---- pubspec.yaml ----"
  sed 's/^/       /' "$D/pubspec.yaml" 2>/dev/null | head -30
  echo "     ---- lib/ + bin/ ----"
  find "$D/lib" "$D/bin" -name '*.dart' 2>/dev/null | sed "s|$SDKSRC/||" | head -20 | sed 's/^/       /'
  echo "     ---- does it drive a compiler in-process? ----"
  # Spike 3's terms (compiler_api|CompilerInput|dart2js|dart2wasm) found NOTHING
  # in either package, and the file listing gave the game away instead: this
  # thing runs DDC, not dart2js. My grep was looking for the compiler I had
  # already decided on. Widen it, and let the tree say which compiler it uses.
  grep -rln --include='*.dart' "dev_compiler\|ddc\|kernelForProgram\|compiler_api\|CompilerInput\|dart2js\|dart2wasm\|hot_reload\|IncrementalCompiler\|frontend_server" "$D" 2>/dev/null \
    | sed "s|$SDKSRC/||" | head -12 | sed 's/^/       /'
  echo "     ---- README / build scripts: how is worker.wasm actually produced? ----"
  find "$D" -maxdepth 2 \( -iname 'README*' -o -iname '*.md' -o -iname 'build*' -o -iname 'Makefile' -o -iname '*.sh' \) 2>/dev/null \
    | sed "s|$SDKSRC/||" | head -10 | sed 's/^/       /'
  for R in "$D/README.md"; do
    [ -f "$R" ] && { echo "     ---- $(basename "$R") ----"; head -40 "$R" | sed 's/^/       /'; }
  done
  echo "     ---- any prebuilt or referenced wasm/js artifact? ----"
  find "$D" -name '*.wasm' -o -name '*.mjs' -o -name 'worker*.js' 2>/dev/null | sed "s|$SDKSRC/||" | head -6 | sed 's/^/       /'
  grep -rn --include='*.dart' --include='*.yaml' --include='*.json' "worker\.wasm\|worker\.mjs\|dart2wasm\|compileToWasm" "$D" 2>/dev/null \
    | sed "s|$SDKSRC/||" | head -8 | sed 's/^/       /'
  echo "     ---- does it import dart:io? (if NO, it may already be browser-shaped) ----"
  python3 - "$D" <<'PY'
import pathlib, re, sys
root = pathlib.Path(sys.argv[1])
pat = re.compile(rb"""^\s*import\s+['"]dart:io['"]""", re.M)
files = sorted(root.rglob("*.dart"))
hits = [p for p in files if pat.search(p.read_bytes())]
print(f"       {len(hits)} of {len(files)} .dart files import dart:io")
for p in hits[:8]:
    print("         " + str(p.relative_to(root)))
PY
  echo
done

# ---------------------------------------------------------------------------
hr "3. THE DEPENDENCY CENSUS"
# ---------------------------------------------------------------------------
python3 - "$SDKSRC" <<'PY'
import pathlib, re, sys
root = pathlib.Path(sys.argv[1])
spec = (root / "pkg/compiler/pubspec.yaml").read_text()
m = re.search(r"^dependencies:\n((?:[ \t]+.*\n|\n)*)", spec, re.M)
deps = re.findall(r"^\s{2,}([A-Za-z_][A-Za-z0-9_]*):", m.group(1), re.M) if m else []
print(f"## pkg/compiler declares {len(deps)} runtime dependencies")
inpkg = [d for d in deps if (root / "pkg" / d).is_dir()]
out = [d for d in deps if not (root / "pkg" / d).is_dir()]
print(f"##   in pkg/ : {len(inpkg)} -> {' '.join(inpkg)}")
print(f"##   NOT in pkg/ (pub.dev or DEPS/third_party): {len(out)} -> {' '.join(out)}")
print()
print("## the name that killed spike 1, now that the checkout is real:")
print(f"     pkg/shell_arg_splitter exists: {(root / 'pkg/shell_arg_splitter').is_dir()}")
PY

# ---------------------------------------------------------------------------
hr "4. RESOLUTION -- full workspace, then a trimmed workspace if that fails"
# ---------------------------------------------------------------------------
echo "## ---- attempt A: dart pub get at the SDK root (all workspace members) ----"
( cd "$SDKSRC" && timeout 900 dart pub get 2>&1 | head -25 | sed 's/^/     /' )
PKGCFG="$SDKSRC/.dart_tool/package_config.json"

if [ ! -f "$PKGCFG" ]; then
  echo
  echo "## ---- attempt B: a TRIMMED workspace -- only pkg/compiler's own closure ----"
  echo "## Attempt A resolves every member in the SDK (analysis_server, dartdev,"
  echo "## the lot). Any single one of them needing a DEPS-only package sinks the"
  echo "## whole resolve for reasons that have nothing to do with dart2js. B lists"
  echo "## only the in-pkg closure dart2js actually needs."
  cp "$SDKSRC/pubspec.yaml" "$OUT/pubspec.root.bak"
  python3 - "$SDKSRC" <<'PY'
import pathlib, re, sys
root = pathlib.Path(sys.argv[1])

def deps_of(pkg):
    p = root / "pkg" / pkg / "pubspec.yaml"
    if not p.is_file():
        return []
    spec = p.read_text()
    names = []
    # dev_dependencies are BACK. Spike 3 walked them and the closure hit
    # "testing requires ^3.13.0-0", so spike 4 dropped them -- but that error was
    # the VERSION SKEW, now fixed by pinning, and had nothing to do with dev
    # deps. Dropping them then produced "front_end depends on dart2wasm which
    # doesn't exist", because pub resolves the dev_dependencies of every
    # workspace member whether or not I put them in my closure. So an SDK-local
    # dev_dep must ALSO be a member.
    #
    # I changed two things at once in spike 4 and misattributed one of them.
    # That is the whole reason this round exists.
    for block in ("dependencies", "dev_dependencies"):
        m = re.search(rf"^{block}:\n((?:[ \t]+.*\n|\n)*)", spec, re.M)
        if m:
            names += re.findall(r"^\s{2,}([A-Za-z_][A-Za-z0-9_]*):", m.group(1), re.M)
    return names

seen, queue = set(), ["compiler"]
while queue:
    cur = queue.pop()
    if cur in seen or not (root / "pkg" / cur).is_dir():
        continue
    seen.add(cur)
    queue += deps_of(cur)

members = sorted(seen)
print(f"     trimmed workspace: {len(members)} members")
print("     " + " ".join(members))
body = ["name: _", "publish_to: none", "environment:", "  sdk: ^3.12.0-0", "workspace:"]
body += [f"  - pkg/{m}" for m in members]
(root / "pubspec.yaml").write_text("\n".join(body) + "\n")
PY
  ( cd "$SDKSRC" && timeout 900 dart pub get 2>&1 | head -25 | sed 's/^/     /' )
fi

if [ -f "$PKGCFG" ]; then
  echo "     RESOLVED -- $(python3 -c "import json;print(len(json.load(open('$PKGCFG'))['packages']))") packages"
  python3 -c "
import json
names = sorted(p['name'] for p in json.load(open('$PKGCFG'))['packages'])
for n in ('compiler','front_end','kernel','shell_arg_splitter'):
    print(f'     {n:20} in package_config: {n in names}')
"
else
  echo "     STILL UNRESOLVED after A and B. The gates below cannot run; read the errors."
fi

# ---------------------------------------------------------------------------
hr "5. THE REFERENCE IMPLEMENTATION -- printed BEFORE the gate that guesses"
# ---------------------------------------------------------------------------
echo "## ---- who implements the three interfaces? (spike 1 inferred; confirm) ----"
grep -rn --include='*.dart' "implements CompilerInput\|implements CompilerOutput\|implements CompilerDiagnostics\|implements api.CompilerInput\|implements api.CompilerOutput\|implements api.CompilerDiagnostics" \
  "$SDKSRC/pkg/compiler/lib" 2>/dev/null | sed "s|$SDKSRC/||" | head -12 | sed 's/^/     /'
echo
echo "## ---- pkg/compiler/lib/src/util/memory_compiler.dart ----"
echo "## Spike 3 surfaced this while confirming the implementers, and it is the"
echo "## single most important file in this whole track: the SDK's OWN in-memory"
echo "## dart2js harness. It is gx_core.dart, except written by the people who"
echo "## own the compiler and kept green by their tests. I hand-wrote a worse"
echo "## version of it for three spikes without ever looking for it -- the same"
echo "## mistake as Bx-10, where the answer to the musl question was sitting in"
echo "## an upstream build script the whole time. Print it; do not summarise it."
python3 - "$SDKSRC" <<'PY'
import pathlib, re, sys
root = pathlib.Path(sys.argv[1])
p = root / "pkg/compiler/lib/src/util/memory_compiler.dart"
if not p.is_file():
    print("     ABSENT -- then output_collector.dart is the next place to look")
else:
    src = p.read_text()
    print(f"     {len(src.splitlines())} lines")
    print("     ---- imports (does it need dart:io?) ----")
    for m in re.finditer(r"^import[^\n;]*;", src, re.M):
        print("       " + m.group(0))
    print("     ---- VERBATIM ----")
    for line in src.split("\n"):
        print("       " + line)
PY
echo
echo "## ---- pkg/compiler/lib/src/util/memory_source_file_helper.dart ----"
echo "## memory_compiler imports this for its provider. The question that decides"
echo "## whether the SDK harness can EVER be the browser path: does its provider"
echo "## serve everything from memory, or does it fall back to dart:io for any Uri"
echo "## outside the map? If it falls back, gx_core's own provider stays necessary"
echo "## for the web gate and the SDK harness is only ever a VM control."
python3 - "$SDKSRC" <<'PY'
import pathlib, re, sys
p = pathlib.Path(sys.argv[1]) / "pkg/compiler/lib/src/util/memory_source_file_helper.dart"
if not p.is_file():
    print("     ABSENT")
else:
    src = p.read_text()
    print(f"     {len(src.splitlines())} lines")
    for m in re.finditer(r"^import[^\n;]*;", src, re.M):
        print("       " + m.group(0))
    print("     ---- VERBATIM ----")
    for line in src.split("\n"):
        print("       " + line)
PY
echo
echo "## ---- pkg/compiler/lib/src/util/output_collector.dart: the in-memory CompilerOutput ----"
python3 - "$SDKSRC" <<'PY'
import pathlib, re, sys
p = pathlib.Path(sys.argv[1]) / "pkg/compiler/lib/src/util/output_collector.dart"
if not p.is_file():
    print("     ABSENT")
else:
    src = p.read_text()
    print(f"     {len(src.splitlines())} lines")
    for m in re.finditer(r"^import[^\n;]*;", src, re.M):
        print("       " + m.group(0))
    for line in src.split("\n")[:90]:
        print("       " + line)
PY
python3 - "$SDKSRC" <<'PY'
import pathlib, re, sys
p = pathlib.Path(sys.argv[1]) / "pkg/compiler/lib/src/options.dart"
if not p.is_file():
    print("     options.dart ABSENT"); raise SystemExit
src = p.read_text()
found = False
for m in re.finditer(r"^\s*(static\s+CompilerOptions\s+parse\s*\(|factory\s+CompilerOptions[^\n]*\(|CompilerOptions\.\w+\s*\()", src, re.M):
    found = True
    i = m.start()
    seg = src[i:i + 1400]
    brace = seg.find("{")
    print("     ---- options.dart:%d ----" % (src[:i].count("\n") + 1))
    for line in seg[:brace if brace > 0 else 400].split("\n")[:26]:
        print("       " + line)
    print()
if not found:
    print("     no parse/factory found -- construction is some other shape; grep dump:")
    for m in re.finditer(r"^[^\n]*CompilerOptions[^\n]*$", src, re.M):
        print("       " + m.group(0)[:120])
PY
echo
echo "## ---- the CLI's own call into api.compile -- ground truth ----"
python3 - "$SDKSRC" <<'PY'
import pathlib, re, sys
p = pathlib.Path(sys.argv[1]) / "pkg/compiler/lib/src/dart2js.dart"
if not p.is_file():
    print("     dart2js.dart ABSENT"); raise SystemExit
lines = p.read_text().split("\n")
for i, l in enumerate(lines):
    if re.search(r"\bapi\.compile\(|\bcompileFunc\(|CompilerOptions\.parse\(", l):
        lo, hi = max(0, i - 8), min(len(lines), i + 12)
        print(f"     ---- dart2js.dart:{i+1} ----")
        for j in range(lo, hi):
            print(f"       {j+1:5d}  {lines[j]}")
        print()
PY

# ---------------------------------------------------------------------------
hr "6. GATE 1 -- ZERO GUESSES. Does dart2js compile ITSELF to JavaScript?"
# ---------------------------------------------------------------------------
# The roadmap's spike, verbatim: "self-compile a modern dart2js and measure the
# artifact size + compile time". Nothing of mine is in this compile path, so it
# cannot fail for a reason I invented -- which after two rounds of exactly that
# is the property I want most.
G1="$OUT/gate1"; mkdir -p "$G1"
T0=$(date +%s%N)
( cd "$SDKSRC" && timeout 1200 dart compile js \
    pkg/compiler/lib/src/dart2js.dart -o "$G1/dart2js_self.js" -O1 2>&1 | tail -20 | sed 's/^/     /' )
T1=$(date +%s%N)
if [ -f "$G1/dart2js_self.js" ]; then
  SZ=$(stat -c%s "$G1/dart2js_self.js")
  DZ=$(stat -c%s "$DILL")
  gzip -c "$G1/dart2js_self.js" > "$G1/dart2js_self.js.gz" 2>/dev/null
  echo
  echo "     ################################################"
  echo "     SELF-HOST ARTIFACT : $SZ bytes"
  echo "     gzipped            : $(stat -c%s "$G1/dart2js_self.js.gz" 2>/dev/null) bytes"
  echo "     COMPILE TIME       : $(( (T1 - T0) / 1000000000 )) s"
  echo "     PLATFORM DILL      : $DZ bytes"
  echo "     TOTAL TO SERVE     : $(( (SZ + DZ) / 1048576 )) MB"
  echo "     ################################################"
  echo "     glifex already vendors: wat 1.3M, php 10M, python 12M, ruby 30M,"
  echo "     csharp 39M, rust 122M -- that is the bar this number is judged against"
else
  echo "     NO ARTIFACT. If the tree resolved and this still failed, it is the"
  echo "     first real evidence against the thesis. Read the error, not my prose."
fi

# ---------------------------------------------------------------------------
hr "7. GATE 2a -- the embeddable core on the VM. Is my API usage right?"
# ---------------------------------------------------------------------------
G2="$OUT/gate2"; mkdir -p "$G2"
# Do not assume the inputs exist -- spike 1 only ever listed lib/_internal, so
# lib/libraries.json is an assumption until this line prints.
echo "## ---- the inputs a browser worker would have to fetch() ----"
for F in "$DILL" "$LIBSPEC"; do
  if [ -f "$F" ]; then
    printf "     %10s  %s\n" "$(stat -c%s "$F")" "$F"
  else
    printf "     %10s  %s\n" "ABSENT" "$F"
  fi
done
if [ ! -f "$LIBSPEC" ]; then
  echo "     libraries.json is not there -- looking for where it actually lives:"
  find "$SDK_ROOT" -name 'libraries.json' 2>/dev/null | head -5 | sed 's/^/       /'
fi
echo
mkdir -p "$SDKSRC/pkg/compiler/tool/gx"
cp tools/dart-spike/embed/gx_core.dart tools/dart-spike/embed/gx_vm.dart tools/dart-spike/embed/gx_web.dart tools/dart-spike/embed/gx_ref.dart \
   "$SDKSRC/pkg/compiler/tool/gx/"
echo "## staged into pkg/compiler/tool/gx/ so it inherits pkg/compiler's resolution"
echo
echo "## ---- GATE 2a-REF: the SDK's OWN runCompiler. Run the control first. ----"
echo "## If this passes and gx_core fails, my providers are wrong. If this fails"
echo "## too, the fault is the environment or the platform inputs and gx_core was"
echo "## never the suspect. One variable at a time."
( cd "$SDKSRC" && timeout 900 dart run pkg/compiler/tool/gx/gx_ref.dart \
    "$G2" "$LIBSPEC" "$SDK_ROOT/lib/_internal" 2>&1 | head -40 | sed 's/^/     /' )
if [ -f "$G2/gx_ref_out.js" ]; then
  echo "     ---- RUN the JS the SDK's own harness produced ----"
  node "$G2/gx_ref_out.js" 2>&1 | head -4 | sed 's/^/       /'
fi
echo
echo "## ---- GATE 2a-GX: my own in-memory providers, same environment ----"
echo
( cd "$SDKSRC" && timeout 900 dart run pkg/compiler/tool/gx/gx_vm.dart "$DILL" "$G2" "$LIBSPEC" 2>&1 | head -80 | sed 's/^/     /' )
if [ -f "$G2/gx_vm_out.js" ]; then
  echo "     ---- RUN the JS the embedded compiler produced ----"
  node "$G2/gx_vm_out.js" 2>&1 | head -4 | sed 's/^/       /'
fi

# ---------------------------------------------------------------------------
hr "8. GATE 2b -- the compiler AS JAVASCRIPT, with no filesystem at all"
# ---------------------------------------------------------------------------
T2=$(date +%s%N)
( cd "$SDKSRC" && timeout 1200 dart compile js pkg/compiler/tool/gx/gx_web.dart -o "$G2/gx_web.js" -O1 2>&1 | tail -12 | sed 's/^/     /' )
T3=$(date +%s%N)
if [ -f "$G2/gx_web.js" ]; then
  gzip -c "$G2/gx_web.js" > "$G2/gx_web.js.gz" 2>/dev/null
  echo "     embedded compiler : $(stat -c%s "$G2/gx_web.js") bytes ($(stat -c%s "$G2/gx_web.js.gz" 2>/dev/null) gzipped)"
  echo "     compile time      : $(( (T3 - T2) / 1000000000 )) s"
  echo "     ---- drive it in node: no dart:io reachable, dill from the JS host ----"
  timeout 900 node tools/dart-spike/drive-web.cjs "$G2/gx_web.js" "$DILL" "$LIBSPEC" 2>&1 | head -60 | sed 's/^/     /'
else
  echo "     no gx_web.js -- if gate 2a passed, the fault is interop, not the API"
fi

# ---------------------------------------------------------------------------
hr "9. test_matrix.json -- an existing self-host config?"
# ---------------------------------------------------------------------------
python3 - "$SDKSRC" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1]) / "tools/bots/test_matrix.json"
if not p.is_file():
    print("     ABSENT"); raise SystemExit
hits = [l.strip() for l in p.read_text().split("\n") if "self" in l.lower() and "host" in l.lower()]
print(f"     lines mentioning self-host: {len(hits)}")
for h in hits[:15]:
    print("       " + h[:150])
PY

hr "SUMMARY"
echo "##   S2  pkg/dartpad_worker -- did Google already write our worker?"
echo "##   S4  resolution (A full workspace / B trimmed closure)"
echo "##   S5  the real CompilerOptions surface + CLI call site"
echo "##   S6  GATE 1 -- self-host size + compile time (the roadmap's ask)"
echo "##   S7  GATE 2a -- embeddable API on the VM"
echo "##   S8  GATE 2b -- compiler as JS, no filesystem, output executed"
