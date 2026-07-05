package main

func optimized(c map[string]any) any {
	nums := c["nums"].([]any)
	target := c["target"].(float64)
	seen := map[float64]int{}
	for i, v := range nums {
		n := v.(float64)
		if j, ok := seen[target-n]; ok {
			return []int{j, i}
		}
		seen[n] = i
	}
	return []int{}
}
