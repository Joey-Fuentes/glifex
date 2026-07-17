// main.go dispatches on practice/clean/optimized, so all three must exist. The
// repo's real clean.go/optimized.go are blind-practice material and are not
// touched here.
package main

func clean(c map[string]any) any     { return practice(c) }
func optimized(c map[string]any) any { return practice(c) }
