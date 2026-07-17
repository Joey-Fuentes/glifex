package main

// Obvious approach: try every pair until one sums to the target. The first
// thing anyone writes, and the O(n^2) baseline that clean's single-pass hash
// map exists to beat. Allocates nothing, so O(1) space.
func bruteForce(c map[string]any) any {
	nums := c["nums"].([]any)
	target := c["target"].(float64)
	for i := 0; i < len(nums); i++ {
		for j := i + 1; j < len(nums); j++ {
			if nums[i].(float64)+nums[j].(float64) == target {
				return []int{i, j}
			}
		}
	}
	return []int{}
}
