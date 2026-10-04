<?php
declare(strict_types=1);

$lookup = $argv[1] ?? 'MAG-7 | Insomnia (Factory New)';
$itemId = (int)($argv[2] ?? 0);

echo "=== Steam history: {$lookup}\n";
define('STEAM_MARKET_HISTORY_LIB_ONLY', true);
require __DIR__ . '/../get_steam_market_activity.php';
$history = resolveSteamMarketHistoryPoints($lookup, 730, 120);
echo 'steam_points=' . count($history) . "\n";
if ($history) {
    $first = $history[0];
    $last = $history[count($history) - 1];
    echo 'first=' . ($first['date'] ?? '') . ' ' . ($first['price'] ?? '') . "\n";
    echo 'last=' . ($last['date'] ?? '') . ' ' . ($last['price'] ?? '') . "\n";
}

echo "\n=== Chart bundle\n";
$_GET = [
    'lookup_name' => preg_replace('/\s+\([^)]+\)$/', '', $lookup) . (str_contains($lookup, '(') ? '' : ''),
    'wear' => 'Factory New',
    'range' => 'ALL',
    'source' => 'all',
    'item_id' => $itemId > 0 ? $itemId : 1,
];
if (preg_match('/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/', $lookup, $m)) {
    $_GET['lookup_name'] = trim(str_replace($m[0], '', $lookup));
    $_GET['wear'] = $m[1];
}

ob_start();
include __DIR__ . '/../get_market_chart_bundle.php';
$json = ob_get_clean();
$bundle = json_decode($json, true);
echo 'bundle_success=' . (($bundle['success'] ?? false) ? 'yes' : 'no') . "\n";
echo 'bundle_keys=' . implode(',', array_keys($bundle ?? [])) . "\n";
if (!empty($bundle['error'])) {
    echo 'error=' . $bundle['error'] . "\n";
}
$seriesRoot = $bundle['series'] ?? $bundle;
foreach (['steam', 'skinport', 'csfloat', 'white_market', 'dmarket'] as $source) {
    $series = $seriesRoot[$source] ?? null;
    if (!$series) {
        echo "{$source}: missing\n";
        continue;
    }
    $points = $series['points'] ?? [];
    $synthetic = 0;
    foreach ($points as $point) {
        if (!empty($point['synthetic'])) {
            $synthetic++;
        }
    }
    $prices = array_column($points, 'price');
    $min = $prices ? min($prices) : 0;
    $max = $prices ? max($prices) : 0;
    echo "{$source}: " . count($points) . " pts current=" . ($series['current_price'] ?? '') . " range={$min}-{$max} synthetic={$synthetic}\n";
}
