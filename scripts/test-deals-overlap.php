<?php
require __DIR__ . '/../app_bootstrap.php';

function postJson(string $url, array $body): array {
    $ctx = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => json_encode($body),
            'ignore_errors' => true,
        ],
    ]);
    $raw = @file_get_contents($url, false, $ctx);
    return json_decode((string)$raw, true) ?: [];
}

$base = 'http://localhost/csgo_price_tracker/';
$catalog = json_decode((string)file_get_contents(__DIR__ . '/../assets/steam-market-cache/roi_catalog.json'), true);
$items = array_values(array_filter($catalog['items'] ?? [], fn($it) => $it['image'] && ($it['seed_sell_price'] ?? 0) > 0));
$names = array_slice(array_map(fn($it) => $it['market_hash_name'], $items), 0, 80);

$pairs = [
    ['steam', 'skinport'],
    ['skinport', 'csfloat'],
];

foreach ($pairs as [$left, $right]) {
    echo "\n=== $left vs $right ===\n";
    $leftItems = postJson($base . ($left === 'csfloat' ? 'get_csfloat_prices.php' : 'get_roi_prices_cached.php'), $left === 'csfloat'
        ? ['market_hash_names' => $names, 'cache_only' => false, 'ignore_auctions' => true, 'buy_now_only' => true]
        : ['source' => $left, 'range' => '30d', 'market_hash_names' => $names, 'cache_only' => false, 'db_cache_first' => true, 'allow_live_refresh' => true, 'skip_catalog_fallback' => true, 'steam_listing_fallback' => $left === 'steam', 'steam_listing_fallback_limit' => 4]
    );
    $rightItems = postJson($base . ($right === 'csfloat' ? 'get_csfloat_prices.php' : 'get_roi_prices_cached.php'), $right === 'csfloat'
        ? ['market_hash_names' => $names, 'cache_only' => false, 'ignore_auctions' => true, 'buy_now_only' => true]
        : ['source' => $right, 'range' => '30d', 'market_hash_names' => $names, 'cache_only' => false, 'db_cache_first' => true, 'allow_live_refresh' => true, 'skip_catalog_fallback' => true]
    );

    $leftMap = [];
    foreach ($leftItems['items'] ?? [] as $row) {
        $leftMap[$row['market_hash_name']] = (float)($row['current_price'] ?? 0);
    }
    $rightMap = [];
    foreach ($rightItems['items'] ?? [] as $row) {
        $rightMap[$row['market_hash_name']] = (float)($row['current_price'] ?? 0);
    }

    echo "$left count: " . count($leftMap) . ", $right count: " . count($rightMap) . "\n";

    $deals = 0;
    foreach ($names as $name) {
        $lp = $leftMap[$name] ?? 0;
        $rp = $rightMap[$name] ?? 0;
        if ($lp <= 0 || $rp <= 0) continue;
        $max = max($lp, $rp);
        $min = min($lp, $rp);
        $savings = (($max - $min) / $max) * 100;
        if ($savings > 0.1 && $savings <= 45) {
            $deals++;
            if ($deals <= 3) {
                echo "  deal: $name | $left=$lp $right=$rp savings=" . round($savings, 2) . "%\n";
            }
        }
    }
    echo "deals: $deals\n";
}
