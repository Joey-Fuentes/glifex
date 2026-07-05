class Optimized : Solution {
    override fun solve(c: Map<String, Any?>): Any? {
        val s = c["s"] as String
        val t = c["t"] as String
        if (s.length != t.length) return false
        val count = IntArray(256)
        for (ch in s) count[ch.code]++
        for (ch in t) if (--count[ch.code] < 0) return false
        return true
    }
}
