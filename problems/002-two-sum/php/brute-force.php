<?php
// Brute force: check every pair. The "obvious" first approach --
// O(n^2) time, O(1) space.
function solve(array $c): array {
    $nums = $c['nums'];
    $n = count($nums);
    for ($i = 0; $i < $n; $i++) {
        for ($j = $i + 1; $j < $n; $j++) {
            if ($nums[$i] + $nums[$j] === $c['target']) return [$i, $j];
        }
    }
    return [];
}
