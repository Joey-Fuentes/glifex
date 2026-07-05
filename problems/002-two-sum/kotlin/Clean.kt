class Clean : Solution {
    override fun solve(c: Map<String, Any?>): Any? {
        @Suppress("UNCHECKED_CAST")
        val nums = c["nums"] as List<Long>
        val target = c["target"] as Long
        val seen = HashMap<Long, Int>()
        nums.forEachIndexed { i, n ->
            seen[target - n]?.let { return listOf(it, i) }
            seen[n] = i
        }
        return emptyList<Int>()
    }
}
