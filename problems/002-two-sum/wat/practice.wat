;; two-sum in WebAssembly Text. Contract (host marshals JSON):
;;   solve(ptr: i32, len: i32, target: f64) -> (i32, i32)   ;; [i, j], or [-1, -1] if not found
(module
  (memory (export "memory") 1)
  (func (export "solve") (param $ptr i32) (param $len i32) (param $target f64) (result i32 i32)
    (local $i i32) (local $j i32) (local $a i32) (local $b i32)
    (block $done
      (loop $outer
        (br_if $done (i32.ge_s (local.get $i) (local.get $len)))
        (local.set $a (i32.load (i32.add (local.get $ptr) (i32.shl (local.get $i) (i32.const 2)))))
        (local.set $j (i32.add (local.get $i) (i32.const 1)))
        (loop $inner
          (if (i32.lt_s (local.get $j) (local.get $len))
            (then
              (local.set $b (i32.load (i32.add (local.get $ptr) (i32.shl (local.get $j) (i32.const 2)))))
              (if (f64.eq (f64.add (f64.convert_i32_s (local.get $a)) (f64.convert_i32_s (local.get $b))) (local.get $target))
                (then
                  (return (local.get $i) (local.get $j))))
              (local.set $j (i32.add (local.get $j) (i32.const 1)))
              (br $inner))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $outer)))
    (i32.const -1) (i32.const -1)))
