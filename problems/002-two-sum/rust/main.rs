// Generated harness — do not edit. Reads ../test_cases.json, dispatches on variant.
mod json;
mod practice;
mod clean;
mod optimized;

use json::JVal;
use std::time::Instant;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let variant = args.get(1).map(String::as_str).unwrap_or("practice");
    let bench = args.get(2).map(String::as_str) == Some("--bench");
    let raw = std::fs::read_to_string("../test_cases.json").expect("test_cases.json");
    let cases = json::parse(&raw);
    let cases = cases.as_arr();
    let f: fn(&JVal) -> JVal = match variant {
        "practice" => practice::solve,
        "clean" => clean::solve,
        _ => optimized::solve,
    };
    if bench {
        let mut best = f64::INFINITY;
        for _ in 0..5 {
            let t0 = Instant::now();
            for c in cases { std::hint::black_box(f(c.get("input"))); }
            let per = t0.elapsed().as_nanos() as f64 / cases.len().max(1) as f64;
            if per < best { best = per }
        }
        println!("  {}: ~{:.0} ns/case (coarse; use cargo bench/criterion for rigor)", variant, best);
        return;
    }
    let mut passed = 0;
    for (i, c) in cases.iter().enumerate() {
        let got = f(c.get("input")).dump();
        let exp = c.get("expected").dump();
        if got == exp { passed += 1; println!("  [PASS] case {}", i); }
        else { println!("  [FAIL] case {}  expected={} got={}", i, exp, got); }
    }
    println!("{}/{} passed", passed, cases.len());
    if passed != cases.len() { std::process::exit(1) }
}
