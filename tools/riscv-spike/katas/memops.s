# kata(ptr) -> ptr[0] + ptr[1]. Stack frame + loads from a caller buffer.
    .text
    .globl kata
kata:
    addi    sp, sp, -16
    sd      ra, 8(sp)
    ld      t0, 0(a0)
    ld      t1, 8(a0)
    add     a0, t0, t1
    ld      ra, 8(sp)
    addi    sp, sp, 16
    ret
