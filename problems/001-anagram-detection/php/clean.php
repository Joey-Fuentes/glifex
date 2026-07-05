<?php
function solve(array $c): bool {
    $s = str_split($c['s']); $t = str_split($c['t']);
    sort($s); sort($t);
    return $s === $t;
}
