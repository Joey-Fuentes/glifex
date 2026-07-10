// Generated harness — do not edit. Reads test cases from stdin, dispatches on variant.
#include "solution.hpp"
#include <chrono>
#include <iostream>
#include <sstream>

Value practice(const Input&);
Value clean(const Input&);
Value optimized(const Input&);
__attribute__((weak)) Value bruteforce(const Input&);

int main(int argc, char** argv) {
    std::string variant = argc > 1 ? argv[1] : "practice";
    bool bench = argc > 2 && std::string(argv[2]) == "--bench";
    std::stringstream buf; buf << std::cin.rdbuf();
    auto cases = Json::parse(buf.str());
    auto dispatch = [&](const Input& c) {
        if (variant == "practice") return practice(c);
        if (variant == "brute-force") return bruteforce(c);
        if (variant == "clean") return clean(c);
        return optimized(c);
    };
    if (bench) {
        double best = 1e18;
        for (int r = 0; r < 5; r++) {
            auto t0 = std::chrono::steady_clock::now();
            for (auto& c : cases->arr) dispatch(*c->obj["input"]);
            double per = std::chrono::duration<double, std::nano>(std::chrono::steady_clock::now() - t0).count() / std::max<size_t>(1, cases->arr.size());
            best = std::min(best, per);
        }
        std::cout << "  " << variant << ": ~" << (long long)best << " ns/case (coarse)\n";
        return 0;
    }
    bool metrics = argc > 2 && std::string(argv[2]) == "--metrics";   // L1-metrics-cpp
    int passed = 0, n = (int)cases->arr.size();
    for (int i = 0; i < n; i++) {
        auto& c = cases->arr[i];
        std::string got = dispatch(*c->obj["input"])->dump();
        if (metrics) {
            // Complexity Lab: per-case cost, adaptively repeated past the
            // clock grain (solve is pure by the corpus contract). The result
            // feeds the PASS/FAIL diff above, so -O2 cannot dead-code it.
            long long reps = 1, el = 0;
            for (;;) {
                auto t0 = std::chrono::steady_clock::now();
                for (long long r = 0; r < reps; r++) dispatch(*c->obj["input"]);
                el = (long long)std::chrono::duration<double, std::nano>(std::chrono::steady_clock::now() - t0).count();
                if (el >= 2000000LL || reps >= 1048576) break;
                reps *= 2;
            }
            if (el > 0) std::cout << "  [METRIC] case " << i << " ns=" << (el / reps) << "\n";
        }
        std::string exp = c->obj["expected"]->dump();
        bool ok = got == exp;
        passed += ok;
        std::cout << "  [" << (ok ? "PASS" : "FAIL") << "] case " << i;
        if (!ok) std::cout << "  expected=" << exp << " got=" << got;
        std::cout << "\n";
    }
    std::cout << passed << "/" << n << " passed\n";
    return passed == n ? 0 : 1;
}
