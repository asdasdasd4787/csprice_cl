<?php
declare(strict_types=1);

$_GET = [
    'lookup_name' => 'MAG-7 | Heat',
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
echo "success=" . ($json['success'] ? 'yes' : 'no') . PHP_EOL;
echo "history_source=" . ($steam['history_source'] ?? 'n/a') . PHP_EOL;
echo "point_count=" . count($points) . PHP_EOL;
if (count($points) >= 2) {
    $prices = array_column($points, 'price');
    echo "first_date=" . $points[0]['date'] . " price=" . $points[0]['price'] . PHP_EOL;
    echo "last_date=" . $points[count($points)-1]['date'] . " price=" . $points[count($points)-1]['price'] . PHP_EOL;
    echo "min_price=" . min($prices) . " max_price=" . max($prices) . PHP_EOL;
    $synthetic = array_filter($points, fn($p) => !empty($p['synthetic']));
    echo "synthetic_count=" . count($synthetic) . PHP_EOL;
}
