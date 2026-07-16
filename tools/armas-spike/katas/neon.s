// gate: basic NEON -- ld1 vector load, addv horizontal reduce, fmov v->gp.
// Report flagged "basic NEON" as a kata-menu requirement; this is the probe.
// kata(ptr) -> ptr[0]+ptr[1]+ptr[2]+ptr[3]   (four s32)
    .text
    .global kata
kata:
    ld1 {v0.4s}, [x0]
    addv s0, v0.4s
    fmov w0, s0
    ret
