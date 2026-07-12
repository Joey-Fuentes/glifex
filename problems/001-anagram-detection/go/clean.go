package main

import "sort"

// sortStr returns s with its runes in sorted order, so two anagrams
// produce identical sorted strings. Ranges over runes (not bytes) to match
// the optimized variant's Unicode handling. O(n log n) time, O(n) space --
// the declared "clean" bound. (This helper was referenced but never
// defined in the initial commit; the Go leg only ran once the CI matrix
// was re-enabled, which is what surfaced it.)
func sortStr(s string) string {
	r := []rune(s)
	sort.Slice(r, func(i, j int) bool { return r[i] < r[j] })
	return string(r)
}

func clean(c map[string]any) any {
	return sortStr(c["s"].(string)) == sortStr(c["t"].(string))
}
