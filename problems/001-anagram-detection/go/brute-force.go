package main

// Obvious approach: for every character in s, count how many times it occurs
// in s and in t, and demand the two counts agree. No lookup table, no sorting
// -- just the definition of an anagram applied literally. O(n^2) time.
//
// Ranging over a string yields runes decoded in place, so -- unlike a
// []rune(s) conversion -- this allocates nothing and the O(1) space the
// manifest declares is real, not an "extra space beyond the input" caveat.
func bruteForce(c map[string]any) any {
	s := c["s"].(string)
	t := c["t"].(string)
	if len(s) != len(t) {
		return false
	}
	for _, ch := range s {
		cs, ct := 0, 0
		for _, x := range s {
			if x == ch {
				cs++
			}
		}
		for _, x := range t {
			if x == ch {
				ct++
			}
		}
		if cs != ct {
			return false
		}
	}
	return true
}
