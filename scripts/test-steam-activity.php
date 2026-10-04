<?php
declare(strict_types=1);

$_GET = ['market_hash_name' => 'MAG-7 | Heat (Factory New)'];

ob_start();
include __DIR__ . '/../get_steam_market_activity.php';
$raw = ob_get_clean();
$json = json_decode($raw, true);
$history = $json['history'] ?? [];
echo "success=" . ($json['success'] ? 'yes' : 'no') . PHP_EOL;
echo "history_source=" . ($json['history_source'] ?? 'n/a') . PHP_EOL;
echo "history_count=" . count($history) . PHP_EOL;
if (count($history) >= 2) {
    $prices = array_map(fn($p) => (float)($p['price'] ?? 0), $history);
    echo "first_date=" . ($history[0]['date'] ?? $history[0]['sold_at'] ?? '') . " price=" . ($history[0]['price'] ?? '') . PHP_EOL;
    $last = $history[count($history) - 1];
    echo "last_date=" . ($last['date'] ?? $last['sold_at'] ?? '') . " price=" . ($last['price'] ?? '') . PHP_EOL;
    echo "min_price=" . min($prices) . " max_price=" . max($prices) . PHP_EOL;
}
