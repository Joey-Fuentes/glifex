# int optimized(const char *s, const char *t)
# a0 = s, a1 = t. Same counting table as clean, plus an EARLY EXIT: the moment
# a slot goes negative, t holds a character s never had, so they cannot be
# anagrams and there is no point reading the rest.
#
# On the "worst" family -- a true anagram -- nothing ever goes negative, so this
# is clean plus one branch per character of t and the two run neck and neck.
# That is the honest behaviour: an early exit cannot help an input with no early
# exit in it. It wins on the "random" and "best" families, which is where the
# Lab's lower bound lives.
#
# (An earlier attempt tracked a live-slot counter to skip the final 256-slot
# sweep. It won at n=32 and LOST by n=256: it trades a fixed ~1000-instruction
# sweep for ~6 instructions per character, so it grows FASTER than clean. A
# growth lab is exactly the wrong place to optimise a constant at the cost of a
# slope.)
    .text
    .globl optimized
optimized:
    addi    sp, sp, -1024            # int count[256]
    mv      t0, sp
    li      t1, 128
1:  sd      zero, 0(t0)
    addi    t0, t0, 8
    addi    t1, t1, -1
    bnez    t1, 1b
2:  lbu     t1, 0(a0)                # count s up
    beqz    t1, 3f
    slli    t2, t1, 2
    add     t2, sp, t2
    lw      t3, 0(t2)
    addi    t3, t3, 1
    sw      t3, 0(t2)
    addi    a0, a0, 1
    j       2b
3:  lbu     t1, 0(a1)                # discount t
    beqz    t1, 4f
    slli    t2, t1, 2
    add     t2, sp, t2
    lw      t3, 0(t2)
    addi    t3, t3, -1
    bltz    t3, 6f                   # negative -> t has a char s never had
    sw      t3, 0(t2)
    addi    a1, a1, 1
    j       3b
4:  mv      t0, sp                   # all counts must be zero
    li      t1, 256
5:  lw      t3, 0(t0)
    bnez    t3, 6f
    addi    t0, t0, 4
    addi    t1, t1, -1
    bnez    t1, 5b
    li      a0, 1
    addi    sp, sp, 1024
    ret
6:  li      a0, 0
    addi    sp, sp, 1024
    ret
