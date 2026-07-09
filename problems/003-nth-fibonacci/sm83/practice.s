; nth Fibonacci -- Game Boy assembly (SM83, customasm syntax)
;
; Contract:
;   * runs at $0100 (the Game Boy cartridge entry) on flat 64KB RAM
;     (no Game Boy hardware -- no PPU/timers/interrupts; just the CPU)
;   * input  n is a byte at $C000
;   * output fib(n) is 16-BIT: low byte -> $C010, high byte -> $C011
;   * end the program with HALT
;
; Hint: unlike the 6502, the SM83 has native 16-bit adds -- keep fib's pair
; in HL and DE and use ADD HL,DE. Uppercase mnemonics (LD, ADD, JR ...).

    LD A,[$C000]      ; A = n
    ; TODO: compute fib(n); store low byte -> $C010, high byte -> $C011
    LD A,0
    LD [$C010],A
    LD [$C011],A
    HALT
