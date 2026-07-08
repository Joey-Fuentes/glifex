; nth Fibonacci -- 6502 assembly (customasm syntax)
;
; Contract:
;   * runs at $0600 on a flat 64KB RAM
;   * input  n            is at $10
;   * output fib(n) low byte -> write it to $12
;   * end the program with BRK
;   * documented opcodes only; decimal mode (SED) is not supported yet
;   * zero page $00..$0F is free scratch space
;
; Write plain 6502 -- the standard instruction set is already available,
; so you do NOT need a #ruledef or #include.

        ldx $10          ; X = n
        ; TODO: compute fib(n) and store its low byte at $12
        lda #0
        sta $12
        brk
