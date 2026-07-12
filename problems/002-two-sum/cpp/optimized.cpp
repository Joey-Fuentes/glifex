#include "solution.hpp"
#include <vector>

// Optimized: same O(n) time as clean.cpp, but a hand-rolled
// open-addressing table instead of std::unordered_map -- avoids
// per-INSERTION heap allocation and std::hash's generality overhead.
// Same technique as the C track's optimized.c.
//
// Table size is computed from the actual input (next power of 2 above
// 2n, keeping load factor under 50% for any n) rather than a fixed
// constant -- a fixed CAP previously caused an infinite loop once
// more unique keys needed inserting than the table had room for
// (trivially reached once the Complexity Lab's ladder grew past a
// few thousand): the insertion loop searches for an empty slot that
// no longer exists and cycles forever. One vector allocation per
// call, sized correctly up front, is still far cheaper than
// unordered_map's per-insertion allocations -- the technique's whole
// point -- while being correct at any input size.
Value optimized(const Input& c) {
    auto& nums = c.obj.at("nums")->arr;
    double target = c.obj.at("target")->num;

    int n = (int)nums.size();
    int cap = 16;
    while (cap < n * 2) cap <<= 1;

    std::vector<double> keys(cap);
    std::vector<int> idxs(cap);
    std::vector<bool> used(cap, false);

    for (int i = 0; i < n; i++) {
        double need = target - nums[i]->num;
        unsigned h = (unsigned)((long long)need * 2654435761u) % cap;
        while (used[h]) {
            if (keys[h] == need) return jarr({jnum(idxs[h]), jnum(i)});
            h = (h + 1) % cap;
        }
        double k = nums[i]->num;
        unsigned h2 = (unsigned)((long long)k * 2654435761u) % cap;
        while (used[h2] && keys[h2] != k) h2 = (h2 + 1) % cap;
        keys[h2] = k; idxs[h2] = i; used[h2] = true;
    }
    return jarr({});
}
