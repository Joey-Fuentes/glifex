dynamic solve(Map<String, dynamic> c) {
  final nums = (c['nums'] as List).cast<num>();
  final target = c['target'] as num;
  final seen = <num, int>{};
  for (var i = 0; i < nums.length; i++) {
    final need = target - nums[i];
    if (seen.containsKey(need)) return [seen[need], i];
    seen[nums[i]] = i;
  }
  return [];
}
