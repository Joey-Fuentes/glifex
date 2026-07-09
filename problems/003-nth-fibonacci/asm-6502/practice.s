; nth Fibonacci -- 6502 assembly (customasm syntax)
;
; Contract:
;   * runs at $0600 on a flat 64KB RAM
;   * input  n is a byte at $10
;   * output fib(n) is 16-BIT: store the LOW byte at $12 and the HIGH byte
;     at $13 (little-endian). fib(20) = 6765 = $1A6D -> $12=$6D, $13=$1A.
;   * end the program with BRK
;   * documented opcodes only; decimal mode (SED) is not supported yet
;   * zero page $00..$0F is free scratch space
;
; Hint: chain 16-bit adds with the carry flag -- CLC, then ADC the low bytes,
; then ADC the high bytes (the carry rolls over automatically).
; Write plain 6502 -- the standard instruction set is already available.

        ldx $10          ; X = n
        ; TODO: compute fib(n) as 16-bit and store lo->$12, hi->$13
        lda #0
        sta $12
        sta $13
        brk
