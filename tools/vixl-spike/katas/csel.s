// gate: cmp -> NZCV -> csel (flag state must survive inside the simulator)
// kata(a, b) -> max(a, b), signed
    .text
    .global kata
kata:
    cmp x0, x1
    csel x0, x0, x1, gt
    ret
