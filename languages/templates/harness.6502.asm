; Glifex 6502 assembly -- CPU-core contract (numbers in, number out)
;   entry:  execution starts at $0600
;   inputs: bytes at $10, $11, ... (in argument order)
;   result: write your answer as a byte to $12
;   halt:   BRK when done
;   memory: flat 64KB RAM, no MMIO
;
; Bring in the 6502 instruction set, then solve. (If <std/6502.asm> is not
; available in the in-browser assembler, define the opcodes you need with a
; #ruledef block instead.)
#include <std/6502.asm>

; Example -- echo the first input:
;   lda $10
;   sta $12
;   brk
