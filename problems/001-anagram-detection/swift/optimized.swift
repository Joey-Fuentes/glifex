import Foundation

func optimized(_ c: [String: Any]) -> Any {
    let s = c["s"] as! String, t = c["t"] as! String
    if s.count != t.count { return false }
    var count = [Character: Int]()
    for ch in s { count[ch, default: 0] += 1 }
    for ch in t {
        count[ch, default: 0] -= 1
        if count[ch]! < 0 { return false }
    }
    return true
}
