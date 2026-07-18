// O(n) time is unbeatable for two-sum, so "optimized" is a constant-factor win
// over clean, not a complexity one. clean does two hash probes per element --
// containsKey, then [] to read the index. This does ONE: a single lookup whose
// null return means "absent", distinguished from a real index-0 hit by the null
// itself rather than a second probe. Readability takes the hit that null-vs-zero
// has to be reasoned about. O(n) time, O(n) space.
dynamic solve(Map<String, dynamic> c) {
  final nums = (c['nums'] as List).cast<num>();
  final target = c['target'] as num;
  final seen = <num, int>{};
  for (var i = 0; i < nums.length; i++) {
    final j = seen[target - nums[i]];
    if (j != null) return [j, i];
    seen[nums[i]] = i;
  }
  return [];
}
