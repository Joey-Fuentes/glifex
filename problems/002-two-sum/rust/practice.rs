use crate::json::JVal;

pub fn solve(c: &JVal) -> JVal {
    let nums = c.get("nums").as_arr();
    let target = c.get("target").as_num();
    // Return the indices [i, j] (i < j) of the two numbers in nums that add up to target.
    JVal::Arr(vec![])
}
