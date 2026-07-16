// The control. If dart2js cannot turn THIS into runnable JS, nothing else in
// the spike log means anything -- so it runs before every speculative step.
// Deliberately trivial: this measures the toolchain, not Dart.
dynamic solve(Map<String, dynamic> c) {
  final n = c['n'] as int;
  var a = 0, b = 1;
  for (var i = 0; i < n; i++) {
    final t = a + b;
    a = b;
    b = t;
  }
  return a;
}

void main() {
  print('[KATA] hello ok solve(10)=${solve({'n': 10})}');
}
