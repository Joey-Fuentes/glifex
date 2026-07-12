#define solve __glifex_ref_optimized
#include "solution.h"

JVal *solve(JVal *c) {
    const char *s = jget(c, "s")->str, *t = jget(c, "t")->str;
    if (strlen(s) != strlen(t)) return jbool_(0);
    int count[256] = {0};
    for (const unsigned char *p = (const unsigned char *)s; *p; p++) count[*p]++;
    for (const unsigned char *p = (const unsigned char *)t; *p; p++)
        if (--count[*p] < 0) return jbool_(0);
    return jbool_(1);
}
