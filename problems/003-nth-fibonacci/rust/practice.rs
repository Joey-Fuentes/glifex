use crate::json::JVal;

pub fn solve(c: &JVal) -> JVal {
    let _n = c.get("n").as_num() as i64;
    // Return the nth Fibonacci number: fib(0)=0, fib(1)=1, fib(2)=1, ...
    JVal::Num(0.0)
}
