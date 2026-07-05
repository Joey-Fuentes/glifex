<?php
function solve(array $c): bool {
    if (strlen($c['s']) !== strlen($c['t'])) return false;
    return count_chars($c['s'], 1) === count_chars($c['t'], 1);
}
