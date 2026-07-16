#!/usr/bin/env bash
# Gate 4a -- THE GATE.
# compile + link + run, entirely inside WASI. No cmd/go. No os/exec. No native
# toolchain. If this is green, the browser is a shim problem rather than a
# feasibility problem, and Bx-6 already proved the shim.
set -euo pipefail
OUT="${1:?usage: gate.sh <outdir>}"
cd "${OUT}"

WT_ENV="--env GOOS=wasip1 --env GOARCH=wasm --env GOROOT=/goroot --env HOME=/"

echo "## ---- 4a-i: hello world -- does the self-hosted toolchain produce a RUNNING wasm ----"
set -x
time wasmtime run --dir . ${WT_ENV} bin/compile.wasm \
  -o work/hello.a -p main -importcfg work/importcfg.txt -pack work/hello/hello.go
set +x

cp work/importcfg.txt work/importcfg.hello
echo "packagefile main=work/hello.a" >> work/importcfg.hello

set -x
time wasmtime run --dir . ${WT_ENV} bin/link.wasm \
  -o work/hello.wasm -importcfg work/importcfg.hello -buildmode=exe work/hello.a
set +x

echo "## running the OUTPUT of the wasm-hosted toolchain:"
wasmtime run work/hello.wasm | sed 's/^/##   /'

echo "## ---- 4a-ii: the REAL glifex harness -- multi-file package, encoding/json, reflect ----"
# The harness reads ../test_cases.json, so it runs with cwd=work/kata and the
# json one level up. If WASI path resolution fights that, it is NOT load-bearing
# for the track: a browser worker synthesises its own virtual FS and can place
# the file anywhere (Rust embeds the cases in the source outright). Recorded
# because the failure mode is worth knowing, not because it decides anything.
set -x
time wasmtime run --dir . ${WT_ENV} bin/compile.wasm \
  -o work/main.a -p main -importcfg work/importcfg.txt -pack \
  work/kata/main.go work/kata/practice.go work/kata/variants.go
set +x

cp work/importcfg.txt work/importcfg.link
echo "packagefile main=work/main.a" >> work/importcfg.link

set -x
time wasmtime run --dir . ${WT_ENV} bin/link.wasm \
  -o work/out.wasm -importcfg work/importcfg.link -buildmode=exe work/main.a
set +x

ls -la work/out.wasm | awk '{print "##   linked output: " $5 " bytes"}'

echo "## running it -- clean should print 5/5 passed (or however many cases 001 has):"
( cd work && wasmtime run --dir . --env PWD=./kata out.wasm clean ) 2>&1 | sed 's/^/##   /' || \
  echo "##   ^^ if this is a path/preopen complaint, see the note above: not load-bearing."
