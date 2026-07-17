#!/usr/bin/env bash
# Build the Go browser payload: the gc toolchain compiled for wasip1/wasm, plus
# the std export-data closure of tools/go-vendor-imports.txt.
#
# There is no release to download. Unlike Rust (rubri) or C (wasmer), Go's
# payload does not exist anywhere as an artifact -- it must be BUILT. This is the
# arm64/riscv64 "pinned sources at deploy" shape, not the "fetch someone's
# artifact" shape.
#
# Why the toolchain and not the go command: cmd/go builds by FORKING compile and
# link, and os/exec does not work under wasip1. JS orchestrates instead. See
# docs/go-self-hosted.md section 3.
set -euo pipefail

OUT="${1:?usage: go-vendor.sh <outdir> [imports-file]}"
IMPORTS="${2:-tools/go-vendor-imports.txt}"

test -f "${IMPORTS}" || { echo "go-vendor: no imports file at ${IMPORTS}"; exit 1; }
command -v go >/dev/null || { echo "go-vendor: no go toolchain on PATH"; exit 1; }

mkdir -p "${OUT}/bin" "${OUT}/pkg"
# Absolute from here down. Both callers pass a RELATIVE path -- pages.yml and
# ci.yml each say "bash tools/go-vendor.sh web/vendor/go" -- and a relative path
# concatenated into a file:// URL makes node read its first segment as the URL
# HOST: ERR_INVALID_FILE_URL_HOST, which is exactly how this failed in e2e.
# Canonicalise once, here, rather than remembering at every use site.
OUT="$(cd "${OUT}" && pwd)"
GOVER="$(go env GOVERSION)"
echo "go-vendor: ${GOVER} -> ${OUT}"

# --- the toolchain, built for the browser's arch.
# Host arch == target arch (both wasm), so no cross-compilation trick: the
# compiler reads GOOS/GOARCH from the environment at RUNTIME to pick its target.
for t in compile link; do
  if ! GOOS=wasip1 GOARCH=wasm go build -o "${OUT}/bin/${t}.wasm" "cmd/${t}"; then
    ( cd "$(go env GOROOT)/src/cmd/${t}" && GOOS=wasip1 GOARCH=wasm go build -o "${OUT}/bin/${t}.wasm" . )
  fi
done

# --- the std export-data closure of the allowlist, transitively.
# -e so one unbuildable package cannot take the whole vendor step down; the
# count of packages without export data is reported rather than swallowed.
PKGS="$(grep -v -E '^\s*(#|$)' "${IMPORTS}" | tr '\n' ' ')"
test -n "${PKGS}" || { echo "go-vendor: imports file lists no packages"; exit 1; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/go-vendor.XXXXXX")"
trap 'rm -rf "${TMP}"' EXIT

# shellcheck disable=SC2086
GOOS=wasip1 GOARCH=wasm go list -e -deps -export \
  -f '{{if .Export}}{{.ImportPath}} {{.Export}}{{end}}' ${PKGS} > "${TMP}/deps.txt"

: > "${OUT}/importcfg.txt"
N=0
TOTAL=0
while read -r ip ex; do
  [ -n "${ex:-}" ] || continue
  safe="$(printf '%s' "${ip}" | tr '/' '_')"
  cp "${ex}" "${OUT}/pkg/${safe}.a"
  TOTAL=$(( TOTAL + $(stat -c%s "${OUT}/pkg/${safe}.a") ))
  N=$(( N + 1 ))
  # Absolute guest paths: the worker preopens the payload root as "/", so
  # nothing depends on the compiler's cwd. A relative path here is what made
  # spike run 1 die with EBADF (docs/go-self-hosted.md section 6).
  echo "packagefile ${ip}=/pkg/${safe}.a" >> "${OUT}/importcfg.txt"
done < "${TMP}/deps.txt"

# --- the WASI shim, sliced out of the committed Rust worker bundle.
# web/rust-worker.js is an unminified esbuild bundle whose module comments are
# intact; everything before the rust-worker.ts marker is rustbuild/wasi/*, which
# is self-contained and references no worker globals. Slicing beats re-cloning
# rubri: no network, no second pinned ref, no second source of truth for a shim
# that is already shipping and already proven to drive this exact toolchain.
node - "$(pwd)/web/rust-worker.js" "${OUT}/wasi-shim.mjs" <<'NODE_EOF'
import { readFileSync, writeFileSync } from "node:fs";
const [src, dst] = process.argv.slice(2);
const s = readFileSync(src, "utf8");
const MARK = "\n// rustbuild/rust-worker.ts\n";
const i = s.indexOf(MARK);
if (i < 0) {
  console.error("go-vendor: no rust-worker.ts marker in " + src + ".");
  console.error("go-vendor: the bundle was re-emitted in a shape this slice does not know.");
  process.exit(1);
}
const shim = s.slice(0, i) +
  "\nexport { WASI, Fd, Inode, OpenFile, PreopenDirectory, File, Directory };\n";
if (/\bself\.|addEventListener|postMessage/.test(shim)) {
  console.error("go-vendor: the sliced shim references worker globals -- the split moved.");
  process.exit(1);
}
writeFileSync(dst, shim);
console.log("go-vendor: shim sliced, " + shim.length + " bytes");
NODE_EOF

# It must actually import, and export what the worker will destructure. A shim
# that merely got written is not a shim that works.
node --input-type=module -e "
  const { pathToFileURL } = await import('node:url');
  const m = await import(pathToFileURL('${OUT}/wasi-shim.mjs').href);
  const need = ['WASI','Fd','Inode','OpenFile','PreopenDirectory','File','Directory'];
  const missing = need.filter((n) => !(n in m));
  if (missing.length) { console.error('go-vendor: shim missing exports: ' + missing); process.exit(1); }
  // The trap: WASI(args, env, fds, options = {}) calls debug.enable(options.debug),
  // and enable() reads 'enabled === void 0 ? true : enabled'. Omitting options
  // turns logging ON. Prove { debug: false } silences it, because B3b depends on it.
  const orig = console.log; let noise = 0; console.log = () => { noise++; };
  new m.WASI([], [], [], { debug: false });
  console.log = orig;
  if (noise) { console.error('go-vendor: shim logs even with debug:false'); process.exit(1); }
  console.log('go-vendor: shim imports, exports ' + need.length + ' names, silent with debug:false');
"

CSZ="$(stat -c%s "${OUT}/bin/compile.wasm")"
LSZ="$(stat -c%s "${OUT}/bin/link.wasm")"

cat > "${OUT}/manifest.json" <<EOM
{"runtime":"go","via":"gc self-hosted to wasip1/wasm","go":"${GOVER}","packages":${N},"pkgBytes":${TOTAL},"toolchainBytes":$(( CSZ + LSZ ))}
EOM

echo "go-vendor: toolchain compile=${CSZ} link=${LSZ}"
echo "go-vendor: export data ${N} packages, ${TOTAL} bytes"
echo "go-vendor: payload total $(( CSZ + LSZ + TOTAL )) bytes"

# --- asserts. A payload that is silently too small is the failure mode that
# faked a green run for hours on the last vendor track.
test "${CSZ}" -gt 20000000 || { echo "go-vendor: compile.wasm too small (${CSZ})"; exit 1; }
test "${LSZ}" -gt  5000000 || { echo "go-vendor: link.wasm too small (${LSZ})"; exit 1; }
test "${N}"   -gt 60       || { echo "go-vendor: only ${N} packages -- closure collapsed"; exit 1; }
for must in fmt sort encoding_json container_heap reflect strings; do
  test -s "${OUT}/pkg/${must}.a" || { echo "go-vendor: ${must}.a missing from payload"; exit 1; }
done
echo "go-vendor: OK"
