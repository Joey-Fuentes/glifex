use crate::json::JVal;

fn fib(n: i64) -> i64 {
    if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}

pub fn solve(c: &JVal) -> JVal {
    let n = c.get("n").as_num() as i64;
    // Obvious approach: the naive recursive definition. O(phi^n) time, O(n) stack.
    JVal::Num(fib(n) as f64)
}
