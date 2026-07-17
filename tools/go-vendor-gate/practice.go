// The gate kata. Solves 001 (anagram) by SORTING, and exercises container/heap
// on the side -- both packages are absent from the harness's own closure, which
// is the entire reason B1 exists. If this compiles, the payload covers what a
// real kata writes; if it does not, the allowlist is wrong and we learn it here
// rather than after the track ships.
package main

import (
	"container/heap"
	"sort"
)

type intHeap []int

func (h intHeap) Len() int            { return len(h) }
func (h intHeap) Less(i, j int) bool  { return h[i] < h[j] }
func (h intHeap) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }
func (h *intHeap) Push(x any)         { *h = append(*h, x.(int)) }
func (h *intHeap) Pop() any {
	old := *h
	n := len(old)
	x := old[n-1]
	*h = old[:n-1]
	return x
}

func practice(c map[string]any) any {
	s := c["s"].(string)
	t := c["t"].(string)
	if len(s) != len(t) {
		return false
	}

	// container/heap, purely to prove it links.
	h := &intHeap{3, 1, 2}
	heap.Init(h)
	if heap.Pop(h).(int) != 1 {
		return false
	}

	a := []byte(s)
	b := []byte(t)
	sort.Slice(a, func(i, j int) bool { return a[i] < a[j] })
	sort.Slice(b, func(i, j int) bool { return b[i] < b[j] })
	return string(a) == string(b)
}
