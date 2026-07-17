// gx_core.dart -- the embeddable core. NO dart:io. NO dart:js_interop.
//
// This file IS the thesis. If dart2js can compile this to JS, then a browser
// can run the Dart compiler, because everything the compiler reads and writes
// goes through the three interfaces below instead of a filesystem.
//
// Spike 1 established (by reading pkg/compiler/lib/compiler_api.dart at commit
// 0315596, and NOT by recalling it) that:
//   - compiler_api.dart imports only dart:async + dart:typed_data
//   - readFromUri is NON-generic and returns Future<Input<Uint8List>>
//   - utf8 inputs are documented as a ZERO-TERMINATED list of encoded bytes
// All three of those are things I would have gotten wrong from memory.

import 'dart:typed_data';

import 'package:compiler/compiler_api.dart' as api;
import 'package:compiler/src/commandline_options.dart' show Flags;
import 'package:compiler/src/options.dart' show CompilerOptions;

/// Every Uri the compiler asks us for, in order.
///
/// This is deliberately a first-class output of the spike, not debug noise. If
/// the gate fails, this list is the finding: it is the exact input set a
/// browser worker would have to serve, obtained by observation rather than by
/// reasoning about what a compiler "should" need.
final List<String> gxRequested = <String>[];
final List<String> gxMissing = <String>[];

class _Input implements api.Input<Uint8List> {
  @override
  final Uri uri;
  @override
  final api.InputKind inputKind;
  @override
  final Uint8List data;
  _Input(this.uri, this.inputKind, this.data);
  @override
  void release() {}
}

class _Provider implements api.CompilerInput {
  final Map<String, Uint8List> files;
  _Provider(this.files);

  @override
  Future<api.Input<Uint8List>> readFromUri(
    Uri uri, {
    api.InputKind inputKind = api.InputKind.utf8,
  }) async {
    gxRequested.add('$uri  [${inputKind.name}]');
    final d = files[uri.toString()];
    if (d == null) {
      gxMissing.add(uri.toString());
      throw Exception('gx: no input registered for $uri');
    }
    if (inputKind == api.InputKind.utf8) {
      // "Data is read as UTF8 either as a [String] or a zero-terminated
      // [List<int>]" -- compiler_api.dart. Hand back the zero terminator.
      final b = Uint8List(d.length + 1);
      b.setRange(0, d.length, d);
      return _Input(uri, inputKind, b);
    }
    return _Input(uri, inputKind, d);
  }

  @override
  void registerUtf8ContentsForDiagnostics(Uri uri, Uint8List source) {}
}

class _Sink implements api.OutputSink {
  final StringBuffer _buf = StringBuffer();
  final void Function(String) _onClose;
  _Sink(this._onClose);
  @override
  void add(String text) => _buf.write(text);
  @override
  void close() => _onClose(_buf.toString());
}

class _BinarySink implements api.BinaryOutputSink {
  final BytesBuilder _b = BytesBuilder();
  @override
  void add(List<int> buffer, [int start = 0, int? end]) {
    _b.add(buffer.sublist(start, end ?? buffer.length));
  }

  @override
  void close() {}
}

class _Output implements api.CompilerOutput {
  final Map<String, String> files = {};
  @override
  api.OutputSink createOutputSink(String name, String extension, api.OutputType type) {
    final key = name.isEmpty ? 'out.$extension' : '$name.$extension';
    return _Sink((s) => files[key] = s);
  }

  @override
  api.BinaryOutputSink createBinarySink(Uri uri) => _BinarySink();
}

class _Diagnostics implements api.CompilerDiagnostics {
  final List<String> messages = [];
  // Widened to dynamic on purpose: the real signature's first parameter is
  // Message? from package:compiler/src/diagnostics/messages.dart. Dart allows
  // widening a parameter type in an override, and this keeps the spike from
  // taking a dependency on an implementation-detail import.
  @override
  void report(dynamic code, Uri? uri, int? begin, int? end, String text, api.Diagnostic kind) {
    final line = '[${kind.name}] ${uri ?? ""}${begin == null ? "" : "@$begin"} $text';
    messages.add(line);
    print('     $line');
  }
}

/// The result of one in-memory compile.
class GxResult {
  final bool ok;
  final Map<String, String> outputs;
  final List<String> diagnostics;
  final List<String> requested;
  final List<String> missing;
  final String? crash;
  GxResult(this.ok, this.outputs, this.diagnostics, this.requested, this.missing, this.crash);
}

/// Where we tell the compiler its platform lives. These are OPAQUE Uris -- they
/// never touch a filesystem; they are only keys the provider looks up. That is
/// the whole point: in a browser, every one of these is answered from memory
/// after a fetch(), and dart:io is never on the path.
const String platformDirUri = 'org-dartlang-sdk:///platform/';
const String platformDillUri = 'org-dartlang-sdk:///platform/dart2js_platform.dill';
const String librariesSpecUri = 'org-dartlang-sdk:///sdk/lib/libraries.json';

/// Compile [sources] (a map of uri-string to Dart source) entirely in memory.
///
/// [dill] is dart2js_platform.dill and [librariesSpec] is sdk/lib/libraries.json
/// -- both served as bytes, exactly as a browser worker would after a fetch().
/// Nothing here touches a filesystem.
Future<GxResult> gxCompile({
  required Map<String, String> sources,
  required Uint8List dill,
  required String entry,
  String? librariesSpec,
  Map<String, Uint8List> extraBinary = const {},
}) async {
  gxRequested.clear();
  gxMissing.clear();

  final files = <String, Uint8List>{};
  sources.forEach((k, v) => files[k] = Uint8List.fromList(v.codeUnits));
  files[platformDillUri] = dill;
  if (librariesSpec != null) {
    files[librariesSpecUri] = Uint8List.fromList(librariesSpec.codeUnits);
  }
  extraBinary.forEach((k, v) => files[k] = v);

  final input = _Provider(files);
  final output = _Output();
  final diag = _Diagnostics();

  // NO LONGER THE SPECULATIVE LINE. Spike 3 printed the CLI's own call site at
  // pkg/compiler/lib/src/dart2js.dart:696, and this mirrors it:
  //
  //   CompilerOptions.parse(
  //       options,
  //       featureOptions: features,
  //       librariesSpecificationUri: librariesSpecificationUri,
  //       platformBinaries: platformBinaries,
  //       useDefaultOutputUri: true,
  //       onError: (String message) => _fail(message),
  //       onWarning: (String message) => print(message),
  //     )
  //     ..packageConfig = packageConfig
  //
  // Spike 2's version passed platform-binaries as a CLI FLAG inside the options
  // list. The CLI passes it as a named Uri. Those are not the same thing, and
  // the flag form would have failed as a confusing missing-input rather than an
  // honest signature error.
  //
  // Two points remain expectation rather than evidence: whether packageConfig
  // may stay null for a single file with no package: imports, and whether the
  // libraries spec can be served through CompilerInput like any other Uri.
  // Section 5 prints memory_compiler.dart -- the SDK's own in-memory harness --
  // so if either is wrong, the correction is already in the same log.
  late CompilerOptions options;
  final optErrors = <String>[];
  try {
    options = CompilerOptions.parse(
      // THE ENTRY IS A FLAG, NOT A POSITIONAL. Spike 9 passed <String>[entry]
      // and the compiler never asked for main.dart at all -- it went looking for
      // file:///.../out.dill, i.e. compilationTarget had fallen back to
      // Uri.base.resolve('out.dill') and dart2js was in read-a-kernel mode:
      //
      //   inputs the compiler ASKED FOR (1):
      //      file:///home/runner/dart-sdk-src/out.dill  [binary]
      //   #1 _loadFromKernel.read (src/phase/load_kernel.dart:216)
      //
      // memory_compiler.dart does it like this, and spike 4 PRINTED that line
      // 140 lines below where I stopped reading:
      //   options = [...options, '${Flags.entryUri}=$entryPoint'];
      // Using the Flags constant rather than the literal string, for the same
      // reason: the reference is the source of truth, not my memory of it.
      <String>['${Flags.entryUri}=$entry'],
      librariesSpecificationUri: Uri.parse(librariesSpecUri),
      platformBinaries: Uri.parse(platformDirUri),
      useDefaultOutputUri: true,
      onError: (String message) => optErrors.add(message),
      onWarning: (String message) => diag.messages.add('[opt-warn] $message'),
    )
      // THE CASCADES. Spike 6 crashed here:
      //   Unsupported operation: Cannot modify unmodifiable map
      //   #1 CompilerOptions.deriveOptions (src/options.dart:1160)
      //   #2 new Compiler (src/compiler.dart:158)
      //   #3 compile (compiler_api.dart:267)
      // environment keeps its const {} default unless set, deriveOptions writes
      // to it, and a const map is unmodifiable. The comment above this call has
      // quoted these three lines since spike 4 -- I copied the CLI's parse()
      // and then simply did not write the cascades underneath it. Reading the
      // reference is not the same as following it.
      ..environment = <String, String>{}
      ..packageConfig = null;
  } catch (e) {
    return GxResult(false, {}, ['CompilerOptions.parse THREW: $e', ...optErrors],
        gxRequested, gxMissing, '$e');
  }
  if (optErrors.isNotEmpty) {
    return GxResult(false, {}, ['CompilerOptions.parse onError: ${optErrors.join("; ")}'],
        gxRequested, gxMissing, optErrors.join('; '));
  }

  try {
    final result = await api.compile(options, input, diag, output);
    return GxResult(result.isSuccess, output.files, diag.messages, List.of(gxRequested), List.of(gxMissing), null);
  } catch (e, st) {
    return GxResult(false, output.files, diag.messages, List.of(gxRequested), List.of(gxMissing),
        '$e\n${st.toString().split("\n").take(6).join("\n")}');
  }
}

/// Shared reporting so the VM and web drivers print an identical transcript.
void gxReport(GxResult r) {
  print('     ok         : ${r.ok}');
  print('     outputs    : ${r.outputs.keys.toList()}');
  for (final k in r.outputs.keys) {
    print('     $k -> ${r.outputs[k]!.length} chars');
  }
  print('     inputs the compiler ASKED FOR (${r.requested.length}):');
  for (final u in r.requested.take(40)) {
    print('        $u');
  }
  if (r.requested.length > 40) print('        ... and ${r.requested.length - 40} more');
  if (r.missing.isNotEmpty) {
    print('     MISSING (this list is the finding -- serve these):');
    for (final u in r.missing) {
      print('        $u');
    }
  }
  if (r.crash != null) print('     CRASH: ${r.crash}');
}
