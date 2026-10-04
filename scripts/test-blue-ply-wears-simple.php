<?php
declare(strict_types=1);

foreach ([
    'Desert Eagle | Blue Ply (Factory New)',
    'Desert Eagle | Blue Ply (Field-Tested)',
    'Desert Eagle | Blue Ply (Minimal Wear)',
] as $name) {
    $_GET = ['market_hash_name' => $name, 'app_id' => 730];
    ob_start();
    include __DIR__ . '/../get_steam_market_activity.php';
    $raw = ob_get_clean();
    $json = json_decode($raw, true);
    $all = $json['sales_history_by_range']['all'] ?? [];
    $last = $all[count($all) - 1] ?? [];
    echo $name . PHP_EOL;
    echo '  starting=' . ($json['summary']['starting_price'] ?? 'n/a') . PHP_EOL;
    echo '  last_sale=' . ($last['price'] ?? 'n/a') . PHP_EOL;
    echo PHP_EOL;
}
