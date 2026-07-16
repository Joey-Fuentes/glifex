func clean(_ nums: [Int], _ target: Int) -> [Int] {
    var seen = [Int: Int]()
    for (i, n) in nums.enumerated() {
        if let j = seen[target - n] { return [j, i] }
        seen[n] = i
    }
    return [Int]()
}
