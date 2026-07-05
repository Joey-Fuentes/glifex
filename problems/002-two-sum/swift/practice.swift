import Foundation

func practice(_ c: [String: Any]) -> Any {
    let nums = (c["nums"] as! [Any]).map { ($0 as! NSNumber).intValue }
    let target = (c["target"] as! NSNumber).intValue
    // Return the indices [i, j] (i < j) of the two numbers in nums that add up to target.
    return [Int]()
}
