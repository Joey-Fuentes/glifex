;; two-sum in WebAssembly Text. Contract (host marshals JSON):
;;   solve(ptr: i32, len: i32, target: f64) -> (i32, i32)   ;; [i, j], or [-1, -1] if not found
;;
;; Return the indices [i, j] (i < j) of the two numbers in the array at
;; ptr/len that add up to target. This stub always returns [-1, -1]
;; (not found).
;;
;; Memory is imported, not declared here, for consistency with the
;; other three solutions in this problem (clean/optimized/brute-force)
;; even though this stub doesn't currently read $ptr at all -- keeping
;; a separate, disconnected declared memory here would be a trap for
;; whoever edits this file next: the host (web/wat-worker.js) always
;; marshals the input array into ITS OWN memory object, not whatever a
;; module declares for itself, so a future edit that starts reading
;; $ptr would silently read garbage unless this already imports the
;; same memory the host is writing into.
(module
  (import "env" "memory" (memory 0))
  (func (export "solve") (param $ptr i32) (param $len i32) (param $target f64) (result i32 i32)
    (i32.const -1) (i32.const -1)))
