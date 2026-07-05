#define solve __glifex_ref_clean
#include "solution.h"

static int cmpc(const void *a, const void *b) { return *(const char *)a - *(const char *)b; }

JVal *solve(JVal *c) {
    char *s = jstrdup(jget(c, "s")->str), *t = jstrdup(jget(c, "t")->str);
    size_t ls = strlen(s), lt = strlen(t);
    if (ls != lt) return jbool_(0);
    qsort(s, ls, 1, cmpc); qsort(t, lt, 1, cmpc);
    return jbool_(!strcmp(s, t));
}
