export function solve(c: { n: number }): number {
  let a = 0, b = 1;
  for (let i = 0; i < c.n; i++) { const t = a + b; a = b; b = t; }
  return a;
}
