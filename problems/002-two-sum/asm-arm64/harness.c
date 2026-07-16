/* Per-problem C shim for the assembly track (two-sum).
 *     void <variant>(const long *nums, long n, long target, long *out);
 *     out[0], out[1] = indices (i < j); {-1,-1} if none.
 */
#define _POSIX_C_SOURCE 200809L
#include "json.h"
#include <time.h>

extern void practice(const long *nums, long n, long target, long *out);
extern void clean(const long *nums, long n, long target, long *out);
extern void optimized(const long *nums, long n, long target, long *out);
extern void brute_force(const long *nums, long n, long target, long *out);

static char *read_file(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) { fprintf(stderr, "cannot open %s\n", path); exit(2); }
    fseek(f, 0, SEEK_END); long n = ftell(f); rewind(f);
    char *buf = malloc(n + 1);
    if (fread(buf, 1, n, f) != (size_t)n) exit(2);
    buf[n] = 0; fclose(f); return buf;
}

static long *to_arr(JVal *nums, long *n_out) {
    long n = nums->n; *n_out = n;
    long *a = malloc((n ? n : 1) * sizeof(long));
    for (long k = 0; k < n; k++) a[k] = (long)nums->items[k]->num;
    return a;
}

int main(int argc, char **argv) {
    const char *variant = argc > 1 ? argv[1] : "practice";
    int bench = argc > 2 && !strcmp(argv[2], "--bench");
    JVal *cases = json_parse(read_file("../test_cases.json"));
    void (*fn)(const long *, long, long, long *) =
        !strcmp(variant, "practice") ? practice :
        !strcmp(variant, "clean") ? clean :
        !strcmp(variant, "brute-force") ? brute_force : optimized;
    if (bench) {
        double best = 1e18;
        for (int r = 0; r < 5; r++) {
            struct timespec t0, t1;
            clock_gettime(CLOCK_MONOTONIC, &t0);
            for (int i = 0; i < cases->n; i++) {
                JVal *in = jget(cases->items[i], "input");
                long n; long *a = to_arr(jget(in, "nums"), &n);
                long out[2] = {-1, -1};
                fn(a, n, (long)jget(in, "target")->num, out);
                free(a);
            }
            clock_gettime(CLOCK_MONOTONIC, &t1);
            double per = ((t1.tv_sec - t0.tv_sec) * 1e9 + (t1.tv_nsec - t0.tv_nsec)) / (cases->n ? cases->n : 1);
            if (per < best) best = per;
        }
        printf("  %s: ~%lld ns/case (coarse)\n", variant, (long long)best);
        return 0;
    }
    int passed = 0;
    for (int i = 0; i < cases->n; i++) {
        JVal *in = jget(cases->items[i], "input");
        long n; long *a = to_arr(jget(in, "nums"), &n);
        long out[2] = {-1, -1};
        fn(a, n, (long)jget(in, "target")->num, out);
        free(a);
        JVal *exp = jget(cases->items[i], "expected");
        long e0 = (long)exp->items[0]->num, e1 = (long)exp->items[1]->num;
        int ok = out[0] == e0 && out[1] == e1;
        passed += ok;
        printf("  [%s] case %d", ok ? "PASS" : "FAIL", i);
        if (!ok) printf("  expected=[%ld,%ld] got=[%ld,%ld]", e0, e1, out[0], out[1]);
        printf("\n");
    }
    printf("%d/%d passed\n", passed, cases->n);
    return passed == cases->n ? 0 : 1;
}
