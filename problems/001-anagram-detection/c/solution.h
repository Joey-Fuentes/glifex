/* The Glifex C contract: implement  JVal *solve(JVal *input);  */
#pragma once
#include "json.h"

static JVal *jbool_(int b) { JVal *v = jnew(J_BOOL); v->b = b; return v; }
static JVal *jnum_(double n) { JVal *v = jnew(J_NUM); v->num = n; return v; }
static JVal *jarr_(int n) { JVal *v = jnew(J_ARR); v->items = malloc((n > 0 ? n : 1) * sizeof(JVal *)); return v; }
static void jpush_(JVal *arr, JVal *x) { arr->items[arr->n++] = x; }
