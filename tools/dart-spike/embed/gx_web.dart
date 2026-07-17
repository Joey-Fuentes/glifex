// gx_web.dart -- GATE 2b. The compiler, as JavaScript, with NO dart:io
// reachable at all, taking the platform dill from the JS host.
//
// SPIKE 11'S SYMPTOM, and why this file is now full of instruments:
//   [verbose info]  Compiling org-dartlang-gx:///main.dart
//   GATE FAILED -- gxDone never fired
// It printed the compiler's FIRST diagnostic and then simply stopped. No throw
// (main catches and would have said), no completion marker (main prints one),
// no unhandled rejection (the driver listens). On the VM the very next line is
// "Kernel load complete", so it dies somewhere in kernel load -- silently.
//
// Stopping with no error and no result is the signature of the host giving up
// on the work, not of the work failing. So: one variable at a time.
//   - The driver now holds the event loop open. If that alone fixes it, node
//     was exiting on an empty loop and nothing was ever wrong with the compile.
//   - runZonedGuarded catches anything escaping the zone that my try/catch
//     cannot see.
//   - gxDump lets the host ask, from outside, how far the input reading got --
//     the request log has named every fault so far, and it can name this one
//     too if it is reachable from JS.
import 'dart:async';
import 'dart:js_interop';

import 'gx_core.dart';

@JS('gxGetDill')
external JSUint8Array _gxGetDill();

@JS('gxGetLibrariesSpec')
external JSString _gxGetLibrariesSpec();

@JS('gxDone')
external void _gxDone(JSString outJs);

@JS('gxDump')
external set _gxDump(JSFunction f);

@JS('gxMark')
external void _gxMark(JSString stage);

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

void main() {
  // Publish the input log to the host BEFORE compiling, so that even if this
  // isolate wanders off and never comes back, the driver can still ask what it
  // managed to read.
  _gxDump = (() => gxRequested.join('; ').toJS).toJS;

  runZonedGuarded(() async {
    try {
      await _run();
      print('     [gx] main completed normally');
    } catch (e, st) {
      print('     [gx] main THREW: $e');
      print('     ' + st.toString().split('\n').take(6).join('\n     '));
    }
  }, (Object e, StackTrace st) {
    print('     [gx] ESCAPED THE ZONE: $e');
    print('     ' + st.toString().split('\n').take(6).join('\n     '));
    print('     [gx] inputs read before that: ' + gxRequested.join('; '));
  });
}

Future<void> _run() async {
  _gxMark('start'.toJS);
  final dill = _gxGetDill().toDart;
  print('     dill       : ${dill.length} bytes (handed over by the JS host)');
  final spec = _gxGetLibrariesSpec().toDart;
  print('     libs spec  : ${spec.length} chars (handed over by the JS host)');

  _gxMark('compiling'.toJS);
  final sw = Stopwatch()..start();
  final r = await gxCompile(
      sources: {_entry: _src}, dill: dill, entry: _entry, librariesSpec: spec);
  sw.stop();
  _gxMark('compiled'.toJS);
  print('     wall       : ${sw.elapsedMilliseconds} ms');
  gxReport(r);
  if (r.outputs.isNotEmpty) {
    _gxDone(r.outputs.values.first.toJS);
  } else {
    print('     [gx] no outputs -- gxDone not called, so the driver will say so');
  }
}
