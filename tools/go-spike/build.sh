#!/usr/bin/env bash
# Gate 1 + Gate 3.
#  1. Build cmd/compile and cmd/link FOR wasip1/wasm (the self-hosting claim).
#  3. Gather the std export-data closure the REAL glifex Go harness needs, and
#     measure it. Measured, not guessed -- the Rust track's hardest-won lesson.
set -euo pipefail
OUT="${1:?usage: build.sh <outdir>}"
mkdir -p "${OUT}/bin" "${OUT}/pkg" "${OUT}/work/kata" "${OUT}/work/hello"

echo "## ---- Gate 1: does the gc toolchain build itself for wasip1/wasm ----"
for t in compile link; do
  echo "## building cmd/${t} for wasip1/wasm"
  if ! GOOS=wasip1 GOARCH=wasm go build -o "${OUT}/bin/${t}.wasm" "cmd/${t}" 2>&1 | sed 's/^/##     /'; then
    echo "##   direct build failed; retrying from GOROOT/src/cmd/${t}"
    ( cd "$(go env GOROOT)/src/cmd/${t}" && GOOS=wasip1 GOARCH=wasm go build -o "${OUT}/bin/${t}.wasm" . )
  fi
  ls -la "${OUT}/bin/${t}.wasm" | awk '{print "##   built " $9 " -- " $5 " bytes"}'
done

echo "## ---- Gate 3: the export-data closure for the REAL harness ----"
# The kata is the ACTUAL glifex Go contract, copied from the repo so it cannot
# drift: the real main.go template (encoding/json, fmt, os, reflect) plus a
# practice/clean/optimized trio, because main.go dispatches on all three. It is
# also, deliberately, a MULTI-FILE package -- exactly what a browser worker would
# hand the compiler. Measuring the closure on a hello world gives a number that
# is a lie.
cp languages/templates/main.go             "${OUT}/work/kata/main.go"
cp tools/go-spike/katas/practice.go        "${OUT}/work/kata/practice.go"
cp tools/go-spike/katas/variants.go        "${OUT}/work/kata/variants.go"
cp tools/go-spike/katas/hello.go           "${OUT}/work/hello/hello.go"
cp problems/001-anagram-detection/test_cases.json "${OUT}/work/test_cases.json"

for d in kata hello; do
  cat > "${OUT}/work/${d}/go.mod" <<EOM
module glifexspike${d}

go 1.25
EOM
done

# -export builds each dep for the target and reports the .a the compiler wants.
# Filter out the kata's own package: a package must not import itself.
( cd "${OUT}/work/kata" && \
  GOOS=wasip1 GOARCH=wasm go list -deps -export \
    -f '{{if and .Export (ne .ImportPath "glifexspikekata")}}{{.ImportPath}} {{.Export}}{{end}}' . ) \
  > "${OUT}/work/deps.txt"

# ABSOLUTE guest paths (/pkg/x.a). The guest root is preopened as "/", so
# nothing here depends on the compiler's cwd. Verified against the real
# compile.wasm in the sandbox: a bogus path comes back echoed verbatim, which is
# how we know the file is genuinely read rather than defaulted.
: > "${OUT}/work/importcfg.txt"
N=0
TOTAL=0
while read -r ip ex; do
  [ -n "${ex:-}" ] || continue
  safe="$(printf '%s' "${ip}" | tr '/' '_')"
  cp "${ex}" "${OUT}/pkg/${safe}.a"
  sz="$(stat -c%s "${OUT}/pkg/${safe}.a")"
  TOTAL=$(( TOTAL + sz ))
  N=$(( N + 1 ))
  echo "packagefile ${ip}=/pkg/${safe}.a" >> "${OUT}/work/importcfg.txt"
done < "${OUT}/work/deps.txt"

# The linker needs the same closure plus the package being linked.
cp "${OUT}/work/importcfg.txt" "${OUT}/work/importcfg.hello"
echo "packagefile main=/work/hello.a" >> "${OUT}/work/importcfg.hello"
cp "${OUT}/work/importcfg.txt" "${OUT}/work/importcfg.link"
echo "packagefile main=/work/main.a" >> "${OUT}/work/importcfg.link"

BINSZ=$(( $(stat -c%s "${OUT}/bin/compile.wasm") + $(stat -c%s "${OUT}/bin/link.wasm") ))
{
  echo "export-data closure for the glifex Go harness: ${N} packages, ${TOTAL} bytes"
  echo "toolchain (compile.wasm + link.wasm):          ${BINSZ} bytes"
  echo "would-be vendored total:                       $(( TOTAL + BINSZ )) bytes"
  echo "for scale, the Rust track vendors 122MB (miri.wasm + 23 sysroot rlibs)."
} > "${OUT}/pkg/closure.txt"
sed 's/^/##   /' "${OUT}/pkg/closure.txt"
