#define solve __glifex_ref_clean
#include "solution.h"

/* O(n): a simple hash table (open addressing, linear probing) mapping
   each seen number to its index. Table size is computed from the
   actual input (next power of 2 above 2n, keeping load factor under
   50% for any n) rather than a fixed constant -- a fixed CAP
   previously caused an infinite loop once more unique keys needed
   inserting than the table had room for (trivially reached once the
   Complexity Lab's ladder grew past a few thousand): the insertion
   loop searches for an empty slot that no longer exists and cycles
   forever. See optimized.c for a more heavily-tuned version. */
JVal *solve(JVal *c) {
    JVal *nums = jget(c, "nums");
    double target = jget(c, "target")->num;

    int n = nums->n;
    int cap = 16;
    while (cap < n * 2) cap <<= 1;
    double *keys = malloc(cap * sizeof(double));
    int *indices = malloc(cap * sizeof(int));
    int *occupied = calloc(cap, sizeof(int));

    for (int i = 0; i < n; i++) {
        double need = target - nums->items[i]->num;

        /* Look for `need` already in the table. */
        unsigned slot = (unsigned)((long long)need) % cap;
        while (occupied[slot]) {
            if (keys[slot] == need) {
                JVal *r = jarr_(2);
                jpush_(r, jnum_(indices[slot]));
                jpush_(r, jnum_(i));
                return r;
            }
            slot = (slot + 1) % cap;
        }

        /* Not found -- insert this number for future lookups. */
        double v = nums->items[i]->num;
        slot = (unsigned)((long long)v) % cap;
        while (occupied[slot] && keys[slot] != v) slot = (slot + 1) % cap;
        keys[slot] = v;
        indices[slot] = i;
        occupied[slot] = 1;
    }
    return jarr_(0);
}
