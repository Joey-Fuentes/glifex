#!/data/data/com.termux/files/usr/bin/sh
# Run every variant on the Pixel and report. Copy this WITH the binaries to
# $HOME first -- ~/storage/downloads is mounted noexec.
echo "== hello-joe variants on $(uname -m) =="
for v in exec staticpie staticpie-phdr dynpie staticpie-phdr-4k; do
  b="./hello-joe-$v"
  [ -f "$b" ] || continue
  chmod +x "$b" 2>/dev/null
  echo
  echo "---- $v"
  out=$("$b" 2>&1); rc=$?
  echo "$out" | head -2
  echo "  exit=$rc  $( [ "$rc" = "55" ] && echo 'WORKS (55 = loop kata)' || echo 'failed' )"
done
echo
echo "== done -- paste this whole output back =="
