#!/data/data/com.termux/files/usr/bin/sh
# Copy to $HOME first -- ~/storage/downloads is noexec. chmod is done here
# because GitHub artifact zips drop the exec bit.
b=./hello-joe
chmod +x "$b" 2>/dev/null
out=$("$b" 2>&1); rc=$?
echo "$out" | head -2
echo "exit=$rc  $( [ "$rc" = "55" ] && echo 'WORKS (55 = loop kata)' || echo 'FAILED' )"
