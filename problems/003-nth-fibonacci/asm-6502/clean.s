; nth Fibonacci -- 6502 assembly, reference (clean)
;
; Keeps two 16-bit numbers in zero page and iterates n times:
;   a ($00 lo / $01 hi) = fib(i)      b ($02 lo / $03 hi) = fib(i+1)
; Each step computes t = a + b in 16 bits, then slides the window:
; a <- b, b <- t. After n steps, a = fib(n).
;
; The 16-bit add is the classic 6502 idiom: the CPU adds one byte at a
; time, and the CARRY flag chains the bytes together --
;   CLC             clear carry before the low add
;   LDA lo1 / ADC lo2   low bytes (sets carry on overflow past 255)
;   LDA hi1 / ADC hi2   high bytes + that carry, automatically
;
; Result is stored little-endian: low byte -> $12, high byte -> $13.

        lda #0
        sta $00          ; a.lo = 0   (fib(0))
        sta $01          ; a.hi = 0
        sta $03          ; b.hi = 0
        lda #1
        sta $02          ; b.lo = 1   (fib(1))
        ldx $10          ; X = n (loop counter)

loop:   cpx #0
        beq done         ; counted down to zero -> a holds fib(n)

        clc              ; --- t = a + b, 16-bit carry-chained ---
        lda $00
        adc $02
        sta $04          ; t.lo = a.lo + b.lo          (carry set?)
        lda $01
        adc $03
        sta $05          ; t.hi = a.hi + b.hi + carry

        lda $02          ; --- slide the window: a <- b ---
        sta $00
        lda $03
        sta $01
        lda $04          ; --- b <- t ---
        sta $02
        lda $05
        sta $03

        dex
        jmp loop

done:   lda $00
        sta $12          ; result low byte  -> $12
        lda $01
        sta $13          ; result high byte -> $13
        brk
