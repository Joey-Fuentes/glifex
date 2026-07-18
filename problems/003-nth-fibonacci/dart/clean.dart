// The professional default: slide a two-value window up the sequence, keeping
// only the pair the next term needs. One pass, no table, no recursion --
// O(n) time and O(1) space.
dynamic solve(Map<String, dynamic> c) {
  final n = c['n'] as int;
  var a = 0, b = 1;
  for (var i = 0; i < n; i++) {
    final next = a + b;
    a = b;
    b = next;
  }
  return a;
}
