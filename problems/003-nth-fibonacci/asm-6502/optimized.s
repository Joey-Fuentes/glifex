; nth Fibonacci -- 6502 assembly, reference (optimized)
; Same O(n) carry-chained algorithm as clean; trims memory traffic by
; carrying one leg of the window-slide through registers (A/Y) instead of
; bouncing every byte through zero page. Result: lo -> $12, hi -> $13.

        lda #0
        sta $00          ; a.lo
        sta $01          ; a.hi
        sta $03          ; b.hi
        lda #1
        sta $02          ; b.lo
        ldx $10          ; X = n

loop:   cpx #0
        beq done
        clc
        lda $00
        adc $02          ; A = t.lo
        tay              ; Y caches t.lo (skip one zp store/load)
        lda $01
        adc $03          ; A = t.hi (carry chained)
        pha              ; stack caches t.hi
        lda $02          ; a <- b
        sta $00
        lda $03
        sta $01
        sty $02          ; b.lo <- t.lo (from Y)
        pla
        sta $03          ; b.hi <- t.hi (from stack)
        dex
        jmp loop

done:   lda $00
        sta $12
        lda $01
        sta $13
        brk
