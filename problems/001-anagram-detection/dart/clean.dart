dynamic solve(Map<String, dynamic> c) {
  final s = (c['s'] as String).split('')..sort();
  final t = (c['t'] as String).split('')..sort();
  return s.join() == t.join();
}
