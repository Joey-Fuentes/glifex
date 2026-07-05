class Clean : Solution {
    override fun solve(c: Map<String, Any?>): Any? {
        val s = (c["s"] as String).toCharArray().sorted()
        val t = (c["t"] as String).toCharArray().sorted()
        return s == t
    }
}
