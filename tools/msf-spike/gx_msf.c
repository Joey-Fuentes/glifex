/* glifex Bx-14 spike driver -- msf (toprakdeviren/msf, MIT).
 *
 * Reads a Swift file, runs msf_analyze, prints line-oriented markers on stdout
 * in the same shape as the C/C++ harnesses. ONE source, built BOTH native (gcc)
 * and wasm (emcc) -- the outputs are compared byte-for-byte, so a silently
 * degraded wasm build cannot pass unnoticed.
 *
 * The API used here is the MINIMAL set documented in msf's README. It is
 * deliberately small: every extra symbol is another way for a stale README to
 * cost a CI round. The workflow prints the real include/msf.h in full, so if
 * any of this does not match, the next round is exact rather than guessed.
 */
#include <stdio.h>
#include <stdlib.h>
#include <msf.h>

static char *slurp(const char *path, long *out_len) {
    FILE *f = fopen(path, "rb");
    long n;
    char *b;
    size_t got;
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

int main(int argc, char **argv) {
    char *src;
    long len = 0;
    MSFResult *r;
    uint32_t n, i;
    unsigned kids = 0;
    const ASTNode *root;
    const ASTNode *c;

    if (argc < 2) { printf("[FATAL] usage: gx_msf <file.swift>\n"); return 2; }

    src = slurp(argv[1], &len);
    if (!src) { printf("[FATAL] cannot read %s\n", argv[1]); return 2; }
    printf("[FILE] bytes=%ld\n", len);

    r = msf_analyze(src, argv[1]);
    if (!r) { printf("[FATAL] msf_analyze returned NULL\n"); free(src); return 2; }

    n = msf_error_count(r);
    printf("[ERRORS] n=%u\n", (unsigned)n);
    for (i = 0; i < n; i++) {
        printf("[ERR] line=%u col=%u msg=%s\n",
               (unsigned)msf_error_line(r, i),
               (unsigned)msf_error_col(r, i),
               msf_error_message(r, i));
    }

    root = msf_root(r);
    if (root) {
        for (c = root->first_child; c; c = c->next_sibling) {
            printf("[DECL] %s\n", ast_kind_name(c->kind));
            kids++;
        }
    }
    printf("[AST] root_children=%u\n", kids);
    printf("[DONE] errors=%u\n", (unsigned)n);

    msf_result_free(r);
    free(src);
    return n ? 1 : 0;
}
