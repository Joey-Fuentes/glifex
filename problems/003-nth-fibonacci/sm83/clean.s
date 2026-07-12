; nth Fibonacci -- Game Boy assembly (SM83), reference (clean)
;
; The SM83 has real 16-bit register pairs, so unlike the 6502 there is no
; hand-rolled carry chaining: HL holds fib(i), DE holds fib(i+1), and
; ADD HL,DE computes their 16-bit sum in ONE instruction.
;
; Each step slides the window (a, b) <- (b, a+b):
;   PUSH DE           save b
;   ADD HL,DE         HL = a + b
;   LD D,H / LD E,L   DE = a + b     (new b)
;   POP HL            HL = old b     (new a)
;
; Result: low byte -> $C010, high byte -> $C011 (little-endian).

    LD HL,0           ; a = fib(0) = 0
    LD DE,1           ; b = fib(1) = 1
    LD A,[$C000]      ; A = n
    LD B,A            ; B is the loop counter
    OR A              ; sets Z if n == 0
    JR Z,done

loop:
    PUSH DE           ; save b
    ADD HL,DE         ; HL = a + b   (16-bit, one instruction)
    LD D,H
    LD E,L            ; DE = a + b   (b' = a + b)
    POP HL            ; HL = old b   (a' = b)
    DEC B
    JR NZ,loop

done:
    LD A,L
    LD [$C010],A      ; result low byte
    LD A,H
    LD [$C011],A      ; result high byte
    HALT
