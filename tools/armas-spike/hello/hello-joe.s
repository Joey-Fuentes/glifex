// hello-joe.s -- a freestanding aarch64 Linux program.
//
// No libc, no dynamic loader, raw syscalls only. That is deliberate: a static
// syscall-only binary needs no interpreter at /system/bin/linker64 and no
// Termux libc, so it just runs.
//
// It also computes sum-of-squares 1..5 with the SAME loop kata VIXL executes in
// the browser, and returns it as the exit status -- so `echo $?` == 55 proves
// the ALU works, not merely that write() works.
//
// Assembled + linked by an x86-64-hosted, aarch64-targeting binutils that
// Glifex CI built from source.

    .text

msg:
    .ascii  "Hello Joe.\n"
    .ascii  "\n"
    .ascii  "This aarch64 binary was assembled and linked by a binutils that\n"
    .ascii  "Glifex CI built from source: x86-64 host, aarch64 target, static.\n"
    .ascii  "The same as.elf is meant to run inside Blink in a browser tab.\n"
    .ascii  "\n"
    .ascii  "Exit status is sum-of-squares 1..5, computed by this program in\n"
    .ascii  "the same loop kata VIXL runs in wasm. Check it with: echo $?\n"
    .ascii  "Expect 55.\n"
msgend:
    .set    msglen, msgend - msg

    // Instructions must be 4-byte aligned; the string above is arbitrary length.
    .balign 4

    .global _start
_start:
    // write(1, msg, msglen)
    mov     x0, #1
    adr     x1, msg
    mov     x2, #msglen
    mov     x8, #64                 // __NR_write
    svc     #0

    // sum of squares 1..5 -- byte-for-byte the browser loop kata
    mov     x1, #5
    mov     x2, #0
1:  cbz     x1, 2f
    madd    x2, x1, x1, x2
    sub     x1, x1, #1
    b       1b
2:
    // exit(x2)  -> 55
    mov     x0, x2
    mov     x8, #93                 // __NR_exit
    svc     #0
