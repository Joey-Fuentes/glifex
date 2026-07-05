export function solve(c: { nums: number[]; target: number }): number[] {
  const seen = new Map<number, number>();
  for (let i = 0; i < c.nums.length; i++) {
    const need = c.target - c.nums[i];
    if (seen.has(need)) return [seen.get(need)!, i];
    seen.set(c.nums[i], i);
  }
  return [];
}
