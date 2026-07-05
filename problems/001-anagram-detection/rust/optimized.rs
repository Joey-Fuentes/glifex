use crate::json::JVal;

pub fn solve(c: &JVal) -> JVal {
    let s = c.get("s").as_str().as_bytes();
    let t = c.get("t").as_str().as_bytes();
    if s.len() != t.len() { return JVal::Bool(false); }
    let mut count = [0i32; 256];
    for &b in s { count[b as usize] += 1; }
    for &b in t {
        count[b as usize] -= 1;
        if count[b as usize] < 0 { return JVal::Bool(false); }
    }
    JVal::Bool(true)
}
