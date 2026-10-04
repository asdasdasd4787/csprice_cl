<?php
declare(strict_types=1);

foreach ([
    'Desert Eagle | Blue Ply (Factory New)',
    'Desert Eagle | Blue Ply (Field-Tested)',
] as $name) {
    echo "=== $name ===" . PHP_EOL;
    $_GET = ['market_hash_name' => $name, 'app_id' => 730];
    ob_start();
    include __DIR__ . '/../get_steam_market_activity.php';
    $raw = ob_get_clean();
    $json = json_decode($raw, true);
    echo "starting=" . ($json['summary']['starting_price'] ?? 'n/a') . PHP_EOL;
    $last = ($json['sales_history_by_range']['all'] ?? [])[count($json['sales_history_by_range']['all'] ?? []) - 1] ?? null;
    echo "last_sale=" . ($last['price'] ?? 'n/a') . PHP_EOL;
}
