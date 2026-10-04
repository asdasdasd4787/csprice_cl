<?php
require __DIR__ . '/../app_bootstrap.php';

function postJson(string $url, array $body): array {
    $ctx = stream_context_create(['http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/json\r\n",
        'content' => json_encode($body),
        'timeout' => 90,
    ]]);
    return json_decode((string)file_get_contents($url, false, $ctx), true) ?: [];
}

$base = 'http://localhost/csgo_price_tracker/';
$name = '★ Navaja Knife | Doppler (Factory New)';
$wearName = $name;

echo "=== Cached (db first) ===\n";
$cached = postJson($base . 'get_roi_prices_cached.php', [
    'source' => 'steam', 'market_hash_names' => [$wearName],
    'db_cache_first' => true, 'max_cache_age_hours' => 24,
]);
$row = $cached['items'][0] ?? [];
echo "price={$row['current_price']} source={$row['steam_price_source']} verified=" . json_encode($row['price_verified'] ?? null) . "\n";

echo "=== prefer_live + listing_first ===\n";
$live = postJson($base . 'get_roi_prices_cached.php', [
    'source' => 'steam', 'market_hash_names' => [$wearName],
    'prefer_live' => true, 'ignore_cache' => true,
    'steam_listing_first' => true,
    'steam_listing_fallback' => true, 'steam_listing_fallback_limit' => 2,
]);
$row = $live['items'][0] ?? [];
echo "price={$row['current_price']} source={$row['steam_price_source']} verified=" . json_encode($row['price_verified'] ?? null) . "\n";

echo "=== Skinport cached ===\n";
$spC = postJson($base . 'get_roi_prices_cached.php', [
    'source' => 'skinport', 'market_hash_names' => [$name],
    'db_cache_first' => true,
]);
$row = $spC['items'][0] ?? [];
echo "price={$row['current_price']}\n";

echo "=== Skinport prefer_live ===\n";
$spL = postJson($base . 'get_roi_prices_cached.php', [
    'source' => 'skinport', 'market_hash_names' => [$name],
    'prefer_live' => true, 'ignore_cache' => true,
]);
$row = $spL['items'][0] ?? [];
echo "price={$row['current_price']}\n";
