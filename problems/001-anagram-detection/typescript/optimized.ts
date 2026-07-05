export function solve(c: any): boolean {
  if (c.s.length !== c.t.length) return false;
  const count: Record<string, number> = {};
  for (const ch of c.s) count[ch] = (count[ch] || 0) + 1;
  for (const ch of c.t) { if (!count[ch]) return false; count[ch]--; }
  return true;
}
