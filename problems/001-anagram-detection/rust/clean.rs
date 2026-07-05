use crate::json::JVal;

pub fn solve(c: &JVal) -> JVal {
    let mut s: Vec<char> = c.get("s").as_str().chars().collect();
    let mut t: Vec<char> = c.get("t").as_str().chars().collect();
    s.sort_unstable(); t.sort_unstable();
    JVal::Bool(s == t)
}
