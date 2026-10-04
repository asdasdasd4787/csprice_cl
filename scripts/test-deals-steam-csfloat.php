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

function isVerifiedSteam(array $record): bool {
    if (!$record || !empty($record['_no_listing'])) return false;
    $price = $record['current_price'] ?? null;
    if (!is_numeric($price) || (float)$price <= 0) return false;
    if (($record['price_verified'] ?? null) === true) return true;
    $origin = strtolower((string)($record['steam_price_source'] ?? ''));
    if ($origin === 'steam_catalog') return false;
    return in_array($origin, ['priceoverview', 'market_listing', 'market_listing_wear'], true);
}

function isVerifiedCsfloat(array $record): bool {
    if (!$record || !empty($record['_no_listing'])) return false;
    $price = $record['current_price'] ?? null;
    if (!is_numeric($price) || (float)$price <= 0) return false;
    if (!empty($record['_from_db'])) return false;
    return ($record['price_verified'] ?? null) !== false;
}

const STEAM_MAX = 1800;
$base = 'http://localhost/csgo_price_tracker/';
$catalog = json_decode((string)file_get_contents(__DIR__ . '/../assets/steam-market-cache/roi_catalog.json'), true);
$items = array_values(array_filter($catalog['items'] ?? [], fn($it) => $it['image'] && ($it['seed_sell_price'] ?? 0) > 0 && ($it['seed_sell_price'] ?? 0) <= STEAM_MAX));
usort($items, function ($a, $b) {
    $score = function (array $item): float {
        $price = (float)($item['seed_sell_price'] ?? 0);
        $listings = (float)($item['seed_sell_listings'] ?? 0);
        return -log10(max(1, $listings)) + min($price, 1800) * 0.01;
    };
    return $score($a) <=> $score($b);
});
$batch = array_slice($items, 0, 40);
$names = array_map(fn($it) => $it['market_hash_name'], $batch);
$wearNames = array_map(function ($it) {
    $base = trim((string)($it['market_hash_name'] ?? ''));
    if (preg_match('/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i', $base)) {
        return $base;
    }
    $wear = trim((string)($it['selected_wear'] ?? ''));
    return $wear !== '' ? "{$base} ({$wear})" : $base;
}, $batch);

$steam = postJson($base . 'get_roi_prices_cached.php', [
    'source' => 'steam', 'range' => '30d', 'market_hash_names' => $wearNames,
    'cache_only' => false, 'skip_catalog_fallback' => true, 'db_cache_first' => true,
    'max_cache_age_hours' => 24, 'allow_live_refresh' => true,
    'steam_listing_fallback' => true, 'steam_listing_fallback_limit' => 6,
]);
$cf = postJson($base . 'get_csfloat_prices.php', [
    'market_hash_names' => $names, 'cache_only' => false,
    'ignore_auctions' => true, 'buy_now_only' => true,
]);

$steamMap = [];
foreach (($steam['items'] ?? []) as $i => $row) {
    $catalogName = $names[$i] ?? ($row['market_hash_name'] ?? '');
    if (isVerifiedSteam($row)) {
        $steamMap[$catalogName] = (float)$row['current_price'];
    } else {
        echo "steam FAIL: {$catalogName} wear={$wearNames[$i]} source=" . ($row['steam_price_source'] ?? '') . " pv=" . json_encode($row['price_verified'] ?? null) . " price=" . ($row['current_price'] ?? 'null') . "\n";
    }
}

$cfMap = [];
$cfFromDb = 0;
$cfVerified = 0;
foreach ($cf['items'] ?? [] as $row) {
    $n = $row['market_hash_name'] ?? '';
    if (!empty($row['_from_db'])) $cfFromDb++;
    if (isVerifiedCsfloat($row)) {
        $cfVerified++;
        $cfMap[$n] = (float)$row['current_price'];
    }
}

$deals = 0;
foreach ($names as $name) {
    $lp = $steamMap[$name] ?? 0;
    $rp = $cfMap[$name] ?? 0;
    if ($lp <= 0 || $rp <= 0) continue;
    $max = max($lp, $rp);
    $sav = (($max - min($lp, $rp)) / $max) * 100;
    if ($sav > 0.1 && $sav <= 45) $deals++;
}

echo "steam verified: " . count($steamMap) . ", csfloat verified: $cfVerified (from_db=$cfFromDb), deals: $deals\n";
echo "csfloat items returned: " . count($cf['items'] ?? []) . "\n";
