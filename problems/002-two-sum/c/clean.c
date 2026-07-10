#define solve __glifex_ref_clean
#include "solution.h"

/* O(n): a simple hash table (open addressing, linear probing) mapping
   each seen number to its index. CAP is sized well above any input
   this Lab currently tests, to keep collisions rare and the code
   simple -- see optimized.c for a more heavily-tuned version. */
JVal *solve(JVal *c) {
    JVal *nums = jget(c, "nums");
    double target = jget(c, "target")->num;

    enum { CAP = 4096 };
    double keys[CAP];
    int indices[CAP];
    int occupied[CAP];
    memset(occupied, 0, sizeof(occupied));

    for (int i = 0; i < nums->n; i++) {
        double need = target - nums->items[i]->num;

        /* Look for `need` already in the table. */
        unsigned slot = (unsigned)((long long)need) % CAP;
        while (occupied[slot]) {
            if (keys[slot] == need) {
                JVal *r = jarr_(2);
                jpush_(r, jnum_(indices[slot]));
                jpush_(r, jnum_(i));
                return r;
            }
            slot = (slot + 1) % CAP;
        }

        /* Not found -- insert this number for future lookups. */
        double v = nums->items[i]->num;
        slot = (unsigned)((long long)v) % CAP;
        while (occupied[slot] && keys[slot] != v) slot = (slot + 1) % CAP;
        keys[slot] = v;
        indices[slot] = i;
        occupied[slot] = 1;
    }
    return jarr_(0);
}
