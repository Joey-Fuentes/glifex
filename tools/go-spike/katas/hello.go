// The smallest thing that proves the self-hosted toolchain emits RUNNING code.
// Stdout only: no file I/O, so a failure here is the toolchain, never the FS.
package main

import "fmt"

func main() {
	sum := 0
	for i := 1; i <= 10; i++ {
		sum += i * i
	}
	fmt.Println("hello from a wasm-hosted gc toolchain; sum of squares 1..10 =", sum)
}
