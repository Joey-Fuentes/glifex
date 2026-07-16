/* Minimal JSON parser (C has no stdlib JSON). Vendored, dependency-free.
 * Short-lived test process: allocations are intentionally not freed. */
#pragma once
#include <ctype.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef enum { J_NULL, J_BOOL, J_NUM, J_STR, J_ARR, J_OBJ } JType;

typedef struct JVal {
    JType type;
    int b;
    double num;
    char *str;
    struct JVal **items;   /* arrays */
    char **keys;           /* objects */
    struct JVal **vals;
    int n;
} JVal;

static const char *jp;

static JVal *jnew(JType t) { JVal *v = calloc(1, sizeof(JVal)); v->type = t; return v; }
static void jws(void) { while (*jp && isspace((unsigned char)*jp)) jp++; }

static char *jstr_(void) {
    jp++; /* opening quote */
    char *buf = malloc(strlen(jp) + 1); int n = 0;
    while (*jp != '"') {
        char c = *jp++;
        if (c == '\\') { char e = *jp++; buf[n++] = e == 'n' ? '\n' : e == 't' ? '\t' : e; }
        else buf[n++] = c;
    }
    jp++; buf[n] = 0; return buf;
}

static JVal *jvalue(void);

static JVal *jvalue(void) {
    jws();
    if (*jp == '{') {
        JVal *v = jnew(J_OBJ); jp++; jws();
        if (*jp == '}') { jp++; return v; }
        int cap = 8; v->keys = malloc(cap * sizeof(char *)); v->vals = malloc(cap * sizeof(JVal *));
        while (1) {
            jws(); char *k = jstr_(); jws(); jp++; /* ':' */
            if (v->n == cap) { cap *= 2; v->keys = realloc(v->keys, cap * sizeof(char *)); v->vals = realloc(v->vals, cap * sizeof(JVal *)); }
            v->keys[v->n] = k; v->vals[v->n] = jvalue(); v->n++;
            jws(); if (*jp == ',') { jp++; continue; } jp++; break;
        }
        return v;
    }
    if (*jp == '[') {
        JVal *v = jnew(J_ARR); jp++; jws();
        if (*jp == ']') { jp++; return v; }
        int cap = 8; v->items = malloc(cap * sizeof(JVal *));
        while (1) {
            if (v->n == cap) { cap *= 2; v->items = realloc(v->items, cap * sizeof(JVal *)); }
            v->items[v->n++] = jvalue();
            jws(); if (*jp == ',') { jp++; continue; } jp++; break;
        }
        return v;
    }
    if (*jp == '"') { JVal *v = jnew(J_STR); v->str = jstr_(); return v; }
    if (*jp == 't') { JVal *v = jnew(J_BOOL); v->b = 1; jp += 4; return v; }
    if (*jp == 'f') { JVal *v = jnew(J_BOOL); v->b = 0; jp += 5; return v; }
    if (*jp == 'n') { jp += 4; return jnew(J_NULL); }
    JVal *v = jnew(J_NUM); char *end;
    v->num = strtod(jp, &end); jp = end; return v;
}

static JVal *json_parse(const char *src) { jp = src; return jvalue(); }

static JVal *jget(JVal *obj, const char *key) {
    for (int i = 0; i < obj->n; i++)
        if (!strcmp(obj->keys[i], key)) return obj->vals[i];
    return NULL;
}


/* Portable string builder (replaces POSIX open_memstream; works on MinGW). */
typedef struct { char *buf; size_t len, cap; } SB;
static void sb_put(SB *sb, const char *s) {
    size_t n = strlen(s);
    if (sb->len + n + 1 > sb->cap) {
        sb->cap = (sb->cap ? sb->cap * 2 : 128) + n;
        sb->buf = realloc(sb->buf, sb->cap);
    }
    memcpy(sb->buf + sb->len, s, n + 1); sb->len += n;
}

static void jdump_sb(JVal *v, SB *out) {
    char tmp[64];
    switch (v->type) {
        case J_NULL: sb_put(out, "null"); break;
        case J_BOOL: sb_put(out, v->b ? "true" : "false"); break;
        case J_NUM: {
            double ip;
            if (modf(v->num, &ip) == 0.0) snprintf(tmp, sizeof tmp, "%lld", (long long)v->num);
            else snprintf(tmp, sizeof tmp, "%g", v->num);
            sb_put(out, tmp); break; }
        case J_STR: sb_put(out, "\""); sb_put(out, v->str); sb_put(out, "\""); break;
        case J_ARR: sb_put(out, "[");
            for (int i = 0; i < v->n; i++) { if (i) sb_put(out, ","); jdump_sb(v->items[i], out); }
            sb_put(out, "]"); break;
        case J_OBJ: sb_put(out, "{");
            for (int i = 0; i < v->n; i++) {
                if (i) sb_put(out, ",");
                sb_put(out, "\""); sb_put(out, v->keys[i]); sb_put(out, "\":");
                jdump_sb(v->vals[i], out);
            }
            sb_put(out, "}"); break;
    }
}

static char *jdumps(JVal *v) {
    SB sb = {0};
    sb_put(&sb, "");
    jdump_sb(v, &sb);
    return sb.buf;
}

/* Portable strdup (not in strict C11). */
static char *jstrdup(const char *s) {
    char *d = malloc(strlen(s) + 1); strcpy(d, s); return d;
}
