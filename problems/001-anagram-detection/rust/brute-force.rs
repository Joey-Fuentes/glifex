use crate::json::JVal;

pub fn solve(c: &JVal) -> JVal {
    let s: Vec<char> = c.get("s").as_str().chars().collect();
    let t: Vec<char> = c.get("t").as_str().chars().collect();
    if s.len() != t.len() { return JVal::Bool(false); }
    // Obvious approach: for every character, compare its count in both strings. O(n^2).
    for &ch in &s {
        let cs = s.iter().filter(|&&x| x == ch).count();
        let ct = t.iter().filter(|&&x| x == ch).count();
        if cs != ct { return JVal::Bool(false); }
    }
    JVal::Bool(true)
}
