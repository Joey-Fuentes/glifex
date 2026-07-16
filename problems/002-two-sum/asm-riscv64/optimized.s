# void optimized(const long *nums, long n, long target, long *out)
# a0=nums, a1=n, a2=target, a3=out
#
# The same single-pass hash map as clean, but with a Fibonacci (multiply-shift)
# hash instead of masking the low bits. Masking clusters badly on the inputs this
# problem attracts -- consecutive or evenly-spaced values collide into adjacent
# slots and linear probing degrades. Multiplying by the 64-bit golden ratio and
# taking the HIGH bits spreads them, so the probe chains stay short. Same O(n)
# time and O(n) space; fewer instructions per lookup in practice.
#
# Single-pass hash map with linear probing, in a STACK-allocated table:
# cap = next power of two >= 2n, 16 bytes per slot (key, index+1). A slot with
# index 0 is empty, so index+1 is stored and 0 is the sentinel -- nums may
# legitimately contain 0.
#
# O(n) time, O(n) space. The table is on the stack rather than the heap because
# the browser runs this on libriscv, which simulates a CPU and not a kernel --
# there is no mmap behind an ecall. At the Lab's top rung (n=512) the table is
# 16 KB. See docs/libriscv-riscv64.md.
    .text
    .globl optimized
optimized:
    addi    sp, sp, -16
    sd      s0, 8(sp)
    mv      s0, sp                   # frame anchor: restore sp from here
    slli    t0, a1, 1                # 2n
    li      t1, 16
    bge     t0, t1, 1f
    mv      t0, t1                   # floor: tiny inputs still get a table
1:  li      t1, 1                    # cap = next pow2 >= 2n
2:  bge     t1, t0, 3f
    slli    t1, t1, 1
    j       2b
3:  addi    t2, t1, -1               # mask, for wrapping the probe
    # shift = 64 - log2(cap), for the multiply-shift hash
    li      a6, 0
    mv      a7, t1
31: srli    a7, a7, 1
    beqz    a7, 32f
    addi    a6, a6, 1
    j       31b
32: li      a7, 64
    sub     a6, a7, a6               # a6 = 64 - bits
    li      a7, 0x9E3779B9           # 2^64 / phi, built in two halves
    slli    a7, a7, 32
    li      t3, 0x7F4A7C15
    add     a7, a7, t3               # a7 = 0x9E3779B97F4A7C15
    slli    t3, t1, 4                # cap * 16 bytes
    sub     sp, sp, t3
    andi    sp, sp, -16              # 16-byte aligned table base
    mv      t3, sp                   # zero it
    mv      t4, t1
4:  sd      zero, 0(t3)
    sd      zero, 8(t3)
    addi    t3, t3, 16
    addi    t4, t4, -1
    bnez    t4, 4b
    li      t0, 0                    # i = 0
5:  bge     t0, a1, 12f
    slli    t3, t0, 3
    add     t3, a0, t3
    ld      t4, 0(t3)                # v = nums[i]
    sub     t5, a2, t4               # want = target - v
    mul     t6, t5, a7               # Fibonacci hash: (want * phi) >> shift
    srl     t6, t6, a6
6:  slli    t3, t6, 4
    add     t3, sp, t3
    ld      a4, 8(t3)                # stored index+1 (0 = empty)
    beqz    a4, 9f                   # empty -> want not seen yet
    ld      a5, 0(t3)
    bne     a5, t5, 7f
    addi    a4, a4, -1               # stored index+1
    sd      a4, 0(a3)                # out[0] = earlier index
    sd      t0, 8(a3)                # out[1] = i
    j       13f
7:  addi    t6, t6, 1
    and     t6, t6, t2
    j       6b
9:  mul     t6, t4, a7               # insert v -> i, same hash
    srl     t6, t6, a6
10: slli    t3, t6, 4
    add     t3, sp, t3
    ld      a4, 8(t3)
    beqz    a4, 11f
    addi    t6, t6, 1
    and     t6, t6, t2
    j       10b
11: sd      t4, 0(t3)
    addi    a4, t0, 1
    sd      a4, 8(t3)
    addi    t0, t0, 1
    j       5b
12: li      t3, -1
    sd      t3, 0(a3)
    sd      t3, 8(a3)
13: mv      sp, s0
    ld      s0, 8(sp)
    addi    sp, sp, 16
    ret
