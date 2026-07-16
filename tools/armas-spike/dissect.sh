#!/usr/bin/env bash
# dissect.sh <elf> <label>
# Identify what a Blink guest actually IS. The playground's gnu-as.elf is a
# KNOWN-GOOD Blink guest -- it runs under this exact blinkenlib in production.
# So stop theorising about libcs and read it.
set -uo pipefail
F="${1:?}"; L="${2:?}"
echo "======== $L"
test -f "$F" || { echo "  (missing)"; exit 0; }
echo "  size    $(stat -c%s "$F") bytes"
echo "  file    $(file -b "$F")"
echo "  e_type  $(readelf -h "$F" 2>/dev/null | grep -i '^ *Type:' | sed 's/^ *Type: *//')"
if readelf -l "$F" 2>/dev/null | grep -qw INTERP; then
  echo "  INTERP  $(readelf -l "$F" 2>/dev/null | grep -A1 INTERP | grep -o '/[^]]*' | head -1)"
else
  echo "  INTERP  none (static)"
fi
echo "  NEEDED  $(readelf -d "$F" 2>/dev/null | grep -c NEEDED || echo 0)"
echo "  RELRO   $(readelf -l "$F" 2>/dev/null | grep -c GNU_RELRO || echo 0)"
echo "  --- which libc? ---"
if strings -a "$F" | grep -qi "musl libc"; then echo "  libc    MUSL"; fi
if strings -a "$F" | grep -qi "GNU C Library\|glibc"; then echo "  libc    GLIBC"; fi
strings -a "$F" | grep -o "GNU C Library[^,]*" | head -1 | sed 's/^/  glibc-ver /'
strings -a "$F" | grep -o "musl libc[^ ]*" | head -1 | sed 's/^/  musl-ver  /'
readelf -p .comment "$F" 2>/dev/null | grep -o "GCC:[^]]*" | head -2 | sed 's/^/  comment   /'
echo "  --- does it even mention mprotect? ---"
echo "  mprotect strings: $(strings -a "$F" | grep -c mprotect || echo 0)"
