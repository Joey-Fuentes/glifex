// gate: cbz, unconditional b, madd, sub -- and a known-length instruction
// stream so the single-step probe can count executed instructions.
// kata(_, n) -> sum of squares 1..n
    .text
    .global kata
kata:
    mov x2, #0
1:  cbz x1, 2f
    madd x2, x1, x1, x2
    sub x1, x1, #1
    b 1b
2:  mov x0, x2
    ret
