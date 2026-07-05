// Optimized: same O(n) hash-map approach as clean.ts, but a single
// Map.get() lookup per element instead of has()+get() -- same
// benchmarked win as optimized.js (see that file's comment).
export function solve(c: { nums: number[]; target: number }): number[] {
  const seen = new Map<number, number>();
  const nums = c.nums, n = nums.length;
  for (let i = 0; i < n; i++) {
    const need = c.target - nums[i];
    const idx = seen.get(need);
    if (idx !== undefined) return [idx, i];
    seen.set(nums[i], i);
  }
  return [];
}

