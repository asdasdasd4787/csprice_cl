<?php
require __DIR__ . '/../app_bootstrap.php';

function postJson(string $url, array $body): array {
    $ctx = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => json_encode($body),
        ],
    ]);
    return json_decode((string)file_get_contents($url, false, $ctx), true) ?: [];
}

$catalog = json_decode((string)file_get_contents(__DIR__ . '/../assets/steam-market-cache/roi_catalog.json'), true);
$items = array_values(array_filter($catalog['items'] ?? [], fn($it) => $it['image'] && ($it['seed_sell_price'] ?? 0) > 0));
$names = array_slice(array_map(fn($it) => $it['market_hash_name'], $items), 0, 40);
$base = 'http://localhost/csgo_price_tracker/';

function isVerifiedDealPrice(array $record, string $providerId): bool {
    if (!$record || !empty($record['_no_listing'])) return false;
    $price = $record['current_price'] ?? $record['lowest_price'] ?? $record['min_price'] ?? $record['price'] ?? null;
    $price = is_numeric($price) ? (float)$price : null;
    if ($price === null || $price <= 0) return false;
    if ($providerId === 'steam') {
        if (($record['price_verified'] ?? null) === true) return true;
        $origin = strtolower((string)($record['steam_price_source'] ?? ''));
        if ($origin === 'steam_catalog') return false;
        return in_array($origin, ['priceoverview', 'market_listing'], true);
    }
    if ($providerId === 'csfloat' && !empty($record['_from_db'])) return false;
    if ($providerId === 'dmarket' && !empty($record['_from_db'])) return false;
    return ($record['price_verified'] ?? null) !== false;
}

$sp = postJson($base . 'get_roi_prices_cached.php', [
    'source' => 'skinport', 'range' => '30d', 'market_hash_names' => $names,
    'cache_only' => false, 'db_cache_first' => true, 'allow_live_refresh' => true, 'skip_catalog_fallback' => true,
]);
$cf = postJson($base . 'get_csfloat_prices.php', [
    'market_hash_names' => $names, 'cache_only' => false, 'ignore_auctions' => true, 'buy_now_only' => true,
]);

$spVerified = 0;
foreach ($sp['items'] ?? [] as $row) {
    if (isVerifiedDealPrice($row, 'skinport')) $spVerified++;
}
$cfVerified = 0;
foreach ($cf['items'] ?? [] as $row) {
    if (isVerifiedDealPrice($row, 'csfloat')) $cfVerified++;
}

echo "skinport items: " . count($sp['items'] ?? []) . ", verified: $spVerified\n";
echo "csfloat items: " . count($cf['items'] ?? []) . ", verified: $cfVerified\n";

$deals = 0;
$spMap = [];
foreach ($sp['items'] ?? [] as $row) {
    if (isVerifiedDealPrice($row, 'skinport')) {
        $spMap[$row['market_hash_name']] = (float)$row['current_price'];
    }
}
$cfMap = [];
foreach ($cf['items'] ?? [] as $row) {
    if (isVerifiedDealPrice($row, 'csfloat')) {
        $cfMap[$row['market_hash_name']] = (float)$row['current_price'];
    }
}
foreach ($names as $name) {
    $lp = $spMap[$name] ?? 0;
    $rp = $cfMap[$name] ?? 0;
    if ($lp <= 0 || $rp <= 0) continue;
    $max = max($lp, $rp);
    $savings = (($max - min($lp, $rp)) / $max) * 100;
    if ($savings > 0.1 && $savings <= 45) $deals++;
}
echo "verified deals: $deals\n";

// show first failing skinport row
foreach ($sp['items'] ?? [] as $row) {
    if (!isVerifiedDealPrice($row, 'skinport')) {
        echo 'skinport fail: ' . json_encode(['name' => $row['market_hash_name'], 'price_verified' => $row['price_verified'] ?? null]) . "\n";
        break;
    }
}
