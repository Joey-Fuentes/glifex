#define solve __glifex_ref_optimized
#include "solution.h"

/* O(n) with a hand-rolled, dynamically-sized open-addressing hash
   map -- see clean.c's comment for why CAP became dynamic; the same
   reasoning applies here, just with the multiplicative hash this
   variant already used. */
JVal *solve(JVal *c) {
    JVal *nums = jget(c, "nums");
    double target = jget(c, "target")->num;
    int n = nums->n;
    int cap = 16;
    while (cap < n * 2) cap <<= 1;
    double *keys = malloc(cap * sizeof(double));
    int *idxs = malloc(cap * sizeof(int));
    int *used = calloc(cap, sizeof(int));
    for (int i = 0; i < n; i++) {
        double need = target - nums->items[i]->num;
        unsigned h = (unsigned)((long long)need * 2654435761u) % cap;
        while (used[h]) {
            if (keys[h] == need) {
                JVal *r = jarr_(2); jpush_(r, jnum_(idxs[h])); jpush_(r, jnum_(i)); return r;
            }
            h = (h + 1) % cap;
        }
        double k = nums->items[i]->num;
        unsigned h2 = (unsigned)((long long)k * 2654435761u) % cap;
        while (used[h2] && keys[h2] != k) h2 = (h2 + 1) % cap;
        keys[h2] = k; idxs[h2] = i; used[h2] = 1;
    }
    return jarr_(0);
}
