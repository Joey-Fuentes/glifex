#include "solution.h"

JVal *solve(JVal *c) {
    JVal *nums = jget(c, "nums");
    double target = jget(c, "target")->num;
    for (int i = 0; i < nums->n; i++)
        for (int j = i + 1; j < nums->n; j++)
            if (nums->items[i]->num + nums->items[j]->num == target) {
                JVal *r = jarr_(2); jpush_(r, jnum_(i)); jpush_(r, jnum_(j)); return r;
            }
    return jarr_(0);
}
