package main

func optimized(c map[string]any) any {
	s, t := c["s"].(string), c["t"].(string)
	if len(s) != len(t) {
		return false
	}
	count := map[rune]int{}
	for _, ch := range s {
		count[ch]++
	}
	for _, ch := range t {
		count[ch]--
		if count[ch] < 0 {
			return false
		}
	}
	return true
}
