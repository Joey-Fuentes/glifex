// Generated harness — do not edit. Reads test cases from stdin, dispatches on variant.
#include "solution.hpp"
#include <chrono>
#include <iostream>
#include <sstream>
#include <cstdlib>
#include <cstring>
#include <new>

Value practice(const Input&);
Value clean(const Input&);
Value optimized(const Input&);
// Weak DEFINITION, not a bare declaration: an undefined weak reference
// links to zero on ELF (Linux) but is an "Undefined symbols" link error on
// Mach-O (macOS) and PE (MinGW). A weak definition links cleanly on all three
// and is overridden by the strong symbol in brute-force.cpp when present.
__attribute__((weak)) Value bruteforce(const Input&);
__attribute__((weak)) Value bruteforce(const Input&) { std::cerr << "brute-force reference not provided\n"; std::exit(2); }

// --- Complexity Lab space measurement (L4) ---
// binji's allocator segregates large vs small allocations into distant regions of
// linear memory, so a windowed snapshot-diff misses whichever size class it is not
// scanning, and a full-memory snapshot cannot fit in a static buffer that itself
// lives in that memory. Instead we interpose the global operator new/delete -- every
// STL allocation and make_rc routes through it -- and track a live/peak byte counter.
// This yields an exact PEAK of concurrent heap bytes (the true auxiliary-space
// measure, better than an allocation-volume proxy), independent of where the
// allocator places blocks, of post-free memory state, and of dead-code elimination
// (a user-defined operator new is a replaceable function the compiler may not elide).
// STACK is a bounded poison-scan below the current frame. Both validated live.
// Gated to the wasm build ONLY. Replacing global operator new/delete is safe under
// the single wasm runtime, but must never enter the native reference verify (g++):
// there, unrelated allocations (nothrow/aligned/STL-internal) can reach this delete
// and free a pointer offset by our header, corrupting the host heap (aborts on
// Windows). Native builds skip all of it; only PASS/FAIL correctness is checked there.
#ifdef __wasm__
static long __gx_live = 0, __gx_peak = 0;
void* operator new(std::size_t n) {
    unsigned char* p = (unsigned char*)std::malloc(n + 16);
    *(std::size_t*)p = n;
    __gx_live += (long)n; if (__gx_live > __gx_peak) __gx_peak = __gx_live;
    return p + 16;
}
void operator delete(void* p) noexcept {
    if (!p) return; unsigned char* q = (unsigned char*)p - 16;
    __gx_live -= (long)*(std::size_t*)q; std::free(q);
}
void operator delete(void* p, std::size_t) noexcept { ::operator delete(p); }
void* operator new[](std::size_t n) { return ::operator new(n); }
void operator delete[](void* p) noexcept { ::operator delete(p); }
void operator delete[](void* p, std::size_t) noexcept { ::operator delete(p); }
static volatile std::size_t __gx_sink = 0;
template <class F> static long __gx_stack(F&& call) {
    volatile char probe; char* sp = (char*)&probe;
    const long WIN = 128 * 1024;              // bounded well inside the 1MB shadow stack
    std::memset(sp - WIN, 0xA5, WIN - 1024);  // leave a 1KB guard just below sp
    call();
    for (long i = 0; i < WIN - 1024; i++)
        if ((unsigned char)(sp - WIN)[i] != 0xA5) return (WIN - 1024) - i;
    return 0;
}
#endif  // __wasm__

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
        // Diagnostic breadcrumb: flushed immediately, before any work on
        // this case, so a crash mid-case still leaves a record of
        // exactly how far processing got. Same reasoning as the C
        // harness's identical marker.
        std::cout << "[CASE-BEGIN] case " << i << "\n" << std::flush;
        std::string got = dispatch(*c->obj["input"])->dump();
        if (metrics) {
#ifdef __wasm__
            // L4 space: peak concurrent heap bytes via the interposed operator new
            // (bracket the solve with a peak reset), plus a bounded stack poison-scan.
            long __hbase = __gx_live; __gx_peak = __gx_live;
            __gx_sink ^= dispatch(*c->obj["input"])->dump().size();
            long __gxh = __gx_peak - __hbase;
            long __gxs = __gx_stack([&] { __gx_sink ^= dispatch(*c->obj["input"])->dump().size(); });
            std::cout << "  [SPACE] case " << i << " heap=" << __gxh << " stack=" << __gxs << "\n";
#endif
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
