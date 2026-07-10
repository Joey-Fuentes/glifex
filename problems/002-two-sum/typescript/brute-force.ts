// Brute force: check every pair. The "obvious" first approach --
// O(n^2) time, O(1) space.
export function solve(c: { nums: number[]; target: number }): number[] {
  const nums = c.nums;
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === c.target) return [i, j];
    }
  }
  return [];
}
