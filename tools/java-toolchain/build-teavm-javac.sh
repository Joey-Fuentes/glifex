#!/usr/bin/env bash
# build-teavm-javac.sh <out-dir>
#
# teavm-javac -- OpenJDK javac + TeaVM, compiled to WebAssembly -- built from
# pinned sources at deploy, like dart2js and riscv64's binutils, and NOT vendored
# as an opaque blob. Emits the four files web/java-worker.js loads:
#   compiler.wasm  compiler.wasm-runtime.js
#   compile-classlib-teavm.bin  runtime-classlib-teavm.bin
#
# WHY THIS EXISTS. Until now Java fetched those four from
# https://teavm.org/playground/ -- one person's web server, serving a hand-uploaded
# artifact with NO version: teavm-javac publishes no releases and no tags, and its
# README offers only "the latest WebAssembly module". It was measurably stale. The
# runtime.js on that server has no teavmAsync, no notifyHeapResized and no
# teavm.imports; the one built here has all three, and teavmAsync IS the WasmGC
# coroutine support TeaVM 0.13 introduced -- so the shipped blob predated
# 7e4a44cf, the commit titled "Update teavm version to 0.13.1", which has been
# master since 2026-03-21. Full record: docs/teavm-javac-self-built.md.
#
# Measured, not assumed (Bx-8b rounds 1-4):
#   - :compiler:build emits all four. compiler/build.gradle ends with
#     build { dependsOn buildWasmGC, buildTeaVMClassLib, generateClassLib }.
#   - The build is BYTE-REPRODUCIBLE: three independent CI runs at this SHA on
#     JDK 25 produced identical sha256 for all four artifacts.
#   - Both artifact sets pass the real 001/002/003 corpus through the real
#     java-worker.js, in node and in a real Chromium module worker, with identical
#     verdicts, and compile all ten ceiling probes. The swap is inert.
set -euo pipefail
OUT="${1:?usage: build-teavm-javac.sh <out-dir>}"; mkdir -p "$OUT"
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/pins.env"

SRC="$HOME/teavm-javac-src"

# ---- the pin is only a pin if it is checked --------------------------------
# Round 1 built on JDK 21 because the README says 21. The build says 25:
# settings.gradle sets source/targetCompatibility to VERSION_25 and :javac
# compiles openjdk/jdk25u source using unnamed variables (_), final in 22 and
# preview-only in 21. Believing a README over the build is what sank dart2js
# spikes 3 and 4, and it cost a round here too.
HAVE="$(java -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/')"
if [ "$HAVE" != "$TEAVM_JAVAC_JDK" ]; then
  echo "REFUSE: java is $HAVE, pins.env says $TEAVM_JAVAC_JDK."
  echo "  The workflow must ask setup-java for the pinned version."
  exit 1
fi
case "$TEAVM_JAVAC_REPO" in
  *teavm-javac*) ;;
  *) echo "REFUSE: $TEAVM_JAVAC_REPO is not teavm-javac. konsoletyper/teavm is the"
     echo "  AOT compiler; its releases are Maven artifacts and it has no compiler.wasm."
     exit 1 ;;
esac
[ -n "${TEAVM_JAVAC_COMMIT:-}" ] || { echo "REFUSE: TEAVM_JAVAC_COMMIT is blank. Upstream has no tags; the SHA is the only pin."; exit 1; }
echo "## java $HAVE (pinned), teavm-javac at $TEAVM_JAVAC_COMMIT"

# ---- sources at the pinned SHA ---------------------------------------------
# Full clone: upstream publishes no tags, so an arbitrary SHA must stay reachable.
# 58 commits, so this is cheap.
if [ ! -d "$SRC" ]; then
  git clone "$TEAVM_JAVAC_REPO" "$SRC" > "$OUT/clone.log" 2>&1
fi
git -C "$SRC" checkout -q "$TEAVM_JAVAC_COMMIT" || { echo "REFUSE: no such commit $TEAVM_JAVAC_COMMIT"; exit 1; }
LANDED="$(git -C "$SRC" rev-parse HEAD)"
[ "$LANDED" = "$TEAVM_JAVAC_COMMIT" ] || { echo "REFUSE: asked for $TEAVM_JAVAC_COMMIT, landed on $LANDED"; exit 1; }

# ---- THE PATCH -- drop teavm.org from the repository list -------------------
python3 - "$SRC" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1]) / "settings.gradle"
src = p.read_text()
if "GX-BX8B: upstream maven mirror removed" in src:
    print("## repo patch: already applied"); raise SystemExit
# settings.gradle lists https://teavm.org/maven/repository FIRST, ahead of
# mavenCentral, in BOTH pluginManagement and dependencyResolutionManagement. So
# every build asks the server that 415s us before it asks Central -- for every
# plugin and every dependency, including third-party ones like jackson and
# commons that it does not even have.
#
# MEASURED (Bx-8b round 4): with teavm.org blackholed at the DNS level and the
# module cache wiped, a --refresh-dependencies build still succeeded and produced
# BYTE-IDENTICAL artifacts. teavm.org was FIRST, not NECESSARY: Central serves
# every artifact this build needs, including teavm 0.13.1, and the
# org.teavm.gradle.plugin marker. So this removes a redundant repository, it does
# not replace a source.
#
# The two occurrences differ in indentation (9 spaces vs 8), so match the line
# CONTENT and drop whole lines rather than anchoring on whitespace.
ANCHOR = 'maven { url = uri("https://teavm.org/maven/repository") }'
n = src.count(ANCHOR)
if n != 2:
    print("## REFUSE: expected the teavm.org repository line exactly 2x, found %d." % n)
    print("##   settings.gradle changed shape at this SHA. See docs/teavm-javac-self-built.md.")
    sys.exit(1)
lines = src.split("\n")
kept = [l for l in lines if ANCHOR not in l]
if len(lines) - len(kept) != 2:
    print("## REFUSE: removed %d lines, wanted 2" % (len(lines) - len(kept))); sys.exit(1)
out = "\n".join(kept)
MARK = ("// GX-BX8B: upstream maven mirror removed -- Maven Central serves every\n"
        "// artifact this build needs. Measured with the mirror DNS-blackholed and\n"
        "// the module cache wiped: byte-identical output. Deliberately worded\n"
        "// without naming the host, so the assert below stays absolute.\n")
out = MARK + out
if "teavm.org" in out:
    print("## REFUSE: settings.gradle still mentions teavm.org after the patch"); sys.exit(1)
p.write_text(out)
print("## repo patch: both teavm.org repository lines removed, none left")
PY

# ---- build ------------------------------------------------------------------
chmod +x "$SRC/gradlew"
T0=$(date +%s)
( cd "$SRC" && ./gradlew "$TEAVM_JAVAC_BUILD_TASK" --no-daemon --console=plain ) > "$OUT/build.log" 2>&1 \
  || { echo "REFUSE: $TEAVM_JAVAC_BUILD_TASK failed"; tail -30 "$OUT/build.log"; exit 1; }
T1=$(date +%s)

# The build must not have reached teavm.org at all. Measured zero, asserted here.
if grep -q "teavm\.org/maven" "$OUT/build.log"; then
  echo "REFUSE: the build still contacted teavm.org/maven -- the patch missed a path:"
  grep -o "https://teavm\.org/maven[^ )\"]*" "$OUT/build.log" | sort -u | head -5
  exit 1
fi

GEN="$SRC/compiler/build/generated/teavm/wasm-gc"
CL="$SRC/compiler/build/classlib"
cp "$GEN/compiler.wasm" "$GEN/compiler.wasm-runtime.js" "$OUT/"
cp "$CL/compile-classlib-teavm.bin" "$CL/runtime-classlib-teavm.bin" "$OUT/"

# Size proves the build emitted bytes. verify-java.mjs proves it compiles Java.
SZ=$(stat -c%s "$OUT/compiler.wasm")
test "$SZ" -gt 2000000 || { echo "REFUSE: compiler.wasm is $SZ bytes -- too small to be javac"; exit 1; }

printf '{"runtime":"java","source":"konsoletyper/teavm-javac","commit":"%s","jdk":"%s","teavm":"%s","jdk_revision":"%s","route":"built from pinned source at deploy","license":"GPL-2.0 WITH Classpath-exception-2.0 (OpenJDK javac) + Apache-2.0 (TeaVM)","compiler_bytes":%s,"build_seconds":%s}\n' \
  "$TEAVM_JAVAC_COMMIT" "$TEAVM_JAVAC_JDK" "$(sed -nE 's/^teavm = "(.*)"$/\1/p' "$SRC/gradle/libs.versions.toml")" \
  "$(sed -nE 's/^jdk\.revision=(.*)$/\1/p' "$SRC/gradle.properties")" "$SZ" "$((T1-T0))" > "$OUT/manifest.json"
rm -f "$OUT/clone.log" "$OUT/build.log"
echo "## teavm-javac built in $((T1-T0))s: compiler.wasm $SZ bytes"
sha256sum "$OUT"/compiler.wasm "$OUT"/compiler.wasm-runtime.js "$OUT"/compile-classlib-teavm.bin "$OUT"/runtime-classlib-teavm.bin
