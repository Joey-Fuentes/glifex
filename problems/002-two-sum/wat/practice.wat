;; two-sum in WebAssembly Text. Contract (host marshals JSON):
;;   solve(ptr: i32, len: i32, target: f64) -> (i32, i32)   ;; [i, j], or [-1, -1] if not found
;;
;; Return the indices [i, j] (i < j) of the two numbers in the array at
;; ptr/len that add up to target. This stub always returns [-1, -1]
;; (not found).
(module
  (memory (export "memory") 1)
  (func (export "solve") (param $ptr i32) (param $len i32) (param $target f64) (result i32 i32)
    (i32.const -1) (i32.const -1)))


