<?php
// Optimized: same O(n) hash-map approach as clean.php, but a single
// null-coalescing lookup per element instead of isset()+[] (two
// lookups for the same key on every hit) -- same pattern as
// optimized.js/optimized.py/optimized.rb.
function solve(array $c): array {
    $seen = [];
    $nums = $c['nums'];
    $n = count($nums);
    for ($i = 0; $i < $n; $i++) {
        $need = $c['target'] - $nums[$i];
        $idx = $seen[$need] ?? null;
        if ($idx !== null) return [$idx, $i];
        $seen[$nums[$i]] = $i;
    }
    return [];
}

