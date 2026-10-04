<?php
// Replicate JS providerCandidateScore + first 450 names, then test steam+skinport deals
require __DIR__ . '/../app_bootstrap.php';

function postJson(string $url, array $body): array {
    $ctx = stream_context_create(['http' => ['method' => 'POST', 'header' => "Content-Type: application/json\r\n", 'content' => json_encode($body)]]);
    return json_decode((string)file_get_contents($url, false, $ctx), true) ?: [];
}

const STEAM_MAX = 1800;
const PROVIDER_FRIENDLY = [
    'rifles' => 0, 'pistols' => 0, 'smgs' => 0, 'heavy' => 0, 'shotguns' => 0,
    'knives' => 0, 'gloves' => 0, 'agents' => 1, 'cases' => 2, 'capsules' => 3,
    'stickers' => 4, 'patches' => 5, 'music' => 6,
];

function score(array $item): float {
    $sub = strtolower((string)($item['sub_filter'] ?? $item['category'] ?? ''));
    $cat = strtolower((string)($item['category'] ?? ''));
    $price = (float)($item['seed_sell_price'] ?? 0);
    $listings = (float)($item['seed_sell_listings'] ?? 0);
    $typeRank = PROVIDER_FRIENDLY[$sub] ?? (PROVIDER_FRIENDLY[$cat] ?? 20);
    $pricePenalty = $price < 1.5 ? 40 : ($price <= 400 ? 0 : ($price <= 1200 ? 15 : 45));
    $liquidityScore = min(60, log10(max(1, $listings)) * 14);
    return ($typeRank * 100000) + ($pricePenalty * 1000) - ($liquidityScore * 10) + min($price, 1800) * 0.01;
}

function isVerified(array $record, string $providerId): bool {
    if (!$record || !empty($record['_no_listing'])) return false;
    $price = $record['current_price'] ?? null;
    if (!is_numeric($price) || (float)$price <= 0) return false;
    if ($providerId === 'steam') {
        if (($record['price_verified'] ?? null) === true) return true;
        $origin = strtolower((string)($record['steam_price_source'] ?? ''));
        if ($origin === 'steam_catalog') return false;
        return in_array($origin, ['priceoverview', 'market_listing'], true);
    }
    if ($providerId === 'csfloat' && !empty($record['_from_db'])) return false;
    return ($record['price_verified'] ?? null) !== false;
}

$catalog = json_decode((string)file_get_contents(__DIR__ . '/../assets/steam-market-cache/roi_catalog.json'), true);
$items = array_values(array_filter($catalog['items'] ?? [], fn($it) => $it['image'] && ($it['seed_sell_price'] ?? 0) > 0 && ($it['seed_sell_price'] ?? 0) <= STEAM_MAX));
usort($items, fn($a, $b) => score($a) <=> score($b));
$names = array_slice(array_map(fn($it) => $it['market_hash_name'], $items), 0, 450);
$base = 'http://localhost/csgo_price_tracker/';

$steam = postJson($base . 'get_roi_prices_cached.php', [
    'source' => 'steam', 'range' => '30d', 'market_hash_names' => array_slice($names, 0, 40),
    'cache_only' => false, 'skip_catalog_fallback' => true, 'db_cache_first' => true,
    'allow_live_refresh' => true, 'steam_listing_fallback' => true, 'steam_listing_fallback_limit' => 2,
]);
$skin = postJson($base . 'get_roi_prices_cached.php', [
    'source' => 'skinport', 'range' => '30d', 'market_hash_names' => array_slice($names, 0, 40),
    'cache_only' => false, 'db_cache_first' => true, 'allow_live_refresh' => true, 'skip_catalog_fallback' => true,
]);

$steamVerified = 0; $skinVerified = 0; $deals = 0;
$steamMap = []; $skinMap = [];
foreach ($steam['items'] ?? [] as $row) {
    if (isVerified($row, 'steam')) { $steamVerified++; $steamMap[$row['market_hash_name']] = (float)$row['current_price']; }
}
foreach ($skin['items'] ?? [] as $row) {
    if (isVerified($row, 'skinport')) { $skinVerified++; $skinMap[$row['market_hash_name']] = (float)$row['current_price']; }
}
foreach (array_slice($names, 0, 40) as $name) {
    $lp = $steamMap[$name] ?? 0; $rp = $skinMap[$name] ?? 0;
    if ($lp <= 0 || $rp <= 0) continue;
    $max = max($lp, $rp);
    $sav = (($max - min($lp, $rp)) / $max) * 100;
    if ($sav > 0.1 && $sav <= 45) $deals++;
}
echo "first candidate: {$names[0]}\n";
echo "steam verified: $steamVerified, skinport verified: $skinVerified, deals: $deals\n";
foreach ($steam['items'] ?? [] as $row) {
    if (!isVerified($row, 'steam')) {
        echo 'steam unverified: ' . ($row['market_hash_name'] ?? '') . ' source=' . ($row['steam_price_source'] ?? '') . ' pv=' . json_encode($row['price_verified'] ?? null) . "\n";
    }
}
