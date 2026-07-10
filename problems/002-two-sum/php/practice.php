<?php
function solve(array $c): array {
    $seen = [];
    foreach ($c['nums'] as $i => $n) {
        $need = $c['target'] - $n;
        if (isset($seen[$need])) return [$seen[$need], $i];
        $seen[$n] = $i;
    }
    return [];
}
