use crate::json::JVal;

pub fn solve(c: &JVal) -> JVal {
    let s = c.get("s").as_str();
    let t = c.get("t").as_str();
    // Return true if s and t are anagrams of each other, false otherwise.
    JVal::Bool(false)
}
