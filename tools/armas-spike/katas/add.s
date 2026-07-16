// control: pure PC-relative, no relocations. Must extract straight from .o
    .text
    .global kata
kata:
    add x0, x0, x1
    ret
