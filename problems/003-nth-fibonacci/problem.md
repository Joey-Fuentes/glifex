# 003 · Nth Fibonacci

Return the **nth Fibonacci number**.

`solve(n)` takes a non-negative integer `n` and returns `fib(n)`, where
`fib(0) = 0`, `fib(1) = 1`, and `fib(k) = fib(k-1) + fib(k-2)` for `k ≥ 2`.

The sequence begins `0, 1, 1, 2, 3, 5, 8, 13, 21, …`.

This is a **numeric** problem — integers in, an integer out — which is why it's
the home for the WebAssembly Text (WAT) runtime, whose contract is numeric-only.
