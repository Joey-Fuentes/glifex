/* Per-problem C shim for the assembly track (numeric).
 *     long <variant>(long n);   // returns fib(n)
 */
#define _POSIX_C_SOURCE 200809L
#include "json.h"
#include <time.h>

extern long practice(long n);
extern long clean(long n);
extern long optimized(long n);
extern long brute_force(long n);

static char *read_file(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) { fprintf(stderr, "cannot open %s\n", path); exit(2); }
    fseek(f, 0, SEEK_END); long n = ftell(f); rewind(f);
    char *buf = malloc(n + 1);
    if (fread(buf, 1, n, f) != (size_t)n) exit(2);
    buf[n] = 0; fclose(f); return buf;
}

int main(int argc, char **argv) {
    const char *variant = argc > 1 ? argv[1] : "practice";
    int bench = argc > 2 && !strcmp(argv[2], "--bench");
    JVal *cases = json_parse(read_file("../test_cases.json"));
    long (*fn)(long) =
        !strcmp(variant, "practice") ? practice :
        !strcmp(variant, "clean") ? clean :
        !strcmp(variant, "brute-force") ? brute_force : optimized;
    if (bench) {
        double best = 1e18;
        for (int r = 0; r < 5; r++) {
            struct timespec t0, t1;
            clock_gettime(CLOCK_MONOTONIC, &t0);
            for (int i = 0; i < cases->n; i++)
                fn((long)jget(jget(cases->items[i], "input"), "n")->num);
            clock_gettime(CLOCK_MONOTONIC, &t1);
            double per = ((t1.tv_sec - t0.tv_sec) * 1e9 + (t1.tv_nsec - t0.tv_nsec)) / (cases->n ? cases->n : 1);
            if (per < best) best = per;
        }
        printf("  %s: ~%lld ns/case (coarse)\n", variant, (long long)best);
        return 0;
    }
    int passed = 0;
    for (int i = 0; i < cases->n; i++) {
        long n = (long)jget(jget(cases->items[i], "input"), "n")->num;
        long got = fn(n);
        long exp = (long)jget(cases->items[i], "expected")->num;
        int ok = got == exp;
        passed += ok;
        printf("  [%s] case %d", ok ? "PASS" : "FAIL", i);
        if (!ok) printf("  expected=%ld got=%ld", exp, got);
        printf("\n");
    }
    printf("%d/%d passed\n", passed, cases->n);
    return passed == cases->n ? 0 : 1;
}
