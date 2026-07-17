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
# NEVER pipe a long-running command into head.
#
# Spike 5's resolve was WORKING -- pub was mid "Downloading packages", listing
# args, async, collection, crypto, dart_style, http, json_rpc_2 -- and my own
# "dart pub get 2>&1 | head -25" killed it. head exits at line 25, pub takes
# SIGPIPE on its next write and dies, package_config.json never gets written
# because pub writes it last, and the probe then announced "STILL UNRESOLVED"
# and produced six sections of confident nonsense. Exactly 25 lines of output.
# Reproduced locally in ten seconds.
#
# tail is safe, since it reads all of stdin. But uniformity beats cleverness
# here: everything captures to a file and reads the file back, so the artifact
# carries the FULL log instead of my arbitrary truncation -- which is what a
# spike is for.
#
#   run_in_sdk <log> <headlines> <command...>   -- runs in $SDKSRC
#   run_here   <log> <headlines> <command...>   -- runs in the repo checkout
_report_cap() {
  local log="$1" n="$2" rc="$3"
  local total
  total=$(wc -l < "$log" 2>/dev/null || echo 0)
  head -"$n" "$log" 2>/dev/null | sed 's/^/     /'
  if [ "$total" -gt "$n" ]; then
    echo "     ... and $(( total - n )) more lines -- full log in the artifact: $(basename "$log")"
  fi
  echo "     [exit $rc, $total lines]"
}
run_in_sdk() {
  local log="$1" n="$2"; shift 2
  ( cd "$SDKSRC" && "$@" ) > "$log" 2>&1
  local rc=$?
  _report_cap "$log" "$n" "$rc"
  return $rc
}
run_here() {
  local log="$1" n="$2"; shift 2
  "$@" > "$log" 2>&1
  local rc=$?
  _report_cap "$log" "$n" "$rc"
  return $rc
}

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
# Scan, do not regex. The one-big-pattern version stopped at the first comment
# inside the list, so it never saw third_party/pkg/dap and reported a clean
# bill of health while pub was failing on exactly that member.
lines = (root / "pubspec.yaml").read_text().split(chr(10))
members, inb = [], False
for line in lines:
    if line.startswith("workspace:"):
        inb = True
        continue
    if not inb:
        continue
    if not line.strip() or line.strip().startswith("#"):
        continue
    if not line[:1].isspace():
        break
    mm = re.match(r"\s*-\s*(\S+)", line)
    if mm:
        members.append(mm.group(1))
# third_party is gclient's; asking git for it is pointless.
tops = sorted({q.split("/")[0] for q in members if not q.startswith("third_party")})
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
hr "4. RESOLUTION -- A is proven impossible; B was working until I killed it"
# ---------------------------------------------------------------------------
# ATTEMPT A IS DEAD, and that is a finding, not a defeat.
#   Spike 5 checked out every directory the workspace names -- pkg runtime
#   samples tests tools sdk, derived from the pubspec rather than guessed -- and
#   still got:
#       No workspace packages matching 'third_party/pkg/dap'
#   third_party/pkg/* is gclient-managed. It is not in the git repository at any
#   tag, so no sparse-checkout can ever produce it. Resolving the FULL SDK
#   workspace requires gclient/DEPS, full stop. A is not attempted here.
#
# ATTEMPT B WAS ALREADY WORKING.
#   It reached "Downloading packages" and listed args, async, collection,
#   crypto, dart_style, http, json_rpc_2 -- and my own "| head -25" SIGPIPE'd
#   pub to death at line 25, before it could write package_config.json. See the
#   run_in_sdk helper at the top of this file.
echo "## ---- workspace members: which are missing, and whose fault is that? ----"
python3 - "$SDKSRC" <<'PY'
import pathlib, re, sys
root = pathlib.Path(sys.argv[1])
lines = (root / "pubspec.yaml").read_text().split(chr(10))
# Spike 5's regex stopped at the first comment inside the list and under-counted:
# it reported 75 present / 0 missing while pub was complaining about
# third_party/pkg/dap, which the regex had never seen. A census that cannot see
# the thing that breaks the build is not a census. Scan instead of matching one
# big pattern: skip blanks and comments, stop only at column 0.
members, inb = [], False
for line in lines:
    if line.startswith("workspace:"):
        inb = True
        continue
    if not inb:
        continue
    if not line.strip() or line.strip().startswith("#"):
        continue
    if not line[:1].isspace():
        break
    m = re.match(r"\s*-\s*(\S+)", line)
    if m:
        members.append(m.group(1))
missing = [q for q in members if not (root / q / "pubspec.yaml").is_file()]
print(f"     {len(members)} members declared, {len(members) - len(missing)} present, {len(missing)} MISSING")
for q in missing:
    why = "gclient/DEPS -- not in git at any tag" if q.startswith("third_party") else "a directory I failed to check out"
    print(f"       MISSING {q}   ({why})")
if any(q.startswith("third_party") for q in missing):
    print("     -> confirms attempt A needs gclient. B is the only road.")
PY

echo
echo "## ---- attempt B: a TRIMMED workspace -- only pkg/compiler's own closure ----"
cp "$SDKSRC/pubspec.yaml" "$OUT/pubspec.root.bak"
python3 - "$SDKSRC" <<'PY'
import pathlib, re, sys
root = pathlib.Path(sys.argv[1])

def deps_of(pkg):
    q = root / "pkg" / pkg / "pubspec.yaml"
    if not q.is_file():
        return []
    spec = q.read_text()
    names = []
    # dev_dependencies are IN. Spike 4 dropped them by blaming them for spike
    # 3's "testing requires ^3.13.0-0" -- which was actually the version skew --
    # and that produced "front_end depends on dart2wasm which doesn't exist",
    # because pub resolves the dev_deps of every workspace member whether or not
    # I list them. An SDK-local dev_dep must therefore also be a member.
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
(root / "pubspec.yaml").write_text(chr(10).join(body) + chr(10))
PY

# Capture to a file. Do NOT pipe pub into head. This line is the whole reason
# spike 6 exists.
run_in_sdk "$OUT/pubget-b.log" 30 timeout 900 dart pub get
PKGCFG="$SDKSRC/.dart_tool/package_config.json"

if [ -f "$PKGCFG" ]; then
  echo
  echo "     ################################################"
  echo "     RESOLVED -- $(python3 -c "import json;print(len(json.load(open('$PKGCFG'))['packages']))") packages"
  echo "     ################################################"
  python3 -c "
import json
names = sorted(pp['name'] for pp in json.load(open('$PKGCFG'))['packages'])
for n in ('compiler','front_end','kernel','shell_arg_splitter','dart2wasm','dev_compiler'):
    print(f'     {n:20} in package_config: {n in names}')
"
else
  echo "     NO package_config.json -- the tail of pubget-b.log is the reason:"
  tail -15 "$OUT/pubget-b.log" 2>/dev/null | sed 's/^/     /'
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
hr "6. WHY GATE 1 FAILED -- dart:ffi, and it is not dart:io"
# ---------------------------------------------------------------------------
# GATE 1 IS RETIRED. It asked the roadmap's question -- self-host artifact size
# and compile time -- and spike 6 answered it, though not the way gate 1 meant:
#
#   dart compile js pkg/compiler/lib/src/dart2js.dart
#     Error: Dart library 'dart:ffi' is not available on this platform.
#     package:compiler/src/dart2js.dart => package:compiler/src/io/mapped_file.dart
#       => package:mmap/mmap.dart => dart:ffi
#
# So the CLI entrypoint cannot self-host -- and the reason is NOT dart:io, which
# spike 1 proved compiles fine and only throws when called. dart:ffi is a HARD
# front-end rejection on the IMPORT GRAPH, before any tree shaking. Reachability
# is irrelevant; importing it at all is fatal.
#
# And gate 2b compiled ANYWAY, because the embeddable entrypoint does not import
# src/io/mapped_file.dart. That contrast is the finding the whole series was
# built to produce: the dart:ffi dependency lives in the host adapter layer, on
# the CLI's side of the line, exactly where dart:io lives.
#
# Re-running a compile known to fail costs a minute and teaches nothing. Census
# it instead: WHICH libraries pull dart:ffi, and are they all on the CLI side?
# If any sits under compiler_api's import graph, gate 2b was luck.
python3 - "$SDKSRC" <<'PY'
import pathlib, re, sys
root = pathlib.Path(sys.argv[1])
pat = re.compile(rb"""^\s*import\s+['"]dart:ffi['"]""", re.M)
print("## direct dart:ffi importers under pkg/ (bytes, not grep):")
hits = []
for pkgdir in sorted((root / "pkg").iterdir()):
    lib = pkgdir / "lib"
    if not lib.is_dir():
        continue
    for f in lib.rglob("*.dart"):
        if pat.search(f.read_bytes()):
            hits.append(f.relative_to(root))
for h in hits[:20]:
    print("     " + str(h))
print(f"     ({len(hits)} files)")
print()
print("## who in pkg/compiler reaches package:mmap?")
mm = re.compile(rb"""package:mmap/""")
for f in sorted((root / "pkg/compiler/lib").rglob("*.dart")):
    if mm.search(f.read_bytes()):
        print("     " + str(f.relative_to(root)))
print()
print("## and is mapped_file reachable from compiler_api? (who imports it)")
mf = re.compile(rb"""mapped_file\.dart""")
for f in sorted((root / "pkg/compiler/lib").rglob("*.dart")):
    if mf.search(f.read_bytes()):
        print("     " + str(f.relative_to(root)))
PY

echo
echo "## ---- CompilerOptions.deriveOptions: the map spike 6 could not modify ----"
echo "## Crash was: Unsupported operation: Cannot modify unmodifiable map, at"
echo "## options.dart:1160 via new Compiler via compile. gx_core now sets"
echo "## ..environment = <String, String>{} like the CLI does. Print the site so"
echo "## the fix is checked against the source rather than against my theory."
python3 - "$SDKSRC" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1]) / "pkg/compiler/lib/src/options.dart"
if not p.is_file():
    print("     options.dart ABSENT")
else:
    lines = p.read_text().split(chr(10))
    lo, hi = 1130, 1180
    for i in range(lo, min(hi, len(lines))):
        print(f"       {i+1:5d}  {lines[i]}")
PY

# ---------------------------------------------------------------------------
hr "6b. THE SERVING COST -- every byte a browser would fetch"
# ---------------------------------------------------------------------------
# The roadmap wanted artifact size + compile time. Gate 2b gives the artifact;
# these are the rest. dart-live (the third-party proof that a Dart toolchain
# runs in a browser) ships 36.5 MB raw / 11.2 MB gzipped for the VM route.
# This is the dart2js route's bill, measured the same way.
for F in "$DILL" "$LIBSPEC"; do
  if [ -f "$F" ]; then
    G=$(gzip -c "$F" | wc -c)
    printf "     %12s raw  %12s gz   %s\n" "$(stat -c%s "$F")" "$G" "$(basename "$F")"
  fi
done

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
run_in_sdk "$OUT/gate2a-ref.log" 45 timeout 900 dart run pkg/compiler/tool/gx/gx_ref.dart "$G2" "$LIBSPEC" "$SDK_ROOT/lib/_internal"
if [ -f "$G2/gx_ref_out.js" ]; then
  echo "     ---- RUN the JS the SDK's own harness produced ----"
  run_here "$OUT/gate2a-ref-out.log" 6 node "$G2/gx_ref_out.js"
fi
echo
echo "## ---- GATE 2a-GX: my own in-memory providers, same environment ----"
echo
run_in_sdk "$OUT/gate2a-gx.log" 80 timeout 900 dart run pkg/compiler/tool/gx/gx_vm.dart "$DILL" "$G2" "$LIBSPEC"
if [ -f "$G2/gx_vm_out.js" ]; then
  echo "     ---- RUN the JS the embedded compiler produced ----"
  run_here "$OUT/gate2a-gx-out.log" 6 node "$G2/gx_vm_out.js"
fi

# ---------------------------------------------------------------------------
hr "7a. THE CRASH REPORTER IS EATING THE CRASH"
# ---------------------------------------------------------------------------
# Spike 16's grep found it, and it is not what I predicted. I said
# source_file_provider.dart, because that is the one that reads http: sources.
# Wrong again -- 0 for 15 on theories. It is:
#
#   pkg/front_end/lib/src/base/crash.dart:94
#       HttpClient client = new HttpClient();
#   const String defaultServerAddress = "http://127.0.0.1:59410/";
#   data["error"] = safeToString(error);      <- line 91
#
# front_end's CRASH REPORTER. It phones home to a local crash server. So the
# compile crashed for some OTHER reason, reportCrash fired, and new HttpClient()
# threw Platform.version before it could say what the real error was. We have
# spent three rounds chasing the reporter instead of the crash. The real error is
# in data["error"], computed three lines above the thing that destroys it.
#
# And the reporter's own design confirms the intent:
#     } on SocketException {
#       // Assume the crash logger isn't running.
#       client.close(force: true);
#       return new Future<T>.error(     <- rethrows the ORIGINAL
# No crash server -> rethrow the original. That works on every platform where
# HttpClient() CONSTRUCTS. In JS it throws in the constructor, one line before
# the try -- a case nobody anticipated because nobody runs the CFE in a browser.
#
# THE PROOF THAT THIS IS A MASK AND NOT THE BUG: gate 2a-GX runs the SAME
# gx_core over the SAME seven inputs on the VM and SUCCEEDS -- ok true, out.js
# and out.js.map, 3.4 seconds. The crash exists only when the compiler is JS.
#
# So: print the file whole, find the lever, and defuse the reporter so the real
# error can speak.
echo "## ---- pkg/front_end/lib/src/base/crash.dart, VERBATIM ----"
echo "## I have seen lines 1-16 and 84-103 of this file. The guard at the top of"
echo "## reportCrash, resetCrashReporting, and the Crash type are all unseen, and"
echo "## every single time in this series that I have guessed at unseen code I"
echo "## have been wrong. So: the whole file."
python3 - "$SDKSRC" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1]) / "pkg/front_end/lib/src/base/crash.dart"
if not p.is_file():
    print("     ABSENT")
else:
    src = p.read_text()
    print(f"     {len(src.splitlines())} lines")
    for i, line in enumerate(src.split(chr(10))):
        print(f"     {i+1:5d}  {line}")
PY

echo
echo "## ---- who calls withCrashReporting / resetCrashReporting? ----"
python3 - "$SDKSRC" <<'PY'
import pathlib, re, sys
root = pathlib.Path(sys.argv[1])
pat = re.compile(rb"withCrashReporting|resetCrashReporting|\bhasCrashed\b")
for pk in ("front_end", "compiler", "kernel", "_fe_analyzer_shared"):
    lib = root / "pkg" / pk / "lib"
    if not lib.is_dir():
        continue
    for f in sorted(lib.rglob("*.dart")):
        b = f.read_bytes()
        if not pat.search(b):
            continue
        lines = b.decode("utf8", "replace").split(chr(10))
        for i, l in enumerate(lines):
            if re.search(r"withCrashReporting|resetCrashReporting|\bhasCrashed\b", l):
                kind = "(comment)" if l.strip().startswith("//") or l.strip().startswith("*") else ""
                print(f"     {f.relative_to(root)}:{i+1} {kind}")
                print(f"        {l.strip()[:110]}")
PY

# ---------------------------------------------------------------------------
hr "7a2. DEFUSE THE REPORTER -- a diagnostic patch, and it is marked as one"
# ---------------------------------------------------------------------------
# This EDITS THE SDK CHECKOUT. That is legitimate here and nowhere near a
# shipping track: it is a diagnostic, it lives only in this throwaway CI job's
# scratch clone, and its entire purpose is to stop the reporter destroying the
# error we need to read. It is announced loudly rather than done quietly.
#
# The patch is the file's OWN rethrow, hoisted above the HttpClient line:
#     return new Future<T>.error(error, trace);   // GX DIAGNOSTIC PATCH
#     HttpClient client = new HttpClient();
# Every identifier there is one spike 16 PRINTED. Line 91 is
# data["error"] = safeToString(error), so error is in scope. Line 92 is
# data["trace"] = "$trace", so trace is. Line 103 is return new Future<T>.error(
# -- so T is in scope AND that is the file's own way of rethrowing the original
# when the crash logger is not running. Nothing here is guessed.
#
# My first draft of this patch threw a SocketException instead, on the reasoning
# that the file already catches those. Testing it against the real text showed
# the throw lands BEFORE the try block, where the handler never sees it -- one
# mask swapped for another. Sixteen rounds and the lesson holds: test the fix,
# do not reason about it.
#
# And it is a real finding for Bx-13 either way: front_end's crash reporter is
# browser-hostile. Any browser track has to reckon with that, whether by an
# upstream fix or by never crashing.
if [ -f "$SDKSRC/pkg/front_end/lib/src/base/crash.dart" ]; then
  python3 - "$SDKSRC" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1]) / "pkg/front_end/lib/src/base/crash.dart"
src = p.read_text()
old = "HttpClient client = new HttpClient();"
if old not in src:
    print("     PATCH TARGET NOT FOUND -- crash.dart changed shape. Not patching.")
    print("     Read the verbatim dump above and retarget.")
    raise SystemExit
# Take the path crash.dart already takes when the logger is not running.
new = ("return new Future<T>.error(error, trace);  // GX DIAGNOSTIC PATCH\n"
       "  // ignore: dead_code\n"
       "  HttpClient client = new HttpClient();")
p.write_text(src.replace(old, new, 1))
print("     patched crash.dart: reportCrash now uses its own Future<T>.error(")
print("     error, trace) rethrow instead of phoning home. The original error lives.")
PY
  echo "     ---- the patched region ----"
  grep -n "GX DIAGNOSTIC PATCH" -A2 -B6 "$SDKSRC/pkg/front_end/lib/src/base/crash.dart" | sed 's/^/       /'
else
  echo "     crash.dart absent -- nothing to patch"
fi

# ---------------------------------------------------------------------------
hr "7b. THE CONTROL -- does dart2js ASYNC output run under node at all?"
# ---------------------------------------------------------------------------
# Spike 12 held the event loop open and gate 2b went from exiting silently to
# HANGING. That is the finding, not a setback: before, node exited because the
# loop was EMPTY, which means the compile had nothing pending whatsoever. That
# is not slow work. That is an await that will never resume.
#
# The clue was already in the log. Gate 2a-GX's output ran under node and
# printed solve(10)=55 -- but that kata is SYNCHRONOUS. gx_web's main is async
# and stalls at its first await. dart2js targets the BROWSER; its async
# scheduler picks a strategy at startup from self.scheduleImmediate /
# self.MutationObserver / setTimeout, and under bare node CommonJS there is no
# 'self'. A no-op scheduleImmediate gives exactly this signature.
#
# That is a hypothesis. Twelve spikes have taught me what my hypotheses are
# worth: every time I reasoned, I was wrong; every time I ran a two-second
# control, I learned the answer. So here is the control, and it runs BEFORE the
# 40-second compile it is meant to explain.
#
# Both ways, because a control that only tests the happy path proves nothing:
#   7b-1  bare node          -- expected to STALL if the hypothesis holds
#   7b-2  with self defined  -- expected to PASS if the hypothesis holds
# If 7b-1 passes, my hypothesis is dead and the fault is inside the compile.
# If 7b-2 also stalls, the fault is deeper than 'self' and gate 2b will say so.
C="$OUT/ctrl"; mkdir -p "$C"
cp tools/dart-spike/katas/async_control.dart "$C/" 2>/dev/null
run_here "$OUT/ctrl-compile.log" 8 timeout 300 dart compile js "$C/async_control.dart" -o "$C/async_control.js"

if [ -f "$C/async_control.js" ]; then
  echo "     artifact: $(stat -c%s "$C/async_control.js") bytes"
  echo
  echo "## ---- 7b-1: bare node, no self. timeout 20s: a stall is the signal ----"
  run_here "$OUT/ctrl-bare.log" 8 timeout 20 node "$C/async_control.js"
  echo
  echo "## ---- 7b-2: same artifact, with globalThis.self defined ----"
  cat > "$C/with_self.cjs" <<'@@'
globalThis.self = globalThis;
require(process.argv[2]);
@@
  run_here "$OUT/ctrl-self.log" 8 timeout 20 node "$C/with_self.cjs" "$C/async_control.js"
  echo
  echo "## ---- 7b-3: self AND scheduleImmediate -> setImmediate ----"
  echo "## dart2js's _initializeScheduleImmediate checks global.scheduleImmediate"
  echo "## FIRST, before MutationObserver and before the Timer fallback. If 7b-2"
  echo "## is not enough, this is the lever that should be."
  cat > "$C/with_both.cjs" <<'@@'
globalThis.self = globalThis;
globalThis.scheduleImmediate = (cb) => setImmediate(cb);
require(process.argv[2]);
@@
  run_here "$OUT/ctrl-both.log" 8 timeout 20 node "$C/with_both.cjs" "$C/async_control.js"
  echo
  echo "## ---- read it like this ----"
  echo "##   7b-1 stalls + 7b-2 passes -> the host was the fault all along, and"
  echo "##      drive-web.cjs now defines self. Gate 2b should follow."
  echo "##   7b-1 passes               -> hypothesis dead; the fault is inside the"
  echo "##      compile, and gate 2b's marks + input dump have to locate it."
  echo "##   both stall                -> deeper than self. Read the marks."
else
  echo "     NO CONTROL ARTIFACT -- dart compile js failed on 20 lines of Dart."
  echo "     Nothing below this line is worth reading until that is explained."
fi

# ---------------------------------------------------------------------------
hr "8. GATE 2b -- the compiler AS JAVASCRIPT, with no filesystem at all"
# ---------------------------------------------------------------------------
T2=$(date +%s%N)
run_in_sdk "$OUT/gate2b-compile.log" 20 timeout 1200 dart compile js pkg/compiler/tool/gx/gx_web.dart -o "$G2/gx_web.js" -O1
T3=$(date +%s%N)
if [ -f "$G2/gx_web.js" ]; then
  gzip -c "$G2/gx_web.js" > "$G2/gx_web.js.gz" 2>/dev/null
  echo "     embedded compiler : $(stat -c%s "$G2/gx_web.js") bytes ($(stat -c%s "$G2/gx_web.js.gz" 2>/dev/null) gzipped)"
  echo "     compile time      : $(( (T3 - T2) / 1000000000 )) s"
  echo "     ---- drive it in node: no dart:io reachable, dill from the JS host ----"
  run_here "$OUT/gate2b-drive.log" 60 timeout 900 node tools/dart-spike/drive-web.cjs "$G2/gx_web.js" "$DILL" "$LIBSPEC"

  # The stack names lines in a 16 MB generated file that no artifact carries.
  # Read them here, where the file still exists. gx_web.js:39126 is the frame
  # that constructs the HttpClient, and it is the only thing standing between
  # this track and a browser.
  echo
  echo "## ---- the emitted JS at every line the crash named ----"
  python3 - "$OUT/gate2b-drive.log" "$G2/gx_web.js" <<'@@'
import pathlib, re, sys
log = pathlib.Path(sys.argv[1])
js = pathlib.Path(sys.argv[2])
if not log.is_file() or not js.is_file():
    print("     (no drive log or no gx_web.js)")
    raise SystemExit
nums = []
for m in re.finditer(r"gx_web\.js:(\d+):?(\d+)?", log.read_text(errors="replace")):
    n = int(m.group(1))
    if n not in nums:
        nums.append(n)
if not nums:
    print("     (the crash named no gx_web.js lines -- nothing to dump)")
    raise SystemExit
lines = js.read_text(errors="replace").split(chr(10))
print(f"     {len(lines)} lines in gx_web.js; the crash named {len(nums)}: {nums}")
for n in nums:
    lo, hi = max(0, n - 4), min(len(lines), n + 3)
    print(f"     ======== gx_web.js:{n} ========")
    for j in range(lo, hi):
        mark = " >>" if j == n - 1 else "   "
        # Generated JS lines can be enormous; a window around the column is
        # more use than a truncated head.
        txt = lines[j]
        print(f"     {mark} {j+1:6d}  {txt[:220]}")
    print()
@@
else
  echo "     no gx_web.js -- if gate 2a passed, the fault is interop, not the API"
fi

# ---------------------------------------------------------------------------
hr "8b. EXPORT -- everything needed to drive the browser gate off-CI"
# ---------------------------------------------------------------------------
# Seventeen rounds, and every hypothesis about gate 2b has cost a full CI round
# to test. It does not have to. gx_web.js is SELF-CONTAINED JAVASCRIPT: running
# it needs node and two data files, not a Dart SDK and not a network. The only
# reason it has never been driven anywhere but here is that the artifact carried
# the compiler's OUTPUT (gx_web_out.js) and never the compiler itself.
#
# So export it. One upload, and every subsequent hypothesis about the JS host,
# the crash reporter, or the emitted code can be tested in seconds against the
# real bytes instead of costing a round.
#
# This is the same instinct as the request log and the stage marks: the job's
# purpose is to hand back enough to think with, not to be the only place
# thinking can happen.
E="$OUT/export"; mkdir -p "$E"
if [ -f "$G2/gx_web.js" ]; then
  gzip -c "$G2/gx_web.js" > "$E/gx_web.js.gz"
  gzip -c "$DILL" > "$E/dart2js_platform.dill.gz"
  cp "$LIBSPEC" "$E/libraries.json" 2>/dev/null
  cp tools/dart-spike/drive-web.cjs "$E/" 2>/dev/null
  [ -f "$OUT/ctrl/async_control.js" ] && cp "$OUT/ctrl/async_control.js" "$E/"
  cat > "$E/README.txt" <<'GXREADME'
Drive the JS-compiled Dart compiler with nothing but node.

  gunzip gx_web.js.gz dart2js_platform.dill.gz
  node drive-web.cjs gx_web.js dart2js_platform.dill libraries.json

gx_web.js IS the Dart compiler, compiled to JavaScript by dart2js. It reads its
platform inputs from two JS globals the driver fills -- gxGetDill and
gxGetLibrariesSpec -- so there is no filesystem anywhere in its compile path.
That is the whole Bx-13 thesis, in a form you can run.

drive-web.cjs defines globalThis.self before loading it. dart2js targets the
browser and reaches its global through self; bare node CommonJS has none, and
without it the async scheduler never initialises and the first await never
resumes. async_control.js is the 20-line proof of that, if you want it:
  node async_control.js                                  -> dies at first await
  node -e 'globalThis.self=globalThis;require("./async_control.js")'  -> passes

Known state at export: the compile reaches all seven inputs and then dies inside
front_end's crash reporter (crash.dart:94, new HttpClient()), which throws
Platform.version before it can report what actually went wrong.
GXREADME
  echo "     ---- exported ----"
  for f in "$E"/*; do printf "     %10s  %s\n" "$(stat -c%s "$f")" "$(basename "$f")"; done
  echo "     total $(du -sh "$E" | cut -f1) -- grab it from the dart-spike-selfhost artifact"
else
  echo "     no gx_web.js to export -- gate 2b did not produce one"
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
