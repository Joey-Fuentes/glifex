# Generated harness — do not edit. Reads ../test_cases.json, runs a variant.
require "json"
variant = ARGV[0] || "practice"
require_relative variant
cases = JSON.parse(File.read(File.join(__dir__, "..", "test_cases.json")))
passed = 0
cases.each_with_index do |c, i|
  got = solve(c["input"])
  ok = got == c["expected"]
  passed += 1 if ok
  puts ok ? "  [PASS] case #{i}" : "  [FAIL] case #{i}  expected=#{c['expected'].inspect} got=#{got.inspect}"
end
puts "#{passed}/#{cases.length} passed"
exit(passed == cases.length ? 0 : 1)
