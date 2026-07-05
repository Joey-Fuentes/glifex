dynamic solve(Map<String, dynamic> c) {
  final s = c['s'] as String, t = c['t'] as String;
  if (s.length != t.length) return false;
  final count = <int, int>{};
  for (final u in s.codeUnits) count[u] = (count[u] ?? 0) + 1;
  for (final u in t.codeUnits) {
    final n = (count[u] ?? 0) - 1;
    if (n < 0) return false;
    count[u] = n;
  }
  return true;
}
