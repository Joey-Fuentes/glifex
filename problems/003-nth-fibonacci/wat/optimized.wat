;; Same O(n) window-slide as clean.wat, i64 accumulators for the same
;; reason (see clean.wat's comments); unrolled 2x so the loop body
;; advances two Fibonacci steps per iteration-counter check -- mirrors
;; the 8080 optimized.s's peel-odd-n + unrolled-pair trick, a genuine
;; constant-factor win that stays in the manifest's declared O(n) class.
(module
  (func (export "solve") (param $n i32) (result i64)
    (local $a i64) (local $b i64) (local $t i64)
    (local.set $a (i64.const 0))
    (local.set $b (i64.const 1))
    (if (i32.and (local.get $n) (i32.const 1))
      (then
        (local.set $t (i64.add (local.get $a) (local.get $b)))
        (local.set $a (local.get $b))
        (local.set $b (local.get $t))
        (local.set $n (i32.sub (local.get $n) (i32.const 1)))))
    (block $done
      (loop $loop
        (br_if $done (i32.le_s (local.get $n) (i32.const 0)))
        (local.set $t (i64.add (local.get $a) (local.get $b)))
        (local.set $b (i64.add (local.get $t) (local.get $b)))
        (local.set $a (local.get $t))
        (local.set $n (i32.sub (local.get $n) (i32.const 2)))
        (br $loop)))
    (local.get $a)))
