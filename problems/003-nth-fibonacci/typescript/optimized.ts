// Same O(n) window-slide as clean.ts; unrolled 2x so the loop body advances
// two Fibonacci steps per iteration-counter check -- mirrors the 8080
// optimized.s's peel-odd-n + unrolled-pair trick (see that file's comments
// for the full derivation), a genuine constant-factor win that stays in
// the manifest's declared O(n) class.
export function solve(c: { n: number }): number {
  let a = 0, b = 1, n = c.n;
  if (n & 1) { const t = a + b; a = b; b = t; n--; }
  for (; n > 0; n -= 2) {
    const t = a + b;
    b = t + b;
    a = t;
  }
  return a;
}
