<?php
declare(strict_types=1);
$_GET = ['market_hash_name' => 'Glock-18 | Block-18 (Factory New)'];
ob_start();
include __DIR__ . '/../get_steam_market_activity.php';
$raw = ob_get_clean();
$json = json_decode($raw, true);
$all = $json['sales_history_by_range']['all'] ?? [];
echo "activity success=" . ($json['success'] ?? false) . PHP_EOL;
echo "history_source=" . ($json['history_source'] ?? 'n/a') . PHP_EOL;
echo "all_count=" . count($all) . PHP_EOL;
if (count($all) >= 2) {
    $prices = array_map(fn($p) => (float)($p['price'] ?? 0), $all);
    echo "min=" . min($prices) . " max=" . max($prices) . PHP_EOL;
    echo "first=" . json_encode($all[0]) . PHP_EOL;
    echo "last=" . json_encode($all[count($all)-1]) . PHP_EOL;
}
