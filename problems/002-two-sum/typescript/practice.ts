export function solve(c: any): number[] | null {
  const seen: Record<number, number> = {};
  for (let i = 0; i < c.nums.length; i++) {
    const need = c.target - c.nums[i];
    if (need in seen) return [seen[need], i];
    seen[c.nums[i]] = i;
  }
  return null;
}
