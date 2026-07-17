// gx_ref.dart -- GATE 2a-REF. The SDK's OWN in-memory harness, driven as a
// control, on the VM.
//
// Spike 4 printed pkg/compiler/lib/src/util/memory_compiler.dart: 206 lines,
// zero dart:io imports, exporting output_collector.dart and diagnostic_helper.
// dart, with this entry point:
//
//   Future<api.CompilationResult> runCompiler({
//     Map<String, dynamic> memorySourceFiles,   // string OR binary contents
//     Uri? entryPoint,                          // defaults to memory:main.dart
//     api.CompilerDiagnostics? diagnosticHandler,
//     api.CompilerOutput? outputProvider,
//     List<String> options,
//     Uri? librariesSpecificationUri,
//     Uri? platformBinaries,
//     Uri? packageConfig,
//     bool skipPackageConfig,
//     ...
//   })
//
// I hand-wrote a worse version of this for three spikes without ever looking
// for it. So before gx_core's own providers get another round, run THEIRS and
// find out whether an in-memory dart2js compile works AT ALL in this
// environment. That is the control, and this project keeps getting rescued by
// running the control first.
//
// If this passes and gx_core fails -> my providers are wrong.
// If this fails too -> the problem is the environment or the platform inputs,
//                      and gx_core was never the suspect.
//
// Note this is NOT the browser path: runCompiler's provider falls back to
// dart:io for any Uri outside its memory map, so it will read the dill off
// disk. That is fine. Its job is to isolate one variable.
import 'dart:io';

import 'package:compiler/src/util/memory_compiler.dart';
// memory_compiler re-exports output_collector and diagnostic_helper, but its own
// compiler_api import is "show CompilationResult, CompilerDiagnostics,
// CompilerOutput, Diagnostic" -- so OutputType does NOT come through it. Spike 6
// died on exactly that, in one line.
import 'package:compiler/compiler_api.dart' show OutputType;

const String src = '''
dynamic solve(Map<String, dynamic> c) {
  final n = c['n'] as int;
  var a = 0, b = 1;
  for (var i = 0; i < n; i++) { final t = a + b; a = b; b = t; }
  return a;
}
void main() { print('[KATA] ref ok solve(10)=' + solve({'n': 10}).toString()); }
''';

Future<void> main(List<String> args) async {
  final outDir = args[0];
  final librariesSpec = args.length > 1 ? args[1] : null;
  final platformDir = args.length > 2 ? args[2] : null;

  print('     libs spec  : ${librariesSpec ?? "(default)"}');
  print('     platform   : ${platformDir ?? "(default)"}');

  final collector = OutputCollector();
  final sw = Stopwatch()..start();
  try {
    final result = await runCompiler(
      memorySourceFiles: {'main.dart': src},
      entryPoint: Uri.parse('memory:main.dart'),
      outputProvider: collector,
      // No package: imports in the kata, so there is nothing for a package
      // config to resolve. skipPackageConfig is the SDK's own answer to the
      // question gx_core was guessing at.
      skipPackageConfig: true,
      showDiagnostics: true,
      librariesSpecificationUri:
          librariesSpec == null ? null : Uri.file(librariesSpec),
      platformBinaries: platformDir == null ? null : Uri.directory(platformDir),
    );
    sw.stop();
    print('     wall       : ${sw.elapsedMilliseconds} ms');
    print('     isSuccess  : ${result.isSuccess}');
    final js = collector.getOutput('', OutputType.js);
    if (js == null) {
      print('     NO JS OUTPUT -- compile reported success but produced nothing,');
      print('     which is the failure shape worth fearing most.');
      exit(1);
    }
    print('     produced   : ${js.length} chars of JS');
    File('$outDir/gx_ref_out.js').writeAsStringSync(js);
    print('     wrote      : $outDir/gx_ref_out.js');
    exit(result.isSuccess ? 0 : 1);
  } catch (e, st) {
    sw.stop();
    print('     THREW after ${sw.elapsedMilliseconds} ms: $e');
    print('     ${st.toString().split("\n").take(8).join("\n     ")}');
    exit(1);
  }
}
