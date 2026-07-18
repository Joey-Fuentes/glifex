#!/usr/bin/env bash
# build-customasm.sh <out-dir>
# Builds customasm's browser wasm from pinned source (see pins.env for the full
# WHY) exactly as upstream's build_ghpages.yml does, and places the three files
# web/runtimes.js + web/retro-worker.js expect:
#   customasm.wasm  LICENSE-customasm  manifest.json
set -euo pipefail
OUT="${1:?usage: build-customasm.sh <out-dir>}"; mkdir -p "$OUT"
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/pins.env"

case "$CUSTOMASM_REPO" in *customasm*) : ;; *) echo "REFUSE: $CUSTOMASM_REPO is not customasm"; exit 1 ;; esac
[ -n "${CUSTOMASM_COMMIT:-}" ] || { echo "REFUSE: CUSTOMASM_COMMIT is blank -- the commit is the pin"; exit 1; }
command -v git >/dev/null || { echo "REFUSE: git not found"; exit 1; }
command -v rustup >/dev/null || { echo "REFUSE: rustup not found (GitHub ubuntu runners ship it)"; exit 1; }

# ---- pinned Rust + wasm target ---------------------------------------------
rustup toolchain install "$CUSTOMASM_RUST_VERSION" --profile minimal --target wasm32-unknown-unknown >/dev/null 2>&1 \
  || { echo "REFUSE: could not install Rust $CUSTOMASM_RUST_VERSION with wasm32-unknown-unknown"; exit 1; }
echo "## customasm $CUSTOMASM_TAG at $CUSTOMASM_COMMIT, Rust $CUSTOMASM_RUST_VERSION -> wasm32-unknown-unknown"

# ---- sources at the pinned commit ------------------------------------------
SRC="$HOME/customasm-src"
if [ ! -d "$SRC/.git" ]; then
  rm -rf "$SRC"
  git clone --depth 1 --branch "$CUSTOMASM_TAG" "$CUSTOMASM_REPO" "$SRC" > "$OUT/clone.log" 2>&1 \
    || { echo "REFUSE: clone of $CUSTOMASM_TAG failed"; tail -20 "$OUT/clone.log"; exit 1; }
fi
LANDED="$(git -C "$SRC" rev-parse HEAD)"
if [ "$LANDED" != "$CUSTOMASM_COMMIT" ]; then
  git -C "$SRC" fetch --depth 1 origin "$CUSTOMASM_COMMIT" > "$OUT/clone.log" 2>&1 || true
  git -C "$SRC" checkout -q "$CUSTOMASM_COMMIT" 2>/dev/null \
    || { echo "REFUSE: cannot reach commit $CUSTOMASM_COMMIT (asked $CUSTOMASM_TAG, landed $LANDED)"; exit 1; }
  LANDED="$(git -C "$SRC" rev-parse HEAD)"
fi
[ "$LANDED" = "$CUSTOMASM_COMMIT" ] || { echo "REFUSE: asked for $CUSTOMASM_COMMIT, landed on $LANDED"; exit 1; }

# ---- build (exactly as upstream build_ghpages.yml) -------------------------
T0=$(date +%s)
( cd "$SRC" && rustup run "$CUSTOMASM_RUST_VERSION" cargo build --lib --target wasm32-unknown-unknown --release ) > "$OUT/build.log" 2>&1 \
  || { echo "REFUSE: cargo build failed"; tail -30 "$OUT/build.log"; exit 1; }
T1=$(date +%s)
WASM="$SRC/target/wasm32-unknown-unknown/release/customasm.wasm"
[ -f "$WASM" ] || { echo "REFUSE: expected $WASM (crate lib name or crate-type changed?)"; exit 1; }

# ---- verify it is a wasm module (functional export check is verify-customasm.mjs) ----
MAGIC="$(head -c 4 "$WASM" | od -An -tx1 | tr -d ' \n')"
[ "$MAGIC" = "0061736d" ] || { echo "REFUSE: $WASM is not a wasm module (magic=$MAGIC)"; exit 1; }

# ---- place artifacts --------------------------------------------------------
cp "$WASM" "$OUT/customasm.wasm"
if   [ -f "$SRC/LICENSE" ];     then cp "$SRC/LICENSE" "$OUT/LICENSE-customasm"
elif [ -f "$SRC/LICENSE.txt" ]; then cp "$SRC/LICENSE.txt" "$OUT/LICENSE-customasm"
elif [ -f "$SRC/LICENSE.md" ];  then cp "$SRC/LICENSE.md" "$OUT/LICENSE-customasm"
else echo "REFUSE: no LICENSE in customasm source at $CUSTOMASM_COMMIT"; exit 1; fi

SZ=$(stat -c%s "$OUT/customasm.wasm")
test "$SZ" -gt 100000 || { echo "REFUSE: customasm.wasm is $SZ bytes -- too small to be the assembler"; exit 1; }
SHA="$(sha256sum "$OUT/customasm.wasm" | cut -d' ' -f1)"
printf '{"runtime":"asm-6502","source":"hlorenzi/customasm","tag":"%s","commit":"%s","rust":"%s","route":"built from pinned source at deploy (cargo build --lib --target wasm32-unknown-unknown --release)","license":"Apache-2.0 (customasm)","wasm_bytes":%s,"wasm_sha256":"%s","build_seconds":%s}\n' \
  "$CUSTOMASM_TAG" "$CUSTOMASM_COMMIT" "$CUSTOMASM_RUST_VERSION" "$SZ" "$SHA" "$((T1-T0))" > "$OUT/manifest.json"
rm -f "$OUT/clone.log" "$OUT/build.log"
echo "## customasm.wasm built in $((T1-T0))s: $SZ bytes, sha256 $SHA"
