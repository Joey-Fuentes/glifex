// Generated bench — do not edit. Real Go benchmarking via `go test -bench .`
// (proper warmup, statistical iteration control — not naive loops).
package main

import (
	"encoding/json"
	"os"
	"testing"
)

func loadCases(b *testing.B) []Case {
	data, err := os.ReadFile("../test_cases.json")
	if err != nil {
		b.Fatal(err)
	}
	var cases []Case
	json.Unmarshal(data, &cases)
	return cases
}

func BenchmarkPractice(b *testing.B) {
	cases := loadCases(b)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, c := range cases {
			practice(c.Input)
		}
	}
}

func BenchmarkOptimized(b *testing.B) {
	cases := loadCases(b)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, c := range cases {
			optimized(c.Input)
		}
	}
}
