use crate::json::JVal;

pub fn solve(c: &JVal) -> JVal {
    let n = c.get("n").as_num() as i64;
    let (mut a, mut b) = (0i64, 1i64);
    for _ in 0..n { let t = a + b; a = b; b = t; }
    JVal::Num(a as f64)
}
