#include "solution.hpp"

// O(n^2): check every pair. The "obvious" first approach.
Value bruteforce(const Input& c) {
    auto& nums = c.obj.at("nums")->arr;
    double target = c.obj.at("target")->num;
    for (int i = 0; i < (int)nums.size(); i++) {
        for (int j = i + 1; j < (int)nums.size(); j++) {
            if (nums[i]->num + nums[j]->num == target)
                return jarr({jnum(i), jnum(j)});
        }
    }
    return jarr({});
}
