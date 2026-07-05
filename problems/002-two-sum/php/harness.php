<?php
// Generated harness — do not edit. Reads ../test_cases.json, runs a variant.
$variant = $argv[1] ?? 'practice';
require __DIR__ . "/$variant.php";
$cases = json_decode(file_get_contents(__DIR__ . '/../test_cases.json'), true);
$passed = 0;
foreach ($cases as $i => $c) {
    $got = solve($c['input']);
    $ok = json_encode($got) === json_encode($c['expected']);
    if ($ok) { $passed++; echo "  [PASS] case $i\n"; }
    else echo "  [FAIL] case $i  expected=" . json_encode($c['expected']) . " got=" . json_encode($got) . "\n";
}
echo "$passed/" . count($cases) . " passed\n";
exit($passed === count($cases) ? 0 : 1);
