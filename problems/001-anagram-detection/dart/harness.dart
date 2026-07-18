// Generated harness — do not edit. Reads ../test_cases.json, dispatches on variant.
import 'dart:convert';
import 'dart:io';

import 'practice.dart' as practice;
// The file is brute-force.dart. A Dart import URI is a path, so the hyphen is
// fine; only the prefix must be an identifier. Like go's main.go this import is
// UNCONDITIONAL -- Dart has no weak imports -- so every problem shipping a dart/
// directory must define brute-force.dart, exactly as every go/ directory must
// define bruteForce.
import 'brute-force.dart' as brute_force;
import 'clean.dart' as clean;
import 'optimized.dart' as optimized;

void main(List<String> args) {
  final variant = args.isNotEmpty ? args[0] : 'practice';
  final cases = jsonDecode(File('../test_cases.json').readAsStringSync()) as List;
  final fn = switch (variant) {
    'practice' => practice.solve,
    'brute-force' => brute_force.solve,
    'clean' => clean.solve,
    _ => optimized.solve,
  };
  var passed = 0;
  for (var i = 0; i < cases.length; i++) {
    final c = cases[i] as Map<String, dynamic>;
    final got = fn(c['input'] as Map<String, dynamic>);
    final ok = jsonEncode(got) == jsonEncode(c['expected']);
    if (ok) { passed++; print('  [PASS] case $i'); }
    else { print('  [FAIL] case $i  expected=${jsonEncode(c['expected'])} got=${jsonEncode(got)}'); }
  }
  print('$passed/${cases.length} passed');
  if (passed != cases.length) exit(1);
}
