// adrp/:lo12: against .data -> ELF relocations -> needs a LINK, and after
// linking wants its segment at a fixed vaddr, which VIXL (malloc-based guest
// addresses) cannot honour. This kata is the BOUNDARY probe. Expected to be
// the one that hurts.
    .text
    .global kata
kata:
    adrp x1, myval
    add  x1, x1, :lo12:myval
    ldr  x0, [x1]
    ret
    .data
    .align 3
myval:
    .quad 0x1122334455667788
