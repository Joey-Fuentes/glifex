// main.go dispatches on practice/clean/optimized, so all three must exist for
// the package to compile. These are the spike's own stand-ins -- the repo's real
// clean.go/optimized.go are blind-practice material and are not touched here.
package main

func clean(c map[string]any) any {
	return practice(c)
}

func optimized(c map[string]any) any {
	return practice(c)
}
