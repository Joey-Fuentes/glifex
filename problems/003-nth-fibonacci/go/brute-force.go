package main

// fibRec is the recurrence transcribed literally: fib(n) = fib(n-1) + fib(n-2).
// It recomputes the same subproblems exponentially many times -- fib(n-2) is
// evaluated once for fib(n) and again inside fib(n-1) -- which is exactly what
// clean's single pass exists to avoid.
func fibRec(n int) int {
	if n < 2 {
		return n
	}
	return fibRec(n-1) + fibRec(n-2)
}

// Obvious approach: the naive recursive definition. O(phi^n) time, and the
// call stack reaches depth n, so O(n) space.
func bruteForce(c map[string]any) any {
	n := int(c["n"].(float64))
	return fibRec(n)
}
