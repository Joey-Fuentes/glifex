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

hr() { echo; echo "############################################################"; echo "## $1"; echo "############################################################"; }

# ---------------------------------------------------------------------------
hr "1. CHECKOUT -- directories only, and ASSERT it worked"
# ---------------------------------------------------------------------------
if [ ! -d "$SDKSRC" ]; then
  git clone --depth 1 --filter=blob:none --sparse \
    https://github.com/dart-lang/sdk.git "$SDKSRC" > "$OUT/clone.log" 2>&1 || {
      echo "## CLONE FAILED"; tail -5 "$OUT/clone.log"; exit 1; }
  # Directories. No leading slash. No files. Root files come along for free in
  # cone mode -- proven by spike 2, which got the root pubspec.yaml while both
  # of its sparse commands were failing.
  git -C "$SDKSRC" sparse-checkout set pkg tools sdk 2>&1 | tee -a "$OUT/clone.log" | sed 's/^/     /'
fi
echo "## commit  $(git -C "$SDKSRC" rev-parse HEAD)"
echo "## dated   $(git -C "$SDKSRC" log -1 --format=%cd --date=short)"
echo "## size    $(du -sh "$SDKSRC" 2>/dev/null | cut -f1)"
echo "## pkg/    $(ls "$SDKSRC/pkg" 2>/dev/null | wc -l) directories"

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
  grep -rln --include='*.dart' "compiler_api\|CompilerInput\|dart2js\|dart2wasm\|kernelForProgram" "$D" 2>/dev/null \
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
echo "## ---- CompilerOptions: the real construction surface ----"
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
mkdir -p "$SDKSRC/pkg/compiler/tool/gx"
cp tools/dart-spike/embed/gx_core.dart tools/dart-spike/embed/gx_vm.dart tools/dart-spike/embed/gx_web.dart \
   "$SDKSRC/pkg/compiler/tool/gx/"
echo "## staged into pkg/compiler/tool/gx/ so it inherits pkg/compiler's resolution"
echo
( cd "$SDKSRC" && timeout 900 dart run pkg/compiler/tool/gx/gx_vm.dart "$DILL" "$G2" 2>&1 | head -80 | sed 's/^/     /' )
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
  timeout 900 node tools/dart-spike/drive-web.cjs "$G2/gx_web.js" "$DILL" 2>&1 | head -60 | sed 's/^/     /'
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
