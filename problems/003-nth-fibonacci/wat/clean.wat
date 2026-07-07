(module
  ;; nth Fibonacci, iterative.  solve(n) -> fib(n).  fib(0)=0, fib(1)=1, fib(2)=1, ...
  ;; Accumulators are i64, not i32: fib(47) = 2971215073 overflows a signed
  ;; 32-bit int (max 2147483647), which forced an awkward, narrow wall-tier
  ;; ladder [12,46] for complexity testing -- and even within that range,
  ;; WAT's near-native execution speed left too little absolute signal
  ;; above fixed overhead to reliably classify growth (confirmed directly:
  ;; measurements consistently looked like flat O(1) even though the
  ;; algorithm is genuinely O(n)). i64 pushes the overflow point out to
  ;; fib(93); the loop counter $n stays i32 (n<=93 fits trivially), only
  ;; the Fibonacci values themselves widen. In practice the Lab still
  ;; caps n at 78 to match the JS oracle's own exact-double ceiling (see
  ;; lab-config.mjs) -- i64 buys headroom up to what the oracle can
  ;; actually validate, not further.
  (func (export "solve") (param $n i32) (result i64)
    (local $a i64) (local $b i64) (local $t i64)
    (local.set $a (i64.const 0))
    (local.set $b (i64.const 1))
    (block $done
      (loop $loop
        (br_if $done (i32.eqz (local.get $n)))
        (local.set $t (i64.add (local.get $a) (local.get $b)))
        (local.set $a (local.get $b))
        (local.set $b (local.get $t))
        (local.set $n (i32.sub (local.get $n) (i32.const 1)))
        (br $loop)))
    (local.get $a)))
