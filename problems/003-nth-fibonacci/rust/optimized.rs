use crate::json::JVal;

pub fn solve(c: &JVal) -> JVal {
    let mut n = c.get("n").as_num() as i64;
    // Same O(n) window slide as clean, unrolled 2x (advances two Fib steps per
    // loop check). Constant-factor win, stays in the declared O(n) class.
    let (mut a, mut b) = (0i64, 1i64);
    if n & 1 == 1 { let t = a + b; a = b; b = t; n -= 1; }
    while n > 0 { let t = a + b; b = t + b; a = t; n -= 2; }
    JVal::Num(a as f64)
}
