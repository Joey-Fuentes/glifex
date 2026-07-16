// The practice slot. Deliberately the real, working anagram solve rather than
// the repo's blank stub: the gate has to compile something that ALLOCATES and
// RETURNS, or a green result proves nothing about the contract.
package main

func practice(c map[string]any) any {
	s := c["s"].(string)
	t := c["t"].(string)
	if len(s) != len(t) {
		return false
	}
	counts := map[rune]int{}
	for _, r := range s {
		counts[r]++
	}
	for _, r := range t {
		counts[r]--
		if counts[r] < 0 {
			return false
		}
	}
	return true
}
