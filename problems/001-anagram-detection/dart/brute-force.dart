// Obvious approach: for every character in s, count how many times it occurs in
// s and in t, and demand the two counts agree. No lookup table, no sorting --
// just the definition of an anagram applied literally. O(n^2) time.
//
// Iterates codeUnits rather than split(''), so nothing is allocated beyond the
// two counters and the O(1) space the manifest declares is literal.
dynamic solve(Map<String, dynamic> c) {
  final s = c['s'] as String;
  final t = c['t'] as String;
  if (s.length != t.length) return false;
  for (final ch in s.codeUnits) {
    var cs = 0, ct = 0;
    for (final x in s.codeUnits) {
      if (x == ch) cs++;
    }
    for (final x in t.codeUnits) {
      if (x == ch) ct++;
    }
    if (cs != ct) return false;
  }
  return true;
}
