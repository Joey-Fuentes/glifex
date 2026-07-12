; nth Fibonacci -- Intel 8080 assembly, reference (clean)
;
; The 8080's DAD instruction adds a register pair into HL (16-bit, 10 cycles),
; and XCHG swaps HL<->DE in 4 cycles. Together they make the fib window-slide
; (a, b) <- (b, a+b) exactly TWO instructions -- compare the SM83's five
; (PUSH / ADD / LD / LD / POP):
;   XCHG              HL <-> DE      (HL = b, DE = a)
;   DAD D             HL = a + b
; Invariant: after k slides, DE = fib(k) and HL = fib(k+1) -- so the answer
; is read from DE. Loop body: XCHG(4) + DAD(10) + DCR(5) + JNZ(10) = 29
; cycles per step at 2.000 MHz. (Note: 8080 conditional JMPs cost 10 taken
; OR not-taken -- unlike conditional CALL/RET, which are 17/11 and 11/5.)
;
; Result: low byte -> 0xC010, high byte -> 0xC011 (little-endian).

    lxi d, 0          ; DE = fib(0) = 0
    lxi h, 1          ; HL = fib(1) = 1
    lda 0xC000        ; A = n
    ora a             ; sets Z if n == 0 (fib(0) is already in DE)
    jz done
    mov b, a          ; B is the loop counter

loop:
    xchg              ; HL = b, DE = a
    dad d             ; HL = a + b       (DE = fib(k), HL = fib(k+1))
    dcr b
    jnz loop

done:
    mov a, e
    sta 0xC010        ; result low byte
    mov a, d
    sta 0xC011        ; result high byte
    hlt
