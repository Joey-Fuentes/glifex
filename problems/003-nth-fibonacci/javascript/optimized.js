// L1-fib-optimized: same O(n) window-slide as clean; unrolled 2x so the
// loop body advances two Fibonacci steps per iteration-counter check --
// mirrors the 8080 optimized.s's peel-odd-n + unrolled-pair trick, expressed
// in JS terms (a genuine constant-factor win, same complexity class --
// matches the manifest's declared O(n) for the optimized variant).
module.exports = function solve(c) {
  let a = 0, b = 1, i = c.n;
  if (i & 1) { const t = a + b; a = b; b = t; i--; }
  for (; i > 0; i -= 2) {
    const t = a + b;
    b = t + b;
    a = t;
  }
  return a;
};
