// Generated harness — do not edit. Reads ../test_cases.json, dispatches on variant.
// Comparison canonicalizes both sides through JSONSerialization so NSNumber
// boolean/integer bridging differences (Darwin vs Linux) can't cause false FAILs.
import Foundation

func canon(_ v: Any) -> String {
    let data = try! JSONSerialization.data(withJSONObject: [v])
    return String(data: data, encoding: .utf8)!
}

let args = CommandLine.arguments
let variant = args.count > 1 ? args[1] : "practice"
let data = FileManager.default.contents(atPath: "../test_cases.json")!
let cases = try! JSONSerialization.jsonObject(with: data) as! [[String: Any]]
var passed = 0
for (i, c) in cases.enumerated() {
    let input = c["input"] as! [String: Any]
    let got: Any = variant == "practice" ? practice(input) : variant == "clean" ? clean(input) : optimized(input)
    let ok = canon(got) == canon(c["expected"]!)
    if ok { passed += 1; print("  [PASS] case \(i)") }
    else { print("  [FAIL] case \(i)  expected=\(canon(c["expected"]!)) got=\(canon(got))") }
}
print("\(passed)/\(cases.count) passed")
exit(passed == cases.count ? 0 : 1)
