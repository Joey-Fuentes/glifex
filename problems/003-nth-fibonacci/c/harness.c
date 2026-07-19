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
/* Weak DEFINITION, not a bare declaration: an undefined weak reference
   links to zero on ELF (Linux) but is an "Undefined symbols" link error
   on Mach-O (macOS) and PE (MinGW). A weak definition links cleanly on all
   three and is overridden by the strong symbol in brute-force.c when the
   problem ships one. */
JVal *__glifex_ref_bruteforce(JVal *c) __attribute__((weak));
JVal *__glifex_ref_bruteforce(JVal *c) { (void)c; fprintf(stderr, "brute-force reference not provided\n"); exit(2); }
JVal *__glifex_ref_clean(JVal *c);
JVal *__glifex_ref_optimized(JVal *c);

static char *read_file(const char *path) {
    printf("[BEFORE-OPEN] %s\n", path); fflush(stdout);
    FILE *f = fopen(path, "rb");
    if (!f) { fprintf(stderr, "cannot open %s\n", path); exit(2); }
    printf("[AFTER-OPEN]\n"); fflush(stdout);
    fseek(f, 0, SEEK_END); long n = ftell(f); rewind(f);
    char *buf = malloc(n + 1);
    if (fread(buf, 1, n, f) != (size_t)n) { fprintf(stderr, "read error\n"); exit(2); }
    buf[n] = 0; fclose(f);
    printf("[AFTER-READ] len=%ld\n", n); fflush(stdout);
    return buf;
}

#ifdef __wasm__
/* L4 space: counters DEFINED here; the -include'd gx_prelude.h declares them
   extern and routes every allocation through the tracking wrappers. */
long __gx_live = 0, __gx_peak = 0;
static volatile size_t __gx_sink = 0;
#endif

int main(int argc, char **argv) {
    printf("[MAIN-START]\n"); fflush(stdout);
    const char *variant = argc > 1 ? argv[1] : "practice";
    int bench = argc > 2 && !strcmp(argv[2], "--bench");
    char *raw = read_file("../test_cases.json");
    JVal *cases = json_parse(raw);
    printf("[AFTER-JSON-PARSE] n=%d\n", cases->n); fflush(stdout);
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
        /* Diagnostic breadcrumb: flushed immediately, before any work on
           this case, so a crash mid-case still leaves a record of
           exactly how far processing got (which case, and by cross-
           referencing the Lab's ladder, roughly what input size) --
           the alternative is a crash with no indication of where in a
           30+-case Analyze run it happened. */
        printf("[CASE-BEGIN] case %d\n", i); fflush(stdout);
        char *got = jdumps(fn(in));
        if (metrics) {
#ifdef __wasm__
            /* L4 space: peak concurrent heap bytes (bracket the solve with a peak
               reset; the result pointer is consumed so the call is never elided),
               plus a bounded stack poison-scan. Gated to the wasm build; native
               gcc verify never compiles this. */
            {
                long __hbase = __gx_live; __gx_peak = __gx_live;
                JVal *__r = fn(in); __gx_sink ^= (size_t)(void *)__r;
                long __gxh = __gx_peak - __hbase;
                long __gxs = 0;
                {
                    /* Poison a window BELOW the current frame, run the solve, and see
                       how deep it was overwritten. Self-bounding: cap the window to
                       (sp - guard) so it can never underflow past address 0 and trap,
                       which is what a fixed window did on WASIX's low-placed stack. */
                    volatile char __probe; char *__sp = (char *)&__probe;
                    long __win = 96 * 1024;
                    long __avail = (long)(unsigned long)__sp - 8192;
                    if (__win > __avail) __win = __avail;
                    if (__win >= 4096) {
                        memset(__sp - __win, 0xA5, __win);
                        JVal *__r2 = fn(in); __gx_sink ^= (size_t)(void *)__r2;
                        for (long k = 0; k < __win; k++)
                            if ((unsigned char)(__sp - __win)[k] != 0xA5) { __gxs = __win - k; break; }
                    }
                }
                printf("  [SPACE] case %d heap=%ld stack=%ld\n", i, __gxh, __gxs);
            }
#endif
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
