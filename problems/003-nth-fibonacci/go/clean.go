package main

// The professional default: slide a two-value window up the sequence, keeping
// only the pair the next term needs. One pass, no table, no recursion --
// O(n) time and O(1) space.
func clean(c map[string]any) any {
	n := int(c["n"].(float64))
	a, b := 0, 1
	for i := 0; i < n; i++ {
		a, b = b, a+b
	}
	return a
}
