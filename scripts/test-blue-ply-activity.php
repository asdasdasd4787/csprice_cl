<?php
declare(strict_types=1);

foreach ([
    'Desert Eagle | Blue Ply (Factory New)',
    'Desert Eagle | Blue Ply (Field-Tested)',
    'Desert Eagle | Blue Ply',
] as $name) {
    echo "=== $name ===" . PHP_EOL;
    $_GET = ['market_hash_name' => $name, 'app_id' => 730];
    ob_start();
    include __DIR__ . '/../get_steam_market_activity.php';
    $raw = ob_get_clean();
    $json = json_decode($raw, true);
    if (!$json) {
        echo "invalid json" . PHP_EOL;
        continue;
    }
    echo "success=" . (($json['success'] ?? false) ? 'yes' : 'no') . PHP_EOL;
    echo "history_source=" . ($json['history_source'] ?? 'n/a') . PHP_EOL;
    $history = $json['sales_history_by_range']['all'] ?? $json['sales_history'] ?? [];
    echo "points=" . count($history) . PHP_EOL;
    if (count($history) >= 2) {
        $prices = array_map(fn($p) => (float)($p['price'] ?? 0), $history);
        $last = $history[count($history) - 1];
        echo "last=" . ($last['date'] ?? '') . " p=" . ($last['price'] ?? '') . PHP_EOL;
        echo "min=" . min($prices) . " max=" . max($prices) . PHP_EOL;
        echo "starting=" . ($json['summary']['starting_price'] ?? 'n/a') . PHP_EOL;
    }
    echo PHP_EOL;
}
