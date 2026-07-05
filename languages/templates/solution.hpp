// The Glifex C++ contract: implement Value <variant>(const Input&).
#pragma once
#include "json.hpp"
using Input = JValue;   // the "input" object from test_cases.json
using Value = JPtr;     // return a JValue (use helpers below)

inline Value jbool(bool b) { auto v = make_rc<JValue>(); v->type = JValue::BOOL; v->b = b; return v; }
inline Value jnum(double n) { auto v = make_rc<JValue>(); v->type = JValue::NUM; v->num = n; return v; }
inline Value jarr(std::vector<Value> xs) { auto v = make_rc<JValue>(); v->type = JValue::ARR; v->arr = std::move(xs); return v; }
