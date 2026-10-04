<?php
require __DIR__ . '/../app_bootstrap.php';

function postJson(string $url, array $body): array {
    $ctx = stream_context_create(['http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/json\r\n",
        'content' => json_encode($body),
        'timeout' => 120,
    ]]);
    return json_decode((string)file_get_contents($url, false, $ctx), true) ?: [];
}

function isVerified(array $record, string $providerId): bool {
    if (!$record || !empty($record['_no_listing'])) return false;
    $price = $record['current_price'] ?? null;
    if (!is_numeric($price) || (float)$price <= 0) return false;
    if ($providerId === 'steam') {
        if (!empty($record['from_preload'])) return false;
        if (($record['price_verified'] ?? null) === true) return true;
        $origin = strtolower((string)($record['steam_price_source'] ?? ''));
        return in_array($origin, ['priceoverview', 'market_listing', 'market_listing_wear'], true);
    }
    if ($providerId === 'csfloat' && !empty($record['_from_db'])) return false;
    return ($record['price_verified'] ?? null) !== false;
}

$base = 'http://localhost/csgo_price_tracker/';
$cat = json_decode((string)file_get_contents(__DIR__ . '/../assets/steam-market-cache/roi_catalog.json'), true);
$items = array_values(array_filter($cat['items'] ?? [], fn($it) => $it['image'] && ($it['seed_sell_price'] ?? 0) > 0 && ($it['seed_sell_price'] ?? 0) <= 1800));
$names = array_slice(array_map(fn($it) => $it['market_hash_name'], $items), 0, 40);

$steam = postJson($base . 'get_roi_prices_cached.php', [
    'source' => 'steam', 'range' => '30d', 'market_hash_names' => $names,
    'cache_only' => false, 'skip_catalog_fallback' => true,
    'db_cache_first' => true, 'max_cache_age_hours' => 12, 'allow_live_refresh' => true,
    'steam_listing_fallback' => true, 'steam_listing_fallback_limit' => 6,
]);
$skin = postJson($base . 'get_roi_prices_cached.php', [
    'source' => 'skinport', 'range' => '30d', 'market_hash_names' => $names,
    'cache_only' => false, 'db_cache_first' => true, 'max_cache_age_hours' => 12,
    'allow_live_refresh' => true, 'skip_catalog_fallback' => true,
]);

$steamMap = [];
$skinMap = [];
foreach ($steam['items'] ?? [] as $row) {
    if (isVerified($row, 'steam')) $steamMap[$row['market_hash_name']] = (float)$row['current_price'];
}
foreach ($skin['items'] ?? [] as $row) {
    if (isVerified($row, 'skinport')) $skinMap[$row['market_hash_name']] = (float)$row['current_price'];
}
$deals = 0;
foreach ($names as $name) {
    $lp = $steamMap[$name] ?? 0;
    $rp = $skinMap[$name] ?? 0;
    if ($lp <= 0 || $rp <= 0) continue;
    $max = max($lp, $rp);
    $sav = (($max - min($lp, $rp)) / $max) * 100;
    if ($sav > 0.1 && $sav <= 45) $deals++;
}
echo "steam=" . count($steamMap) . " skinport=" . count($skinMap) . " deals=$deals\n";
