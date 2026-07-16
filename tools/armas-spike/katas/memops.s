// gate: AAPCS64 frame, stp/ldp pre+post-index, ldr from a caller buffer.
// This is THE memory-model probe: VIXL dereferences guest addresses as raw
// host pointers with no MMU, so x0 must be a real wasm linear-memory offset.
// kata(ptr) -> ptr[0] + ptr[1]   (two u64s)
    .text
    .global kata
kata:
    stp x29, x30, [sp, #-16]!
    mov x29, sp
    ldr x2, [x0]
    ldr x3, [x0, #8]
    add x0, x2, x3
    ldp x29, x30, [sp], #16
    ret
