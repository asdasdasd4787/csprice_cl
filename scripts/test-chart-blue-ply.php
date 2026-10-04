<?php
declare(strict_types=1);

$_GET = [
    'lookup_name' => 'Desert Eagle | Blue Ply',
    'wear' => 'Factory New',
    'range' => 'MAX',
    'source' => 'steam',
];

ob_start();
include __DIR__ . '/../get_market_chart_bundle.php';
$raw = ob_get_clean();
$json = json_decode($raw, true);
$steam = $json['series']['steam'] ?? null;
$points = $steam['points'] ?? [];
echo "bundle success=" . ($json['success'] ? 'yes' : 'no') . PHP_EOL;
echo "history_source=" . ($steam['history_source'] ?? 'n/a') . PHP_EOL;
echo "current_price=" . ($steam['current_price'] ?? 'n/a') . PHP_EOL;
echo "point_count=" . count($points) . PHP_EOL;
if (count($points) >= 2) {
    $prices = array_map(fn($p) => (float)($p['price'] ?? 0), $points);
    echo "first=" . $points[0]['date'] . " p=" . $points[0]['price'] . PHP_EOL;
    $last = $points[count($points) - 1];
    echo "last=" . $last['date'] . " p=" . $last['price'] . PHP_EOL;
    echo "min=" . min($prices) . " max=" . max($prices) . PHP_EOL;
}
