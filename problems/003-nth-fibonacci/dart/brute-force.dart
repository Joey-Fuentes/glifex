// _fibRec is the recurrence transcribed literally: fib(n) = fib(n-1) + fib(n-2).
// It recomputes the same subproblems exponentially many times -- fib(n-2) is
// evaluated once for fib(n) and again inside fib(n-1) -- which is exactly what
// clean's single pass exists to avoid. O(phi^n) time; the call stack reaches
// depth n, so O(n) space.
int _fibRec(int n) => n < 2 ? n : _fibRec(n - 1) + _fibRec(n - 2);

dynamic solve(Map<String, dynamic> c) {
  final n = c['n'] as int;
  return _fibRec(n);
}
