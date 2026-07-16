// int brute_force(const char *s, const char *t)
// Naive O(n*m): equal lengths, and every char of s occurs equally often in
// s and t. No table -- rescan both strings for each character of s.
    .text
    .globl brute_force
.globl _brute_force
brute_force:
_brute_force:
    mov     x2, x0                   // strlen(s)
1:  ldrb    w3, [x2], #1
    cbnz    w3, 1b
    sub     x2, x2, x0
    sub     x2, x2, #1
    mov     x3, x1                   // strlen(t)
2:  ldrb    w4, [x3], #1
    cbnz    w4, 2b
    sub     x3, x3, x1
    sub     x3, x3, #1
    cmp     x2, x3
    b.ne    9f                       // different lengths -> not an anagram
    mov     x4, x0                   // for each char c of s
3:  ldrb    w5, [x4], #1
    cbz     w5, 8f                   // end of s -> every count matched
    mov     x6, #0                   // count c in s
    mov     x7, x0
4:  ldrb    w8, [x7], #1
    cbz     w8, 5f
    cmp     w8, w5
    cinc    x6, x6, eq
    b       4b
5:  mov     x9, #0                   // count c in t
    mov     x10, x1
6:  ldrb    w8, [x10], #1
    cbz     w8, 7f
    cmp     w8, w5
    cinc    x9, x9, eq
    b       6b
7:  cmp     x6, x9
    b.ne    9f                       // counts differ -> not an anagram
    b       3b
8:  mov     w0, #1
    ret
9:  mov     w0, #0
    ret
