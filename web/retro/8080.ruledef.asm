; Intel 8080 ruledef for customasm -- classic Intel mnemonics (MOV/MVI/LXI...).
; Encoding follows the octal structure of the 8080 opcode map:
;   x(2) | y(3) | z(3)  with register pairs as rp(2) in bits 5-4.
; Timing/semantics reference: Intel 8080 Microcomputer Systems User's Manual
; (Sep 1975). Executed by web/retro/cpu8080.mjs (validated against the CP/M
; diagnostic ROMs; see web/retro/test-roms/8080/).

; 8-bit register operands: B/C/D/E/H/L/M/A as an octal digit. M is the
; memory cell addressed by HL (not a register).
#subruledef i8080_r {
    B => 0`3
    C => 1`3
    D => 2`3
    E => 3`3
    H => 4`3
    L => 5`3
    M => 6`3
    A => 7`3
}

; Same, minus M -- used to keep the generic MOV rules from matching MOV M,M.
; (customasm lesson, proven by the CLI pipeline guard: a failed $assert in a
; rule BACKTRACKS to any other matching rule; the assert's message only
; surfaces when it is the SOLE candidate. So guards must be paired with
; making the other rules structurally non-overlapping.)
#subruledef i8080_r_nm {
    B => 0`3
    C => 1`3
    D => 2`3
    E => 3`3
    H => 4`3
    L => 5`3
    A => 7`3
}

; Register pairs, Intel style: single letter names the pair (B = BC, D = DE,
; H = HL), plus SP. PSW (A + flags) is legal only in PUSH/POP.
#subruledef i8080_rp {
    B   => 0`2
    D   => 1`2
    H   => 2`2
    SP  => 3`2
    PSW => $assert(0 != 0, "PSW is only valid with PUSH/POP")
}

#subruledef i8080_rp_pushpop {
    B   => 0`2
    D   => 1`2
    H   => 2`2
    PSW => 3`2
    SP  => $assert(0 != 0, "SP cannot be pushed/popped; use PSW or a pair")
}

#ruledef i8080 {
    ; -- moves and immediates ------------------------------------------------
    mov m, m => $assert(0 != 0, "MOV M,M does not exist (its encoding is HLT)")
    mov m, {s: i8080_r_nm}            => 0b01110 @ s
    mov {d: i8080_r_nm}, m            => 0b01 @ d @ 0b110
    mov {d: i8080_r_nm}, {s: i8080_r_nm} => 0b01 @ d @ s
    mvi {d: i8080_r}, {v: i8}      => 0b00 @ d @ 0b110 @ v
    lxi {p: i8080_rp}, {v: i16}    => 0b00 @ p @ 0b0001 @ $le(v)

    ; -- loads/stores --------------------------------------------------------
    stax B => 0x02
    stax D => 0x12
    ldax B => 0x0a
    ldax D => 0x1a
    shld {a: u16} => 0x22 @ $le(a)
    lhld {a: u16} => 0x2a @ $le(a)
    sta  {a: u16} => 0x32 @ $le(a)
    lda  {a: u16} => 0x3a @ $le(a)

    ; -- 16-bit arithmetic / pair ops ----------------------------------------
    inx {p: i8080_rp} => 0b00 @ p @ 0b0011
    dcx {p: i8080_rp} => 0b00 @ p @ 0b1011
    dad {p: i8080_rp} => 0b00 @ p @ 0b1001

    ; -- 8-bit inc/dec -------------------------------------------------------
    inr {d: i8080_r} => 0b00 @ d @ 0b100
    dcr {d: i8080_r} => 0b00 @ d @ 0b101

    ; -- accumulator group ---------------------------------------------------
    add {s: i8080_r} => 0b10000 @ s
    adc {s: i8080_r} => 0b10001 @ s
    sub {s: i8080_r} => 0b10010 @ s
    sbb {s: i8080_r} => 0b10011 @ s
    ana {s: i8080_r} => 0b10100 @ s
    xra {s: i8080_r} => 0b10101 @ s
    ora {s: i8080_r} => 0b10110 @ s
    cmp {s: i8080_r} => 0b10111 @ s
    adi {v: i8} => 0xc6 @ v
    aci {v: i8} => 0xce @ v
    sui {v: i8} => 0xd6 @ v
    sbi {v: i8} => 0xde @ v
    ani {v: i8} => 0xe6 @ v
    xri {v: i8} => 0xee @ v
    ori {v: i8} => 0xf6 @ v
    cpi {v: i8} => 0xfe @ v

    ; -- rotates / flags / misc ----------------------------------------------
    rlc => 0x07
    rrc => 0x0f
    ral => 0x17
    rar => 0x1f
    daa => 0x27
    cma => 0x2f
    stc => 0x37
    cmc => 0x3f
    nop => 0x00
    hlt => 0x76

    ; -- jumps ---------------------------------------------------------------
    jmp {a: u16} => 0xc3 @ $le(a)
    jnz {a: u16} => 0xc2 @ $le(a)
    jz  {a: u16} => 0xca @ $le(a)
    jnc {a: u16} => 0xd2 @ $le(a)
    jc  {a: u16} => 0xda @ $le(a)
    jpo {a: u16} => 0xe2 @ $le(a)
    jpe {a: u16} => 0xea @ $le(a)
    jp  {a: u16} => 0xf2 @ $le(a)
    jm  {a: u16} => 0xfa @ $le(a)
    pchl => 0xe9

    ; -- calls ---------------------------------------------------------------
    call {a: u16} => 0xcd @ $le(a)
    cnz  {a: u16} => 0xc4 @ $le(a)
    cz   {a: u16} => 0xcc @ $le(a)
    cnc  {a: u16} => 0xd4 @ $le(a)
    cc   {a: u16} => 0xdc @ $le(a)
    cpo  {a: u16} => 0xe4 @ $le(a)
    cpe  {a: u16} => 0xec @ $le(a)
    cp   {a: u16} => 0xf4 @ $le(a)
    cm   {a: u16} => 0xfc @ $le(a)

    ; -- returns -------------------------------------------------------------
    ret => 0xc9
    rnz => 0xc0
    rz  => 0xc8
    rnc => 0xd0
    rc  => 0xd8
    rpo => 0xe0
    rpe => 0xe8
    rp  => 0xf0
    rm  => 0xf8

    ; -- stack / exchange ----------------------------------------------------
    push {p: i8080_rp_pushpop} => 0b11 @ p @ 0b0101
    pop  {p: i8080_rp_pushpop} => 0b11 @ p @ 0b0001
    xthl => 0xe3
    xchg => 0xeb
    sphl => 0xf9

    ; -- io / interrupts / restarts -------------------------------------------
    in   {p: u8} => 0xdb @ p
    out  {p: u8} => 0xd3 @ p
    ei   => 0xfb
    di   => 0xf3
    rst  {n: u3} => 0b11 @ n @ 0b111
}
