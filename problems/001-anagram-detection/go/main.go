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
