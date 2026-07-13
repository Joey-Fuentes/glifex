use crate::json::JVal;

pub fn solve(c: &JVal) -> JVal {
    let nums = c.get("nums").as_arr();
    let target = c.get("target").as_num() as i64;
    // Check every pair -- the obvious first approach, O(n^2).
    for i in 0..nums.len() {
        for j in (i + 1)..nums.len() {
            if nums[i].as_num() as i64 + nums[j].as_num() as i64 == target {
                return JVal::Arr(vec![JVal::Num(i as f64), JVal::Num(j as f64)]);
            }
        }
    }
    JVal::Arr(vec![])
}
