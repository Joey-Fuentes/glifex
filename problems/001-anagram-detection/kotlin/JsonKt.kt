// Minimal JSON parser (Kotlin/JVM stdlib has none). Vendored, dependency-free.
object Json {
    private var i = 0
    private lateinit var s: String
    fun parse(src: String): Any? { s = src; i = 0; ws(); return value() }
    private fun value(): Any? { ws(); return when (s[i]) {
        '{' -> obj(); '[' -> arr(); '"' -> str()
        't' -> { i += 4; true }; 'f' -> { i += 5; false }; 'n' -> { i += 4; null }
        else -> num() } }
    private fun obj(): Map<String, Any?> { val m = LinkedHashMap<String, Any?>(); i++; ws()
        if (s[i] == '}') { i++; return m }
        while (true) { ws(); val k = str(); ws(); i++; m[k] = value(); ws()
            if (s[i] == ',') { i++; continue }; i++; break }; return m }
    private fun arr(): List<Any?> { val a = ArrayList<Any?>(); i++; ws()
        if (s[i] == ']') { i++; return a }
        while (true) { a.add(value()); ws()
            if (s[i] == ',') { i++; continue }; i++; break }; return a }
    private fun str(): String { val b = StringBuilder(); i++
        while (s[i] != '"') { val c = s[i++]
            if (c == '\\') { val e = s[i++]; b.append(if (e == 'n') '\n' else if (e == 't') '\t' else e) }
            else b.append(c) }; i++; return b.toString() }
    private fun num(): Any { val st = i
        while (i < s.length && (s[i].isDigit() || s[i] in "-+.eE")) i++
        val n = s.substring(st, i)
        return if ('.' in n || 'e' in n || 'E' in n) n.toDouble() else n.toLong() }
    private fun ws() { while (i < s.length && s[i].isWhitespace()) i++ }
}
