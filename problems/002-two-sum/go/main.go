// Generated harness — do not edit. Reads ../test_cases.json, dispatches on variant.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
)

type Case struct {
	Input    map[string]any `json:"input"`
	Expected any            `json:"expected"`
}

func dispatch(variant string, c map[string]any) any {
	switch variant {
	case "practice":
		return practice(c)
	case "brute-force":
		// The file is brute-force.go, but a Go identifier cannot contain a
		// hyphen, so the function it defines is bruteForce -- the same name
		// web/go-worker.js's entry regex accepts. Go has no weak symbols, so
		// this case is unconditional: every problem shipping a go/ directory
		// must define bruteForce, exactly as main.rs's unconditional
		// "mod brute_force" requires a brute-force.rs of every Rust problem.
		return bruteForce(c)
	case "clean":
		return clean(c)
	case "optimized":
		return optimized(c)
	}
	panic("unknown variant: " + variant)
}

func main() {
	variant := "practice"
	if len(os.Args) > 1 {
		variant = os.Args[1]
	}
	data, _ := os.ReadFile("../test_cases.json")
	var cases []Case
	json.Unmarshal(data, &cases)
	passed := 0
	for i, c := range cases {
		got := dispatch(variant, c.Input)
		ok := reflect.DeepEqual(fmt.Sprint(got), fmt.Sprint(c.Expected))
		if ok {
			passed++
			fmt.Printf("  [PASS] case %d\n", i)
		} else {
			fmt.Printf("  [FAIL] case %d  expected=%v got=%v\n", i, c.Expected, got)
		}
	}
	fmt.Printf("%d/%d passed\n", passed, len(cases))
	if passed != len(cases) {
		os.Exit(1)
	}
}
