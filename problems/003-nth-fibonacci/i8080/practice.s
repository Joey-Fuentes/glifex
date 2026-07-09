; nth Fibonacci -- Intel 8080 assembly (customasm syntax, Intel mnemonics)
;
; Contract:
;   * runs at 0x0100 (the classic CP/M entry) on flat 64KB RAM
;     (no peripherals -- just the CPU; validated cycle-exact against the
;     CP/M diagnostic ROMs, timed at the 2.000 MHz reference clock)
;   * input  n is a byte at 0xC000
;   * output fib(n) is 16-BIT: low byte -> 0xC010, high byte -> 0xC011
;   * end the program with HLT
;
; Hint: DAD adds a register pair into HL in one 10-cycle instruction, and
; XCHG swaps HL<->DE in 4 -- the fib window-slide is TWO instructions.
; Lowercase Intel mnemonics (mov, mvi, lxi, dad, ...), 0x-prefixed hex.

    lda 0xC000        ; A = n
    ; TODO: compute fib(n); store low byte -> 0xC010, high byte -> 0xC011
    mvi a, 0
    sta 0xC010
    sta 0xC011
    hlt
