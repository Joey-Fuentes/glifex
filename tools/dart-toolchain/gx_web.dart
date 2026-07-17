// gx_web.dart -- the browser entrypoint. dart2js compiles THIS to gx_web.js,
// and gx_web.js is the Dart compiler.
//
// The host fills three globals before loading: gxGetDill and gxGetLibrariesSpec
// hand over the platform as bytes (one fetch() each), and gxCompileDart is what
// the worker calls with a source string. Nothing here touches a filesystem.
//
// In a browser, self IS the global, so dart2js's async scheduler initialises and
// no shim is needed. Under bare node CommonJS there is no self, the scheduler
// never initialises, and the first await never resumes -- sync code runs, then
// silence. That cost sixteen rounds; see docs/dart2js-self-hosted.md section 7.
import 'dart:js_interop';

import 'gx_core.dart';

@JS('gxGetDill')
external JSUint8Array _gxGetDill();

@JS('gxGetLibrariesSpec')
external JSString _gxGetLibrariesSpec();

@JS('gxCompileDart')
external set _gxCompileDart(JSFunction f);

@JS('gxReady')
external void _gxReady();

const String _entry = 'org-dartlang-gx:///main.dart';

/// Compile [source] to JavaScript. Returns the JS, or throws with the
/// compiler's own diagnostics -- which are the thing a learner needs to read.
Future<String> _compile(String source) async {
  final r = await gxCompile(
    sources: {_entry: source},
    dill: _gxGetDill().toDart,
    entry: _entry,
    librariesSpec: _gxGetLibrariesSpec().toDart,
  );
  if (!r.ok || r.outputs.isEmpty) {
    final why = r.diagnostics.isEmpty
        ? (r.crash ?? 'compilation failed with no diagnostic')
        : r.diagnostics.join('\n');
    throw StateError(why);
  }
  return r.outputs.values.first;
}

// Future<String> has no .toJS -- dart:js_interop's FutureOfJSAnyToJSPromise is
// constrained to T extends JSAny?, and String is not one. Map to JSString first,
// or this does not compile. Spelled out as a named function rather than a
// closure so the types are visible and the error, if any, names this line.
JSPromise<JSString> _compileForJs(JSString source) =>
    _compile(source.toDart).then((String js) => js.toJS).toJS;

void main() {
  _gxCompileDart = _compileForJs.toJS;
  _gxReady();
}
