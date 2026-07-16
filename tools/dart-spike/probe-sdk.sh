#!/usr/bin/env bash
# probe-sdk.sh -- READ the Dart compilers. Do not reason about them.
#
# THE DECISIVE CRITERION for Bx-13, and it is the direct analogue of the one
# that picked libriscv over Spike and VIXL over arm-sandbox:
#
#   Can a Dart compiler run with NO dart:io -- taking its inputs from a
#   PLUGGABLE PROVIDER instead of a filesystem?
#
# That is the entire roadmap thesis. dart2js is written in Dart and so it can
# self-host to JS -- but ONLY for code that dart2js can compile, and dart2js
# cannot compile dart:io. try.dartlang.org (2013) did not compile the dart2js
# CLI; it compiled against an EMBEDDABLE API (CompilerInput / CompilerOutput /
# CompilerDiagnostics) whose whole purpose was to hand the compiler its sources
# rather than let it open() them.
#
# So the questions this job answers, by reading source at a recorded commit:
#   1. Does that embeddable API still exist in a modern SDK?
#   2. Is dart:io walled into the CLI layer, or spread through the guts?
#      (A shim for the former is a shim. For the latter it is a port.)
#   3. Does pkg/compiler resolve OUTSIDE a gclient/DEPS tree at all?
#
# NOT the criterion: "can dart2js compile a hello world" -- of course it can,
# on a host, from a filesystem. That is the thing we already have on the CLI
# and it is worth nothing to the browser track.
#
# Prior art being honoured here: Bx-10's desk research recommended a candidate
# whose header it had never opened and was wrong three times over about LP64;
# the answer to the musl question was sitting in an upstream build script the
# whole time. So: print the actual signatures, print the actual licence, record
# the actual commit. Spike 2 writes code against whatever comes back -- not
# against anybody's recollection of this API, mine included.
set -uo pipefail

OUT="${1:?usage: probe-sdk.sh <out-dir>}"
mkdir -p "$OUT"
SDKSRC="$HOME/dart-sdk-src"

hr() { echo; echo "############################################################"; echo "## $1"; echo "############################################################"; }

# ---------------------------------------------------------------------------
hr "1. THE INSTALLED SDK -- what setup-dart actually gave us"
# ---------------------------------------------------------------------------
echo "## dart      $(dart --version 2>&1)"
DART_BIN="$(command -v dart)"
echo "## bin       $DART_BIN"
SDK_ROOT="$(dirname "$(dirname "$(readlink -f "$DART_BIN")")")"
echo "## root      $SDK_ROOT"
echo "## size      $(du -sh "$SDK_ROOT" 2>/dev/null | cut -f1)"
echo
echo "## ---- licence (the first thing that can disqualify it) ----"
for f in LICENSE LICENSE.txt COPYING; do
  [ -f "$SDK_ROOT/$f" ] && { head -4 "$SDK_ROOT/$f" | sed 's/^/     /'; break; }
done
echo
echo "## ---- does the RELEASED sdk ship pkg/ sources? (if yes, no clone needed) ----"
if [ -d "$SDK_ROOT/pkg" ]; then
  echo "     pkg/ EXISTS: $(ls "$SDK_ROOT/pkg" | tr '\n' ' ')"
else
  echo "     pkg/ ABSENT -- compiler sources are not in the release. Clone required."
fi
echo
echo "## ---- lib/_internal: the platform dills are what a browser track must SERVE ----"
echo "## ---- so their size is a hard number the roadmap does not have yet ----"
find "$SDK_ROOT/lib/_internal" -maxdepth 1 -type f 2>/dev/null \
  | while read -r f; do printf "     %10s  %s\n" "$(stat -c%s "$f")" "$(basename "$f")"; done
echo "     ---- total lib/_internal: $(du -sh "$SDK_ROOT/lib/_internal" 2>/dev/null | cut -f1)"

# ---------------------------------------------------------------------------
hr "2. CONTROL -- run the known-good thing first, and pin the constraint as a FACT"
# ---------------------------------------------------------------------------
# The guide's rule: run the known-good control before believing any failure.
# This also converts "dart2js cannot compile dart:io" from a belief I hold into
# a line in a log. If step 2b SUCCEEDS, the whole premise of this spike is
# wrong and that is worth finding out in 4 seconds.
K="$OUT/control"; mkdir -p "$K"
cp tools/dart-spike/katas/*.dart "$K/" 2>/dev/null

echo "## ---- 2a. hello.dart -- plain dart2js, must PASS ----"
T0=$(date +%s%N)
( cd "$K" && dart compile js hello.dart -o hello.js 2>&1 | sed 's/^/     /' )
T1=$(date +%s%N)
if [ -f "$K/hello.js" ]; then
  echo "     artifact  $(stat -c%s "$K/hello.js") bytes"
  echo "     wall      $(( (T1 - T0) / 1000000 )) ms"
  echo "     output    $(node "$K/hello.js" 2>&1 | head -2)"
else
  echo "     NO ARTIFACT -- the control failed. Nothing below this line means anything."
fi

echo
echo "## ---- 2b. uses_io.dart -- imports dart:io. EXPECTED to be REJECTED ----"
echo "## ---- if this passes, dart2js grew dart:io support and Bx-13 just got easier ----"
( cd "$K" && dart compile js uses_io.dart -o uses_io.js 2>&1 | head -12 | sed 's/^/     /' )
if [ -f "$K/uses_io.js" ]; then
  echo "     !! COMPILED ANYWAY -- $(stat -c%s "$K/uses_io.js") bytes. Re-read the premise."
else
  echo "     rejected, as the thesis predicts -- this is why an embeddable API matters"
fi

# ---------------------------------------------------------------------------
hr "3. THE SDK SOURCE at a recorded commit"
# ---------------------------------------------------------------------------
# blob:none + sparse: dart-lang/sdk is enormous and we want four directories.
if [ ! -d "$SDKSRC" ]; then
  git clone --depth 1 --filter=blob:none --sparse \
    https://github.com/dart-lang/sdk.git "$SDKSRC" > "$OUT/clone.log" 2>&1 || {
      echo "## CLONE FAILED"; tail -5 "$OUT/clone.log"; exit 0; }
  git -C "$SDKSRC" sparse-checkout set \
    pkg/compiler pkg/dart2wasm pkg/front_end pkg/kernel pkg/_fe_analyzer_shared tools \
    >> "$OUT/clone.log" 2>&1
fi
echo "## commit  $(git -C "$SDKSRC" rev-parse HEAD)"
echo "## dated   $(git -C "$SDKSRC" log -1 --format=%cd --date=short)"
echo "## size    $(du -sh "$SDKSRC" 2>/dev/null | cut -f1) (sparse)"
echo "## licence $(head -1 "$SDKSRC/LICENSE" 2>/dev/null)"
echo
echo "## ---- what materialised ----"
for d in pkg/compiler pkg/dart2wasm pkg/front_end pkg/kernel; do
  if [ -d "$SDKSRC/$d" ]; then
    printf "     %-24s %6s  %4s .dart files\n" "$d" \
      "$(du -sh "$SDKSRC/$d" 2>/dev/null | cut -f1)" \
      "$(find "$SDKSRC/$d" -name '*.dart' 2>/dev/null | wc -l)"
  else
    printf "     %-24s ABSENT\n" "$d"
  fi
done

# ---------------------------------------------------------------------------
hr "4. THE DECISIVE API -- printed from the real source, not recalled"
# ---------------------------------------------------------------------------
# Historic names, in case it moved or got renamed: compiler_api.dart is the
# modern one, compiler_new.dart / compiler.dart were the old ones. Search, do
# not assume.
echo "## ---- candidate API entrypoints found ----"
find "$SDKSRC/pkg/compiler/lib" -maxdepth 1 -name '*.dart' 2>/dev/null | sed 's/^/     /'
echo
for cand in compiler_api.dart compiler_new.dart compiler.dart; do
  F="$SDKSRC/pkg/compiler/lib/$cand"
  [ -f "$F" ] || continue
  echo "## ---- VERBATIM: pkg/compiler/lib/$cand ($(wc -l < "$F") lines) ----"
  # The whole file: it is the interface the entire track hinges on, and a
  # summary of it is exactly the artefact that has burned this project before.
  sed 's/^/     /' "$F"
  echo
done
echo "## ---- the abstract classes a host must implement (grepped, whole SDK pkg) ----"
for sym in CompilerInput CompilerOutput CompilerDiagnostics OutputSink BinaryOutputSink CompilationResult CompilerOptions; do
  printf "   %-22s " "$sym"
  N=$(grep -rln --include='*.dart' -w "abstract class $sym\|class $sym" "$SDKSRC/pkg/compiler/lib" 2>/dev/null | head -1)
  if [ -n "$N" ]; then echo "${N#$SDKSRC/}"; else echo "ABSENT"; fi
done
echo
echo "## ---- dart2wasm: does it have the same shape? (the modern equivalent) ----"
find "$SDKSRC/pkg/dart2wasm/lib" -maxdepth 1 -name '*.dart' 2>/dev/null | sed 's/^/     /'
for cand in compile.dart compiler_options.dart; do
  F="$SDKSRC/pkg/dart2wasm/lib/$cand"
  [ -f "$F" ] && { echo "     ---- head of pkg/dart2wasm/lib/$cand ----";
                   head -60 "$F" | sed 's/^/       /'; }
done

# ---------------------------------------------------------------------------
hr "5. dart:io -- walled into the CLI, or spread through the guts?"
# ---------------------------------------------------------------------------
# This is the number that decides whether the blocker is a SHIM or a PORT.
# The roadmap asserts "the blocker shrinks to a dart:io shim (virtual FS)".
# It is an assertion. Here is the measurement.
#
# python3, not grep, and deliberately so. This project's own log: "Grep-based
# verification lied three separate times this session -- a degenerate pattern
# counted every line as a match; a correct-looking pattern counted zero on a
# file with 48." The standing rule is that any check which GATES A DECISION
# reads bytes with python3 or od. This is the gate for the whole track's cost
# estimate, so it reads bytes.
python3 - "$SDKSRC" <<'PY'
import pathlib, re, sys
root = pathlib.Path(sys.argv[1])
# Match the import DIRECTIVE only -- not the string "dart:io" in a comment, a
# doc string, or an error message about dart:io, all of which exist in a
# compiler that has to TALK about dart:io for a living. A substring count here
# would overstate the problem and send spike 2 the wrong way.
pat = re.compile(rb"""^\s*import\s+['"]dart:io['"]""", re.M)
for pkgdir in ("pkg/compiler", "pkg/dart2wasm", "pkg/front_end", "pkg/kernel"):
    lib = root / pkgdir / "lib"
    if not lib.is_dir():
        print(f"## {pkgdir}/lib -- ABSENT")
        continue
    files = sorted(lib.rglob("*.dart"))
    hits = [p for p in files if pat.search(p.read_bytes())]
    pct = (100 * len(hits) / len(files)) if files else 0
    print(f"## {pkgdir}/lib -- {len(hits)} of {len(files)} .dart files import dart:io ({pct:.1f}%)")
    # WHERE they sit is the actual finding. All under src/ + a CLI entrypoint
    # means a wall we can build behind. Scattered through the guts means a port.
    for p in hits[:25]:
        print("     " + str(p.relative_to(root)))
    if len(hits) > 25:
        print(f"     ... and {len(hits) - 25} more")
    print()
PY

# ---------------------------------------------------------------------------
hr "6. HAS GOOGLE ALREADY DONE THIS? (proven >> promising)"
# ---------------------------------------------------------------------------
# libriscv won Bx-10b on one fact: it already had a wasm example in-tree.
# If the SDK still carries a self-host target, we inherit a recipe instead of
# inventing one. If it carries a DELETED one, the history says why it died.
echo "## ---- in-tree references to self-hosting dart2js ----"
grep -rlni "self.host\|selfhost\|dart2js_self\|compile dart2js with dart2js" \
  "$SDKSRC/pkg/compiler" "$SDKSRC/tools" 2>/dev/null | head -12 | sed 's/^/     /'
echo
echo "## ---- pkg/compiler/pubspec.yaml -- the dependency shape, verbatim ----"
echo "## ---- (this is the step-7 preview: how many of these are pub, how many DEPS?) ----"
sed 's/^/     /' "$SDKSRC/pkg/compiler/pubspec.yaml" 2>/dev/null || echo "     NO PUBSPEC -- pkg/compiler is not a standalone package at all"
echo
echo "## ---- does the SDK carry a generated package_config? (the gclient artefact) ----"
ls -la "$SDKSRC/.dart_tool/package_config.json" 2>/dev/null | sed 's/^/     /' \
  || echo "     ABSENT -- expected: it is generated by gclient sync, not committed"

# ---------------------------------------------------------------------------
hr "7. THE RISK STEP -- does pkg/compiler resolve OUTSIDE a gclient tree?"
# ---------------------------------------------------------------------------
# Flagged up front as the most likely wall. The SDK builds via gclient/DEPS and
# pkg/compiler resolves its siblings through a GENERATED package_config.json.
# If a bare path-dependency cannot resolve it, Bx-13 is not dead but it is a
# great deal less "the easiest remaining track" than the roadmap claims, and we
# would want to know that now rather than three PRs in.
S="$OUT/shim"; mkdir -p "$S"
cat > "$S/pubspec.yaml" <<EOF
name: gx_dart_spike
publish_to: none
environment:
  sdk: '>=3.4.0 <4.0.0'
dependencies:
  compiler:
    path: $SDKSRC/pkg/compiler
EOF
echo "## ---- pubspec under test ----"
sed 's/^/     /' "$S/pubspec.yaml"
echo
echo "## ---- dart pub get ----"
( cd "$S" && timeout 300 dart pub get 2>&1 | head -40 | sed 's/^/     /' )
if [ -f "$S/.dart_tool/package_config.json" ]; then
  echo "     RESOLVED -- $(grep -c '"name"' "$S/.dart_tool/package_config.json") packages"
  echo "     ^^ if this resolved, spike 2 writes the embeddable entrypoint against it"
else
  echo "     DID NOT RESOLVE -- this is the wall. The log above names it."
fi

hr "SUMMARY -- read the four numbers, not the vibes"
echo "##   1. embeddable API present?     -- section 4"
echo "##   2. dart:io: shim or port?      -- section 5 ratios"
echo "##   3. platform dill bytes to serve -- section 1"
echo "##   4. resolves outside gclient?   -- section 7"
echo "##"
echo "## Spike 2 only gets written if 1 and 4 came back yes."
