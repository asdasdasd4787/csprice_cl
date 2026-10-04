<?php
$path = $argv[1] ?? __DIR__ . '/tmp_steam.json';
$j = json_decode(file_get_contents($path), true);
echo 'success=' . (($j['success'] ?? false) ? 'y' : 'n') . PHP_EOL;
echo 'history_source=' . ($j['history_source'] ?? '') . PHP_EOL;
$h = $j['sales_history_by_range']['all'] ?? $j['sales_history'] ?? [];
echo 'history=' . count($h) . PHP_EOL;
if ($h) {
    $last = $h[count($h) - 1];
    echo 'last=' . ($last['date'] ?? '') . ' ' . ($last['price'] ?? '') . PHP_EOL;
}
