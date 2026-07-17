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
// The compiler does not accept just any api.Input. Spike 10:
//   "include" path 'org-dartlang-sdk:///sdk/lib/libraries.json' could not be
//   read: type '_Input' is not a subtype of type 'SourceFile' in type cast.
// utf8 inputs get cast to SourceFile. MemorySourceFileProvider (which spike 5
// printed in full) uses these three types, and src/io/source_file.dart is one
// of the 274 files in pkg/compiler that do NOT import dart:io -- so it is safe
// on the browser path.
import 'package:compiler/src/io/source_file.dart'
    show Binary, StringSourceFile, Utf8BytesSourceFile;
import 'package:compiler/src/options.dart' show CompilerOptions;

/// Every Uri the compiler asks us for, in order.
///
/// This is deliberately a first-class output of the spike, not debug noise. If
/// the gate fails, this list is the finding: it is the exact input set a
/// browser worker would have to serve, obtained by observation rather than by
/// reasoning about what a compiler "should" need.
final List<String> gxRequested = <String>[];
final List<String> gxMissing = <String>[];

// No hand-rolled Input class any more. memory_source_file_helper.dart does it
// like this, and it is the only shape the compiler's type casts accept:
//
//   if (source is String) stringFile = StringSourceFile.fromUri(uri, source);
//   switch (inputKind) {
//     case api.InputKind.utf8:   input = stringFile ?? Utf8BytesSourceFile(uri, source);
//     case api.InputKind.binary: input = Binary(uri, stringFile?.data ?? source);
//   }
//
// Note also: no zero-termination. My version padded utf8 inputs with a trailing
// zero on the strength of a doc comment in compiler_api.dart. The reference does
// not, and the reference is what the compiler is actually built against.
class _Provider implements api.CompilerInput {
  /// uri-string -> String or Uint8List, exactly like memorySourceFiles.
  final Map<String, dynamic> files;
  _Provider(this.files);

  @override
  Future<api.Input<Uint8List>> readFromUri(
    Uri uri, {
    api.InputKind inputKind = api.InputKind.utf8,
  }) async {
    gxRequested.add('$uri  [${inputKind.name}]');
    var source = files[uri.toString()];
    if (source == null) {
      gxMissing.add(uri.toString());
      throw Exception('gx: no input registered for $uri');
    }
    StringSourceFile? stringFile;
    if (source is String) {
      stringFile = StringSourceFile.fromUri(uri, source);
    }
    switch (inputKind) {
      case api.InputKind.utf8:
        return stringFile ?? Utf8BytesSourceFile(uri, source);
      case api.InputKind.binary:
        if (stringFile != null) source = stringFile.data;
        return Binary(uri, source);
    }
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

  // uri-string -> String or Uint8List, the memorySourceFiles shape. Strings stay
  // strings: the provider turns them into StringSourceFile, and that is what
  // satisfies the compiler's cast to SourceFile.
  final files = <String, dynamic>{};
  sources.forEach((k, v) => files[k] = v);
  files[platformDillUri] = dill;
  if (librariesSpec != null) files[librariesSpecUri] = librariesSpec;

  // THE PACKAGE CONFIG. Spike 10 set ..packageConfig = null and the compiler
  // went looking for one anyway, derived from the entry's own scheme:
  //   MISSING: org-dartlang-gx:///.dart_tool/package_config.json
  // The request log named it exactly, which is what that log is for. The kata
  // has no package: imports, so an empty config is honest rather than a fudge --
  // there genuinely are no packages to resolve. Derived from the entry rather
  // than hardcoded, so it follows if the scheme ever changes.
  final pkgConfigUri =
      Uri.parse(entry).resolve('.dart_tool/package_config.json').toString();
  files[pkgConfigUri] = '{"configVersion":2,"packages":[]}';

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
        // 30, not 6. Spike 13's crash was "Unsupported operation:
        // Platform._version" and the frame that CALLED it was the seventh --
        // one past my own truncation. A report that cuts off the answer is
        // worse than no report, because it looks like a report.
        '$e\n${st.toString().split("\n").take(30).join("\n")}');
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
