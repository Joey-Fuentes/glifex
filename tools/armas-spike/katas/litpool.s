// gas builds a literal pool in .text; ldr is PC-relative -> position independent.
// If this needs no reloc, corpus katas may use large constants freely.
    .text
    .global kata
kata:
    ldr x0, =0xdeadbeefcafe1234
    ret
