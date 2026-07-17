package main

// Same single-pass hash map as clean, with one change: the map is sized to the
// input up front. A Go map grows by rehashing every key into a new, larger
// bucket array each time it outgrows its load factor, so a map built by
// repeated insertion re-hashes an n-element input roughly log2(n/8) times.
// Handing make() the final size pays for the buckets once. Same O(n) time and
// O(n) space as clean -- this is a constant-factor win, not a class change.
func optimized(c map[string]any) any {
	nums := c["nums"].([]any)
	target := c["target"].(float64)
	seen := make(map[float64]int, len(nums))
	for i, v := range nums {
		n := v.(float64)
		if j, ok := seen[target-n]; ok {
			return []int{j, i}
		}
		seen[n] = i
	}
	return []int{}
}
