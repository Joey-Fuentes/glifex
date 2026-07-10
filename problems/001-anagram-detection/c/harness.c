/* Generated harness — do not edit. Reads ../test_cases.json, dispatches on variant. */
#define _POSIX_C_SOURCE 200809L  /* clock_gettime under strict -std=c11 */
#include "solution.h"
#include <time.h>

/* Practice slot: the same "solve" name every language in this Lab uses
   -- see solution.h's own contract comment. clean.c/optimized.c ALSO
   define "solve" (matching that same convention, so the reference panel
   shows clean, copyable code) but rename their OWN symbol away from the
   bare name via a `#define solve __glifex_ref_<variant>` line at the top
   of each file, so all three can be compiled and linked together
   without colliding -- practice.c's real, unrenamed "solve" is the only
   one left with that name in the final binary. */
JVal *solve(JVal *c);
JVal *__glifex_ref_bruteforce(JVal *c) __attribute__((weak));
JVal *__glifex_ref_clean(JVal *c);
JVal *__glifex_ref_optimized(JVal *c);

static char *read_file(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) { fprintf(stderr, "cannot open %s\n", path); exit(2); }
    fseek(f, 0, SEEK_END); long n = ftell(f); rewind(f);
    char *buf = malloc(n + 1);
    if (fread(buf, 1, n, f) != (size_t)n) { fprintf(stderr, "read error\n"); exit(2); }
    buf[n] = 0; fclose(f); return buf;
}

int main(int argc, char **argv) {
    const char *variant = argc > 1 ? argv[1] : "practice";
    int bench = argc > 2 && !strcmp(argv[2], "--bench");
    JVal *cases = json_parse(read_file("../test_cases.json"));
    JVal *(*fn)(JVal *) = !strcmp(variant, "practice") ? solve
                        : !strcmp(variant, "brute-force") ? __glifex_ref_bruteforce
                        : !strcmp(variant, "clean") ? __glifex_ref_clean : __glifex_ref_optimized;
    if (bench) {
        double best = 1e18;
        for (int r = 0; r < 5; r++) {
            struct timespec t0, t1;
            clock_gettime(CLOCK_MONOTONIC, &t0);
            for (int i = 0; i < cases->n; i++) fn(jget(cases->items[i], "input"));
            clock_gettime(CLOCK_MONOTONIC, &t1);
            double per = ((t1.tv_sec - t0.tv_sec) * 1e9 + (t1.tv_nsec - t0.tv_nsec)) / (cases->n > 0 ? cases->n : 1);
            if (per < best) best = per;
        }
        printf("  %s: ~%lld ns/case (coarse)\n", variant, (long long)best);
        return 0;
    }
    int metrics = argc > 2 && !strcmp(argv[2], "--metrics");   /* L1-metrics-c */
    int passed = 0;
    for (int i = 0; i < cases->n; i++) {
        JVal *in = jget(cases->items[i], "input");
        char *got = jdumps(fn(in));
        if (metrics) {
            /* Complexity Lab: per-case cost, adaptively repeated past the
               clock grain (solve is pure by the corpus contract); compile
               and startup are excluded by construction. */
            long long reps = 1, el = 0;
            for (;;) {
                struct timespec t0, t1;
                clock_gettime(CLOCK_MONOTONIC, &t0);
                for (long long r = 0; r < reps; r++) fn(in);
                clock_gettime(CLOCK_MONOTONIC, &t1);
                el = (t1.tv_sec - t0.tv_sec) * 1000000000LL + (t1.tv_nsec - t0.tv_nsec);
                if (el >= 2000000LL || reps >= 1048576) break;
                reps *= 2;
            }
            if (el > 0) printf("  [METRIC] case %d ns=%lld\n", i, el / reps);
        }
        char *exp = jdumps(jget(cases->items[i], "expected"));
        int ok = !strcmp(got, exp);
        passed += ok;
        printf("  [%s] case %d", ok ? "PASS" : "FAIL", i);
        if (!ok) printf("  expected=%s got=%s", exp, got);
        printf("\n");
    }
    printf("%d/%d passed\n", passed, cases->n);
    return passed == cases->n ? 0 : 1;
}
