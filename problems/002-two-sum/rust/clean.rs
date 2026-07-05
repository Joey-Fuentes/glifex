use crate::json::JVal;
use std::collections::HashMap;

pub fn solve(c: &JVal) -> JVal {
    let nums = c.get("nums").as_arr();
    let target = c.get("target").as_num();
    let mut seen: HashMap<i64, usize> = HashMap::new();
    for (i, n) in nums.iter().enumerate() {
        let n = n.as_num() as i64;
        let need = target as i64 - n;
        if let Some(&j) = seen.get(&need) {
            return JVal::Arr(vec![JVal::Num(j as f64), JVal::Num(i as f64)]);
        }
        seen.insert(n, i);
    }
    JVal::Arr(vec![])
}
