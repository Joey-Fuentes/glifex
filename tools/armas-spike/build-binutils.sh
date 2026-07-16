#!/usr/bin/env bash
# build-binutils.sh <out-dir>
#
# v2. The v1 artifact was DYNAMIC:
#     PT_INTERP=/lib64/ld-linux-x86-64.so.2
# configure got LDFLAGS=-static and the link never saw it (make.log shows a bare
# "CCLD as-new"). That binary can NEVER run under Blink: blinkenlib's guest FS
# holds /assembler and /linker and nothing else -- no loader, no libc.
#
# v1's own guard printed "link DYNAMIC" and nobody read it. So v2 makes static a
# HARD FAILURE, checked semantically via program headers rather than by
# string-matching file(1)'s prose (which has already lied in both directions).
#
# Strategy: configure ONCE, build once, then RELINK gas/ld against candidate
# LDFLAGS until the result has no PT_INTERP. Relinking reuses objects, so each
# candidate costs seconds instead of a full rebuild.
set -uo pipefail

OUT="${1:?usage: build-binutils.sh <out-dir>}"
mkdir -p "$OUT"

VER=2.43
cd "$HOME"
echo "## fetching binutils $VER"
curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors \
  "https://ftp.gnu.org/gnu/binutils/binutils-$VER.tar.xz" -o "binutils-$VER.tar.xz"
echo "## sha256 $(sha256sum "binutils-$VER.tar.xz" | cut -d' ' -f1)"
tar xf "binutils-$VER.tar.xz"

mkdir -p "$HOME/bu-build"; cd "$HOME/bu-build"

echo "## configure (x86-64 host, aarch64 target)"
"$HOME/binutils-$VER/configure" \
  --target=aarch64-linux-gnu \
  --disable-nls --disable-werror --disable-plugins \
  --disable-gdb --disable-gdbserver --disable-sim --disable-readline \
  --disable-shared --enable-static \
  > "$OUT/configure.log" 2>&1 || { echo "## CONFIGURE FAILED"; tail -30 "$OUT/configure.log"; exit 1; }

echo "## initial build"
make -j"$(nproc)" all-gas all-ld > "$OUT/make.log" 2>&1 || { echo "## MAKE FAILED"; tail -40 "$OUT/make.log"; exit 1; }

# Semantic static check: no PT_INTERP == nothing to load us. Not file(1) prose.
has_interp() { readelf -l "$1" 2>/dev/null | grep -qw INTERP; }

WINNER=""
for V in "-static" "-all-static" "-static -no-pie" "-static-pie"; do
  echo
  echo "## ---- relink candidate LDFLAGS=\"$V\" ----"
  rm -f gas/as-new ld/ld-new
  if ! make -j"$(nproc)" all-gas all-ld LDFLAGS="$V" > "$OUT/relink.log" 2>&1; then
    echo "##   relink FAILED"; grep -i "error\|cannot find" "$OUT/relink.log" | head -3 | sed 's/^/     /'
    continue
  fi
  test -f gas/as-new || { echo "##   no as-new produced"; continue; }
  if has_interp gas/as-new; then
    echo "##   still DYNAMIC (PT_INTERP present) -- reject"
  else
    echo "##   STATIC (no PT_INTERP) -- accept"
    WINNER="$V"
    break
  fi
done

if [ -z "$WINNER" ]; then
  echo
  echo "## FATAL no LDFLAGS candidate produced a static as. Blink cannot use a"
  echo "## dynamic binary, so shipping one would waste another round trip."
  exit 1
fi

echo
echo "## WINNING LDFLAGS: $WINNER"
cp gas/as-new "$OUT/aarch64-as.elf"
cp ld/ld-new  "$OUT/aarch64-ld.elf"
chmod +x "$OUT/aarch64-as.elf" "$OUT/aarch64-ld.elf"

echo "## ---- strip ----"
for f in "$OUT/aarch64-as.elf" "$OUT/aarch64-ld.elf"; do
  B=$(stat -c%s "$f"); strip --strip-all "$f" 2>/dev/null || true; A=$(stat -c%s "$f")
  echo "  $(basename "$f")  $B -> $A bytes  (gz $(gzip -c "$f" | wc -c))"
done

echo
echo "## ================= HARD GATES ================="
FAIL=0
for f in "$OUT/aarch64-as.elf" "$OUT/aarch64-ld.elf"; do
  n=$(basename "$f")
  if has_interp "$f"; then echo "  $n  PT_INTERP PRESENT -- FAIL, Blink has no loader"; FAIL=1
  else echo "  $n  no PT_INTERP -- OK static"; fi
  if readelf -d "$f" 2>/dev/null | grep -q NEEDED; then echo "  $n  NEEDED entries -- FAIL"; FAIL=1
  else echo "  $n  no NEEDED -- OK"; fi
  file -b "$f" | sed "s/^/  $n  file: /"
done
"$OUT/aarch64-as.elf" --version | head -1
test "$FAIL" = "0" || { echo "## FATAL gates failed"; exit 1; }
echo "## VERDICT static, self-contained -- Blink can exec this"
