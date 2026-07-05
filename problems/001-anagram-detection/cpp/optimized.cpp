#include "solution.hpp"
#include <array>

Value optimized(const Input& c) {
    const std::string& s = c.obj.at("s")->str; const std::string& t = c.obj.at("t")->str;
    if (s.size() != t.size()) return jbool(false);
    std::array<int, 256> count{};
    for (unsigned char ch : s) count[ch]++;
    for (unsigned char ch : t) if (--count[ch] < 0) return jbool(false);
    return jbool(true);
}
