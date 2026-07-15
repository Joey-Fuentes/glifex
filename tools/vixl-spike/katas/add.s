// gate: arithmetic + ret + the LR=kEndOfSimAddress sentinel
// kata(a, b) -> a + b
    .text
    .global kata
kata:
    add x0, x0, x1
    ret
