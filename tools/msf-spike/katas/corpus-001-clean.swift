import Foundation

func clean(_ c: [String: Any]) -> Any {
    return (c["s"] as! String).sorted() == (c["t"] as! String).sorted()
}
