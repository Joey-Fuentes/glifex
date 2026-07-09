; nth Fibonacci -- Intel 8080 assembly, reference (optimized)
;
; The clean loop's fib step is already minimal (XCHG + DAD = 14 cycles); what
; can be trimmed is loop overhead (DCR + JNZ = 15 cycles per step!). This
; version unrolls 2x: odd n peels one step, then each iteration does TWO fib
; steps with ONE DCR/JNZ. Per step: clean 29 cycles -> unrolled 21.5.
; For fib(20): 580 -> 430 loop cycles, measurable in the deterministic
; cycle counter at the 2.000 MHz reference clock.
;
; The 8080 has no shift instructions -- n/2 is done with RAR (rotate right
; through carry) after ORA A clears CY: A = n>>1, CY = n odd?
;
; Invariant as in clean: after k slides DE = fib(k); result read from DE.

    lxi d, 0          ; DE = fib(0) = 0
    lxi h, 1          ; HL = fib(1) = 1
    lda 0xC000        ; A = n
    ora a             ; Z if n == 0; also clears CY for the RAR below
    jz done
    rar               ; A = n/2, CY = n odd?
    jnc even
    xchg              ; --- peel one step for odd n ---
    dad d
even:
    ora a             ; n/2 == 0? (n was 1 -> the peeled step was all of it)
    jz done

loop:
    xchg              ; --- step 1 ---
    dad d
    xchg              ; --- step 2 ---
    dad d
    dcr a             ; one DCR/JNZ per TWO steps
    jnz loop

done:
    mov a, e
    sta 0xC010        ; result low byte
    mov a, d
    sta 0xC011        ; result high byte
    hlt
