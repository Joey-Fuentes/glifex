#!/usr/bin/env bash
# build-binutils.sh <out-dir>
#
# Builds a STATIC, amd64-host, aarch64-TARGET gas + ld.
#
# The trick, stated plainly because it is the whole point: Blink emulates
# x86-64. So the assembler must be an x86-64 binary. But it must EMIT aarch64.
# Binutils fixes its target at BUILD time, hence --target=aarch64-linux-gnu on
# an amd64 host. Bx-7 vendors an x86-64-TARGETING as from the playground; that
# binary cannot help us, so we build our own.
#
# STATIC because Blink-in-a-tab has no dynamic loader or libc to satisfy.
# Debian's binutils-aarch64-linux-gnu is dynamically linked (the job prints
# proof), which is why we cannot just unpack a .deb.
set -euo pipefail

OUT="${1:?usage: build-binutils.sh <out-dir>}"
mkdir -p "$OUT"

VER=2.43
TARBALL="binutils-$VER.tar.xz"
URL="https://ftp.gnu.org/gnu/binutils/$TARBALL"

cd "$HOME"
echo "## fetching $URL"
curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors "$URL" -o "$TARBALL"
echo "## sha256 $(sha256sum "$TARBALL" | cut -d' ' -f1)"
tar xf "$TARBALL"

mkdir -p "$HOME/bu-build"
cd "$HOME/bu-build"

echo "## configuring (static, aarch64 target, amd64 host)"
"$HOME/binutils-$VER/configure" \
  --target=aarch64-linux-gnu \
  --disable-nls \
  --disable-werror \
  --disable-plugins \
  --disable-gdb \
  --disable-gdbserver \
  --disable-sim \
  --disable-readline \
  --disable-shared \
  --enable-static \
  LDFLAGS="-static" \
  > "$OUT/configure.log" 2>&1 || { echo "## CONFIGURE FAILED"; tail -40 "$OUT/configure.log"; exit 1; }

echo "## building gas + ld"
if ! make -j"$(nproc)" all-gas all-ld > "$OUT/make.log" 2>&1; then
  echo "## MAKE FAILED -- last 60 lines"
  tail -60 "$OUT/make.log"
  exit 1
fi

AS_BIN="$HOME/bu-build/gas/as-new"
LD_BIN="$HOME/bu-build/ld/ld-new"

for b in "$AS_BIN" "$LD_BIN"; do
  test -f "$b" || { echo "## MISSING $b"; exit 1; }
done

cp "$AS_BIN" "$OUT/aarch64-as.elf"
cp "$LD_BIN" "$OUT/aarch64-ld.elf"
chmod +x "$OUT/aarch64-as.elf" "$OUT/aarch64-ld.elf"

# Run 1 shipped these UNSTRIPPED: 11.6 MB + 12.4 MB = 24 MB, which is absurd next
# to the 2 MB VIXL emulator. Static + unstripped is worst case. Strip with the
# HOST strip -- these are x86-64 binaries, so NOT aarch64-linux-gnu-strip.
echo
echo "## ---- stripping (run 1 forgot to) ----"
for f in "$OUT/aarch64-as.elf" "$OUT/aarch64-ld.elf"; do
  BEFORE=$(stat -c%s "$f")
  strip --strip-all "$f" 2>/dev/null || echo "  strip failed on $(basename "$f")"
  AFTER=$(stat -c%s "$f")
  GZ=$(gzip -c "$f" | wc -c)
  echo "  $(basename "$f")  $BEFORE -> $AFTER bytes  (gz $GZ)"
done

echo
echo "## ================= THE DECISIVE FACTS ================="
for b in "$OUT/aarch64-as.elf" "$OUT/aarch64-ld.elf"; do
  echo "---- $(basename "$b")"
  echo "  size   $(stat -c%s "$b") bytes"
  echo "  file   $(file -b "$b")"
  # Must be x86-64 (Blink is an x86-64 emulator) and statically linked.
  if file -b "$b" | grep -q "x86-64"; then echo "  host   OK x86-64 (Blink can run it)"; else echo "  host   WRONG -- Blink cannot run this"; fi
  if file -b "$b" | grep -q "statically linked"; then echo "  link   OK static"; else echo "  link   DYNAMIC -- Blink has no loader/libc"; fi
done
echo "## target check -- must emit aarch64"
"$OUT/aarch64-as.elf" --version | head -1
"$OUT/aarch64-as.elf" --help 2>&1 | grep -i "target\|aarch64" | head -3 || true
