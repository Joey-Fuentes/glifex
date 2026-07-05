import Foundation

func clean(_ c: [String: Any]) -> Any {
    let nums = (c["nums"] as! [Any]).map { ($0 as! NSNumber).intValue }
    let target = (c["target"] as! NSNumber).intValue
    var seen = [Int: Int]()
    for (i, n) in nums.enumerated() {
        if let j = seen[target - n] { return [j, i] }
        seen[n] = i
    }
    return [Int]()
}
