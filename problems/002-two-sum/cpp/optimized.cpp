#include "solution.hpp"
#include <cstring>

// Optimized: same O(n) time as clean.cpp, but a hand-rolled,
// fixed-size open-addressing table instead of std::unordered_map --
// avoids per-insertion heap allocation and std::hash's generality
// overhead. Same technique as the C track's optimized.c.
Value optimized(const Input& c) {
    auto& nums = c.obj.at("nums")->arr;
    double target = c.obj.at("target")->num;

    constexpr int CAP = 4096;
    static double keys[CAP];
    static int idxs[CAP];
    static bool used[CAP];
    std::memset(used, 0, sizeof(used));

    int n = (int)nums.size();
    for (int i = 0; i < n; i++) {
        double need = target - nums[i]->num;
        unsigned h = (unsigned)((long long)need * 2654435761u) % CAP;
        while (used[h]) {
            if (keys[h] == need) return jarr({jnum(idxs[h]), jnum(i)});
            h = (h + 1) % CAP;
        }
        double k = nums[i]->num;
        unsigned h2 = (unsigned)((long long)k * 2654435761u) % CAP;
        while (used[h2] && keys[h2] != k) h2 = (h2 + 1) % CAP;
        keys[h2] = k; idxs[h2] = i; used[h2] = true;
    }
    return jarr({});
}
