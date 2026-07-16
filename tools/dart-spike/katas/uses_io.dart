// The constraint, pinned as a fact rather than a belief.
//
// dart2js targets the browser and has never supported dart:io. That sentence
// is the load-bearing assumption under the whole Bx-13 thesis -- it is WHY the
// dart2js CLI entrypoint cannot self-host, and why try.dartlang.org had to go
// through the embeddable API instead.
//
// So: compile it and watch it get rejected. Four seconds to convert a
// recollection into a log line. If it COMPILES, the premise is wrong and the
// track just got much easier -- also worth four seconds.
import 'dart:io';

void main() {
  final src = File('hello.dart').readAsStringSync();
  print('[KATA] read ${src.length} bytes -- if you can read this, re-read the premise');
}
