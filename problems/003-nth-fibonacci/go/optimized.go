package main

// Same O(n) window slide as clean, unrolled 2x: each iteration advances two
// Fibonacci steps, so the loop counter is checked half as often and the two
// halves of the pair never need a temporary swap. Peeling one step when n is
// odd keeps the remaining count even. This mirrors the 8080 optimized.s's
// peel-odd-n + unrolled-pair trick (see that file for the full derivation) --
// a genuine constant-factor win that stays inside the declared O(n) class.
func optimized(c map[string]any) any {
	n := int(c["n"].(float64))
	a, b := 0, 1
	if n&1 == 1 {
		a, b = b, a+b
		n--
	}
	for n > 0 {
		t := a + b
		b = t + b
		a = t
		n -= 2
	}
	return a
}
