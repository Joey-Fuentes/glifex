#include "solution.hpp"
#include <unordered_map>

Value practice(const Input& c) {
    auto& nums = c.obj.at("nums")->arr;
    double target = c.obj.at("target")->num;
    std::unordered_map<double, int> seen;
    for (int i = 0; i < (int)nums.size(); i++) {
        double need = target - nums[i]->num;
        if (auto it = seen.find(need); it != seen.end())
            return jarr({jnum(it->second), jnum(i)});
        seen[nums[i]->num] = i;
    }
    return jarr({});
}
