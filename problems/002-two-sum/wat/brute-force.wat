;; two-sum in WebAssembly Text: O(n^2) nested-loop brute force -- the
;; baseline every other approach here improves on. For each i, scans
;; every j > i checking nums[i] + nums[j] == target. Contract (host
;; marshals JSON):
;;   solve(ptr: i32, len: i32, target: f64) -> (i32, i32)   ;; [i, j], or [-1, -1] if not found
;;
;; Memory is imported, not declared here: the host (web/wat-worker.js)
;; sizes it based on the actual cases about to run. No hash table here,
;; so no capacity concern beyond the input array itself -- but a fixed
;; declared size here would still carry the same embedded "how big
;; could n get" assumption every other solution in this problem used to
;; have (and that assumption was the actual root cause the last time
;; this broke), so this stays consistent with clean.wat/optimized.wat's
;; approach even though this file itself has nothing more complex to
;; get right.
(module
  (import "env" "memory" (memory 0))
  (func (export "solve") (param $ptr i32) (param $len i32) (param $target f64) (result i32 i32)
    (local $i i32) (local $j i32) (local $a i32) (local $b i32)
    (local.set $i (i32.const 0))
    (block $done
      (loop $outer
        (br_if $done (i32.ge_s (local.get $i) (local.get $len)))
        (local.set $a (i32.load (i32.add (local.get $ptr) (i32.shl (local.get $i) (i32.const 2)))))
        (local.set $j (i32.add (local.get $i) (i32.const 1)))
        (block $break_inner
          (loop $inner
            (br_if $break_inner (i32.ge_s (local.get $j) (local.get $len)))
            (local.set $b (i32.load (i32.add (local.get $ptr) (i32.shl (local.get $j) (i32.const 2)))))
            (if (f64.eq (f64.add (f64.convert_i32_s (local.get $a)) (f64.convert_i32_s (local.get $b))) (local.get $target))
              (then
                (return (local.get $i) (local.get $j))))
            (local.set $j (i32.add (local.get $j) (i32.const 1)))
            (br $inner)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $outer)))
    (i32.const -1) (i32.const -1)))
