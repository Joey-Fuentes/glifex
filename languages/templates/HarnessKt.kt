// Generated harness — do not edit. Reads ../test_cases.json, dispatches via reflection.
import java.io.File

fun main(args: Array<String>) {
    val variant = args.getOrElse(0) { "practice" }
    val cls = variant.replaceFirstChar { it.uppercase() }
    val sol = Class.forName(cls).getDeclaredConstructor().newInstance() as Solution
    @Suppress("UNCHECKED_CAST")
    val cases = Json.parse(File("../test_cases.json").readText()) as List<Map<String, Any?>>
    var passed = 0
    cases.forEachIndexed { i, c ->
        @Suppress("UNCHECKED_CAST")
        val got = sol.solve(c["input"] as Map<String, Any?>)
        val ok = got.toString() == c["expected"].toString()
        if (ok) { passed++; println("  [PASS] case $i") }
        else println("  [FAIL] case $i  expected=${c["expected"]} got=$got")
    }
    println("$passed/${cases.size} passed")
    if (passed != cases.size) kotlin.system.exitProcess(1)
}
