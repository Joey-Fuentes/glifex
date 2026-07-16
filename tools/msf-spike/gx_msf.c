/* glifex Bx-14 spike driver -- msf (toprakdeviren/msf, MIT) @ a060d55.
 *
 * ROUND 2. Round 1 died at the native link and never reached the gate, but it
 * dumped include/msf.h and the Makefile in full, which corrected four things:
 *
 *   1. module_stub_find is a deliberate LINK SEAM, not a missing symbol. The
 *      library references it and never defines it; every consumer links
 *      tests/stubs.c alongside -lMiniSwiftFrontend. (Makefile: "stubs.c
 *      supplies module_stub_find ... the linked library references it".)
 *   2. msf_analyze() does NOT consult a vocabulary, so it cannot resolve
 *      import Foundation. The vocab-aware entry point is
 *      msf_analyze_with_vocab(code, filename, vocab). Round 1 would have
 *      reported false errors on the corpus katas and answered the question
 *      backwards.
 *   3. msf_vocab_builtin() returns generated/sdk_vocab.h -- the public types of
 *      the iOS+macOS SDKs, unioned, shared Foundation merged -- baked in so
 *      "import Foundation" resolves with NO SDK PRESENT. That generated header
 *      IS committed to the public repo; only the regeneration tooling is
 *      maintainer-only. This is the whole ballgame for the half-track.
 *   4. The real include set is -Iinclude -Igenerated -Isrc -Isrc/unicode/include.
 *
 * ONE source, built native (gcc, full sdk_vocab.h) and wasm (emcc,
 * -DMSF_WEB_VOCAB -> trimmed sdk_vocab_web.h). Those two vocabs DIFFER BY
 * DESIGN, so only --plain output is compared across builds. The vocab delta is
 * a measurement, not a failure -- it is the vendoring cost of the track.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <msf.h>

static char *slurp(const char *path, long *out_len) {
    FILE *f = fopen(path, "rb");
    long n; char *b; size_t got;
    if (!f) return NULL;
    if (fseek(f, 0, SEEK_END) != 0) { fclose(f); return NULL; }
    n = ftell(f);
    if (n < 0) { fclose(f); return NULL; }
    rewind(f);
    b = (char *)malloc((size_t)n + 1u);
    if (!b) { fclose(f); return NULL; }
    got = fread(b, 1u, (size_t)n, f);
    b[got] = '\0';
    fclose(f);
    *out_len = (long)got;
    return b;
}

/* Types the glifex Swift corpus actually leans on. NSNumber is the decider:
 * problems/002-two-sum/swift/clean.swift does ($0 as! NSNumber).intValue. */
static const char *PROBE_TYPES[] = {
    "String", "Int", "Bool", "Array", "Dictionary",
    "NSNumber", "NSString", "Data", "URL", "Date"
};

static void probe_vocab(void) {
    MSFVocab *v = msf_vocab_builtin();
    size_t mc, i, tt = 0;
    if (!v) { printf("[VOCAB] builtin=NULL\n"); return; }
    mc = msf_vocab_module_count(v);
    printf("[VOCAB] modules=%lu\n", (unsigned long)mc);
    for (i = 0; i < mc; i++) tt += msf_vocab_type_count(v, i);
    printf("[VOCAB] total_types=%lu\n", (unsigned long)tt);
    printf("[VOCAB] foundation_types=%lu\n",
           (unsigned long)msf_vocab_module_type_count(v, "Foundation"));
    for (i = 0; i < mc; i++)
        printf("[VMOD] %s types=%lu\n",
               msf_vocab_module_name(v, i), (unsigned long)msf_vocab_type_count(v, i));
    for (i = 0; i < sizeof(PROBE_TYPES) / sizeof(PROBE_TYPES[0]); i++)
        printf("[HASTYPE] %s=%d\n", PROBE_TYPES[i], msf_vocab_has_type(v, PROBE_TYPES[i]));
    msf_vocab_free(v);
}

int main(int argc, char **argv) {
    int use_vocab = 0, i;
    const char *path = NULL;
    char *src; long len = 0;
    MSFVocab *v = NULL;
    MSFResult *r;
    uint32_t n, e;
    unsigned kids = 0;
    const ASTNode *root; const ASTNode *c;

    for (i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--vocab-probe") == 0) { probe_vocab(); return 0; }
        else if (strcmp(argv[i], "--vocab") == 0) use_vocab = 1;
        else path = argv[i];
    }
    if (!path) { printf("[FATAL] usage: gx_msf <file.swift> [--vocab] | --vocab-probe\n"); return 2; }

    src = slurp(path, &len);
    if (!src) { printf("[FATAL] cannot read %s\n", path); return 2; }
    printf("[FILE] bytes=%ld\n", len);

    if (use_vocab) {
        v = msf_vocab_builtin();
        if (!v) { printf("[FATAL] msf_vocab_builtin returned NULL\n"); free(src); return 2; }
        printf("[MODE] vocab modules=%lu\n", (unsigned long)msf_vocab_module_count(v));
        r = msf_analyze_with_vocab(src, path, v);
    } else {
        printf("[MODE] plain\n");
        r = msf_analyze(src, path);
    }
    if (!r) {
        printf("[FATAL] analyze returned NULL\n");
        if (v) msf_vocab_free(v);
        free(src); return 2;
    }

    n = msf_error_count(r);
    printf("[ERRORS] n=%u\n", (unsigned)n);
    for (e = 0; e < n; e++)
        printf("[ERR] line=%u col=%u msg=%s\n",
               (unsigned)msf_error_line(r, e), (unsigned)msf_error_col(r, e),
               msf_error_message(r, e));

    root = msf_root(r);
    if (root)
        for (c = root->first_child; c; c = c->next_sibling) {
            printf("[DECL] %s\n", ast_kind_name(c->kind));
            kids++;
        }
    printf("[AST] root_children=%u\n", kids);
    printf("[DONE] errors=%u\n", (unsigned)n);

    /* Order matters: the vocab is BORROWED by the result (header, section 5c).
     * Free the result first, then the vocab. */
    msf_result_free(r);
    if (v) msf_vocab_free(v);
    free(src);
    return n ? 1 : 0;
}
