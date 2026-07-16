# RV64GC includes the C extension: 16-bit compressed instructions. arm64 had no
# analogue -- every instruction was 4 bytes. So: does the assembler actually
# emit 2-byte forms, and does instruction counting still mean what we think?
# Counting stays exact, but insns no longer maps 1:1 to bytes, and anything
# assuming 4-byte alignment must be re-checked rather than inherited.
# kata(a, b) -> a + b, written so the assembler may compress it
    .text
    .globl kata
    .option arch, +c
kata:
    c.add   a0, a1
    c.jr    ra
