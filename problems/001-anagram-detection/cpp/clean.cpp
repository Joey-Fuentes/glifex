#include "solution.hpp"
#include <algorithm>

Value clean(const Input& c) {
    std::string s = c.obj.at("s")->str, t = c.obj.at("t")->str;
    std::sort(s.begin(), s.end()); std::sort(t.begin(), t.end());
    return jbool(s == t);
}
