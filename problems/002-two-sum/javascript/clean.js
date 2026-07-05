module.exports = function solve(c) {
  const seen = new Map();
  for (let i = 0; i < c.nums.length; i++) {
    const need = c.target - c.nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(c.nums[i], i);
  }
  return [];
};
