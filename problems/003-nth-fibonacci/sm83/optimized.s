; nth Fibonacci -- Game Boy assembly (SM83), reference (optimized)
; The clean loop is already near-minimal on the SM83 (ADD only targets HL, so
; the window-slide can't be eliminated). What CAN be trimmed is branch
; overhead: this version unrolls the loop 2x -- odd n peels one step, then
; each iteration does TWO fib steps with ONE loop branch. For fib(20):
; 10 branches instead of 20. Result: lo -> $C010, hi -> $C011.

    LD HL,0           ; a = 0
    LD DE,1           ; b = 1
    LD A,[$C000]      ; A = n
    OR A
    JR Z,done         ; fib(0) = 0
    SRL A             ; A = n/2, carry = n odd?
    JR NC,evenN
    PUSH DE           ; --- peel one step for odd n ---
    ADD HL,DE
    LD D,H
    LD E,L
    POP HL
evenN:
    OR A              ; n/2 == 0? (n was 1 -> peeled step was all of it)
    JR Z,done

loop:
    PUSH DE           ; --- step 1 ---
    ADD HL,DE
    LD D,H
    LD E,L
    POP HL
    PUSH DE           ; --- step 2 ---
    ADD HL,DE
    LD D,H
    LD E,L
    POP HL
    DEC A             ; one branch per TWO steps
    JR NZ,loop

done:
    LD A,L
    LD [$C010],A
    LD A,H
    LD [$C011],A
    HALT
