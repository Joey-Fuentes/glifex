// Obvious approach: try every pair until one sums to the target. The first thing
// anyone writes, and the O(n^2) baseline that clean's single-pass map exists to
// beat. Allocates nothing, so O(1) space.
dynamic solve(Map<String, dynamic> c) {
  final nums = (c['nums'] as List).cast<num>();
  final target = c['target'] as num;
  for (var i = 0; i < nums.length; i++) {
    for (var j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] == target) return [i, j];
    }
  }
  return [];
}
