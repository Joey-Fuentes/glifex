// Fast doubling: compute fib(n) in O(log n) steps instead of clean's O(n), using
//   fib(2k)   = fib(k) * (2*fib(k+1) - fib(k))
//   fib(2k+1) = fib(k)^2 + fib(k+1)^2
// Recurse on the bits of n from the top down, carrying the pair (fib(k),
// fib(k+1)) and doubling the index at each bit, adding one more step when the
// bit is set. Genuinely the best here -- logarithmic time, O(1) space (the
// recursion is bounded by the bit-length of n) -- at the cost of being far less
// obvious than the window slide. O(log n) time, O(1) space.
List<int> _fd(int n) {
  if (n == 0) return [0, 1];
  final p = _fd(n >> 1);
  final a = p[0], b = p[1];
  final c = a * (2 * b - a);
  final d = a * a + b * b;
  return (n & 1) == 0 ? [c, d] : [d, c + d];
}

dynamic solve(Map<String, dynamic> c) {
  final n = c['n'] as int;
  return _fd(n)[0];
}
