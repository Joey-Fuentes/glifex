# Same O(n) window-slide as clean.rb; unrolled 2x so the loop body advances
# two Fibonacci steps per iteration-counter check -- mirrors the 8080
# optimized.s's peel-odd-n + unrolled-pair trick (see that file's comments
# for the full derivation), a genuine constant-factor win that stays in
# the manifest's declared O(n) class.
def solve(c)
  n = c["n"]
  a, b = 0, 1
  if n.odd?
    a, b = b, a + b
    n -= 1
  end
  while n > 0
    t = a + b
    b = t + b
    a = t
    n -= 2
  end
  a
end
