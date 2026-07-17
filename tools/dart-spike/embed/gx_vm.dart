// gx_vm.dart -- GATE 2a. Runs the embeddable core on the Dart VM.
//
// Why this exists as a separate step from the web gate: it isolates ONE
// question -- "is my usage of the compiler_api correct?" -- from every browser
// concern. dart:io lives HERE and nowhere else; it only loads the dill off disk
// and hands it to the core as bytes, which is exactly what a fetch() will do in
// a worker. If 2a passes and 2b fails, the fault is interop. If 2a fails, the
// API usage is wrong and the browser was never the problem.
//
// This is the same "run the known-good control first" move that the C/C++ and
// riscv work kept being rescued by.
import 'dart:io';
import 'dart:typed_data';

import 'gx_core.dart';

Future<void> main(List<String> args) async {
  final dillPath = args[0];
  final dill = Uint8List.fromList(File(dillPath).readAsBytesSync());
  print('     dill       : $dillPath (${dill.length} bytes)');
  // The libraries spec: the CLI passes librariesSpecificationUri, so we serve
  // it through the provider like any other input. In a browser this is one more
  // fetch(). Optional on purpose -- if the compiler never asks, the requested
  // list in the report will say so, and that is a finding either way.
  final specPath = args.length > 2 ? args[2] : null;
  final spec = (specPath != null && File(specPath).existsSync())
      ? File(specPath).readAsStringSync()
      : null;
  print('     libs spec  : ${specPath ?? "(none)"} (${spec?.length ?? 0} chars)');

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

  // If it produced JS, write it out so the job can actually RUN it. An
  // artifact that compiles but does not execute has proven nothing -- the
  // arm64 lesson about plausible output being the worst failure shape.
  if (r.outputs.isNotEmpty) {
    final js = r.outputs.values.first;
    File('${args[1]}/gx_vm_out.js').writeAsStringSync(js);
    print('     wrote      : ${args[1]}/gx_vm_out.js (${js.length} chars)');
  }
  exit(r.ok ? 0 : 1);
}
