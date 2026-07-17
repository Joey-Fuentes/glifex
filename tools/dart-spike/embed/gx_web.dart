// gx_web.dart -- GATE 2b. The real thing: the compiler, as JavaScript, with NO
// dart:io reachable at all, taking the platform dill from the JS host.
//
// In a browser these globals would be filled by fetch(); in node the driver
// (drive-web.cjs) fills them from fs before loading this script. Same shape.
import 'dart:js_interop';

import 'gx_core.dart';

@JS('gxGetDill')
external JSUint8Array _gxGetDill();

@JS('gxGetLibrariesSpec')
external JSString _gxGetLibrariesSpec();

@JS('gxDone')
external void _gxDone(JSString outJs);

const String _entry = 'org-dartlang-gx:///main.dart';

const String _src = '''
dynamic solve(Map<String, dynamic> c) {
  final n = c['n'] as int;
  var a = 0, b = 1;
  for (var i = 0; i < n; i++) { final t = a + b; a = b; b = t; }
  return a;
}
void main() { print('[KATA] gx ok solve(10)=' + solve({'n': 10}).toString()); }
''';

Future<void> main() async {
  // Spike 9's web gate printed two lines and exited 0: no result, no error, no
  // clue -- the worst report there is. An async main whose future nobody awaits
  // can drop its error on the floor, so main catches for itself and always says
  // how it ended.
  try {
    await _run();
    print('     [gx] main completed normally');
  } catch (e, st) {
    print('     [gx] main THREW: $e');
    print('     ' + st.toString().split('\n').take(6).join('\n     '));
  }
}

Future<void> _run() async {
  final dill = _gxGetDill().toDart;
  print('     dill       : ${dill.length} bytes (handed over by the JS host)');
  final spec = _gxGetLibrariesSpec().toDart;
  print('     libs spec  : ${spec.length} chars (handed over by the JS host)');

  final sw = Stopwatch()..start();
  final r = await gxCompile(
      sources: {_entry: _src}, dill: dill, entry: _entry, librariesSpec: spec);
  sw.stop();
  print('     wall       : ${sw.elapsedMilliseconds} ms');
  gxReport(r);
  if (r.outputs.isNotEmpty) {
    _gxDone(r.outputs.values.first.toJS);
  } else {
    print('     [gx] no outputs -- gxDone not called, so the driver will say so');
  }
}
