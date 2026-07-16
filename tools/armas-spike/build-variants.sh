#!/usr/bin/env bash
# build-variants.sh <out-dir>
#
# The Blink run finally spoke:
#   $ /assembler /assembly.s -o /program.o
#   warning: unsupported syscall: __syscall_mprotect   (x forever, 120s timeout)
#
# blinkenlib is Blink built with emscripten; __syscall_mprotect is emscripten's
# shim name, so Blink forwards the guest's mprotect to a host that has none.
# Our as is static GLIBC, and glibc leans on mprotect hard -- RELRO at startup,
# and (matching the repetition) malloc arena growth, which mprotects pages out
# of a PROT_NONE reservation as the heap expands.
#
# So the LIBC is the variable, and v1 picked it by accident. Build the
# candidates; the phone-style variant matrix has out-earned every single guess
# I have made this session.
#
#   A glibc-static           control -- expected to reproduce the mprotect flood
#   B glibc-static-norelro   kills the startup mprotect (probably not malloc's)
#   C musl-static            musl malloc uses mmap/brk directly, no arena mprotect
set -uo pipefail

OUT="${1:?}"; mkdir -p "$OUT"
VER=2.43
CFG="--target=aarch64-linux-gnu --disable-nls --disable-werror --disable-plugins
     --disable-gdb --disable-gdbserver --disable-sim --disable-readline
     --disable-shared --enable-static"

cd "$HOME"
curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors \
  "https://ftp.gnu.org/gnu/binutils/binutils-$VER.tar.xz" -o "binutils-$VER.tar.xz"
tar xf "binutils-$VER.tar.xz"

has_interp() { readelf -l "$1" 2>/dev/null | grep -qw INTERP; }

emit() { # tree, name, ldflags
  local tree="$1" name="$2" flags="$3"
  cd "$tree" || return 1
  rm -f gas/as-new ld/ld-new
  if make -j"$(nproc)" all-gas all-ld LDFLAGS="$flags" > "$OUT/relink-$name.log" 2>&1 && [ -f gas/as-new ]; then
    cp gas/as-new "$OUT/as-$name.elf"; cp ld/ld-new "$OUT/ld-$name.elf" 2>/dev/null || true
    chmod +x "$OUT/as-$name.elf" 2>/dev/null
    strip --strip-all "$OUT/as-$name.elf" 2>/dev/null || true
    strip --strip-all "$OUT/ld-$name.elf" 2>/dev/null || true
    if has_interp "$OUT/as-$name.elf"; then echo "## $name  BUILT but DYNAMIC -- unusable"; else
      echo "## $name  BUILT static  $(stat -c%s "$OUT/as-$name.elf") bytes"; fi
  else
    echo "## $name  BUILD FAILED"; grep -i "error" "$OUT/relink-$name.log" | head -3 | sed 's/^/     /'
  fi
}

# ---------------- glibc tree
echo "## ================= glibc tree ================="
mkdir -p "$HOME/bu-glibc" && cd "$HOME/bu-glibc"
if "$HOME/binutils-$VER/configure" $CFG > "$OUT/cfg-glibc.log" 2>&1 \
   && make -j"$(nproc)" all-gas all-ld > "$OUT/make-glibc.log" 2>&1; then
  emit "$HOME/bu-glibc" glibc-static          "-static"
  emit "$HOME/bu-glibc" glibc-static-norelro  "-static -Wl,-z,norelro"
else
  echo "## glibc tree FAILED"; tail -20 "$OUT/make-glibc.log"
fi

# ---------------- musl tree
echo
echo "## ================= musl tree ================="
if command -v musl-gcc >/dev/null 2>&1; then
  mkdir -p "$HOME/bu-musl" && cd "$HOME/bu-musl"
  if "$HOME/binutils-$VER/configure" $CFG CC=musl-gcc > "$OUT/cfg-musl.log" 2>&1 \
     && make -j"$(nproc)" all-gas all-ld > "$OUT/make-musl.log" 2>&1; then
    emit "$HOME/bu-musl" musl-static "-static"
  else
    echo "## musl tree FAILED (binutils+musl is not always smooth)"
    grep -i "error" "$OUT/make-musl.log" | head -5 | sed 's/^/     /'
  fi
else
  echo "## musl-gcc absent"
fi

echo
echo "## ================= what we produced ================="
ls -la "$OUT"/as-*.elf 2>/dev/null | awk '{print "  ", $5, $9}' || echo "  (none)"
