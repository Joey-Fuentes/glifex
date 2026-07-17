// async_control.dart -- THE CONTROL for gate 2b's stall.
//
// gate 2a-GX's output ran under node and printed solve(10)=55. But that kata is
// synchronous. gx_web's main is async, and it stalls at its first await with no
// error and no pending work -- the loop simply empties.
//
// dart2js targets the BROWSER. Its async scheduler picks a strategy at startup
// from self.scheduleImmediate / self.MutationObserver / setTimeout. Under bare
// node CommonJS there is no 'self'. A no-op scheduleImmediate would give exactly
// this signature: sync code runs, the first await never resumes, nothing is
// pending.
//
// That is a hypothesis, and this file exists so that it stops being one. Twelve
// spikes in, the pattern is unmistakable: every time I reasoned, I was wrong,
// and every time I ran a two-second control, I learned the answer. This is 43
// bytes of Dart and it isolates dart2js-async-under-node from the entire
// compiler.
//
// If this stalls, the fault has nothing to do with dart2js-as-a-compiler and
// everything to do with the JS host. If it passes, my hypothesis is dead and
// the fault is somewhere in the compile itself -- which the marks and the input
// dump will then have to locate.
Future<void> main() async {
  print('[CTRL] sync part ran');
  await Future<void>.delayed(Duration.zero);
  print('[CTRL] resumed after a zero-duration await');
  await Future<void>.delayed(const Duration(milliseconds: 10));
  print('[CTRL] resumed after a real timer');
  print('[CTRL] async ok');
}
