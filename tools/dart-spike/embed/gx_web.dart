// gx_web.dart -- GATE 2b. The real thing: the compiler, in JS, with NO dart:io
// reachable at all, taking the platform dill from the JS host.
//
// In a browser this global would be filled by a fetch(); in node the driver
// (drive-web.cjs) fills it from fs before loading this script. Same shape.
import 'dart:js_interop';
import 'dart:typed_data';

import 'gx_core.dart';

@JS('gxGetDill')
external JSUint8Array _gxGetDill();

@JS('gxGetLibrariesSpec')
external JSString _gxGetLibrariesSpec();

@JS('gxDone')
external void _gxDone(JSString outJs);

Future<void> main() async {
  final dill = _gxGetDill().toDart;
  print('     dill       : ${dill.length} bytes (handed over by the JS host)');
  final spec = _gxGetLibrariesSpec().toDart;
  print('     libs spec  : ${spec.length} chars (handed over by the JS host)');

  const entry = 'org-dartlang-gx:///main.dart';
  const src = '''
dynamic solve(Map<String, dynamic> c) {
  final n = c['n'] as int;
  var a = 0, b = 1;
  for (var i = 0; i < n; i++) { final t = a + b; a = b; b = t; }
  return a;
}
void main() { print('[KATA] gx ok solve(10)=' + solve({'n': 10}).toString()); }
''';

  final sw = Stopwatch()..start();
  final r = await gxCompile(
      sources: {entry: src}, dill: dill, entry: entry, librariesSpec: spec);
  sw.stop();
  print('     wall       : ${sw.elapsedMilliseconds} ms');
  gxReport(r);
  if (r.outputs.isNotEmpty) _gxDone(r.outputs.values.first.toJS);
}
