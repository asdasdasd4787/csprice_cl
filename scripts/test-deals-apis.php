<?php
$names = [
    'AK-47 | Redline (Field-Tested)',
    'M4A1-S | Black Lotus (Field-Tested)',
    'Glock-18 | Water Elemental (Field-Tested)',
];

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
    if ($raw === false) {
        return ['error' => 'request failed'];
    }
    return json_decode($raw, true) ?: ['error' => 'invalid json', 'raw' => substr($raw, 0, 500)];
}

$base = 'http://localhost/csgo_price_tracker/';

$csfloat = postJson($base . 'get_csfloat_prices.php', [
    'market_hash_names' => $names,
    'cache_only' => false,
    'ignore_auctions' => true,
    'buy_now_only' => true,
]);

echo "=== CSFloat ===\n";
echo 'items: ' . count($csfloat['items'] ?? []) . "\n";
foreach ($csfloat['items'] ?? [] as $i) {
    echo ($i['market_hash_name'] ?? '?')
        . ' price=' . ($i['current_price'] ?? $i['price'] ?? '?')
        . ' verified=' . json_encode($i['price_verified'] ?? null)
        . ' from_db=' . json_encode($i['_from_db'] ?? null)
        . ' no_listing=' . json_encode($i['_no_listing'] ?? null)
        . "\n";
}
if (!empty($csfloat['error'])) {
    echo 'error: ' . $csfloat['error'] . "\n";
}

$skinport = postJson($base . 'get_roi_prices_cached.php', [
    'source' => 'skinport',
    'range' => '30d',
    'market_hash_names' => $names,
    'cache_only' => false,
    'db_cache_first' => true,
    'allow_live_refresh' => true,
    'skip_catalog_fallback' => true,
]);

echo "\n=== Skinport ===\n";
echo 'items: ' . count($skinport['items'] ?? []) . "\n";
foreach ($skinport['items'] ?? [] as $i) {
    echo ($i['market_hash_name'] ?? '?')
        . ' price=' . ($i['current_price'] ?? '?')
        . ' verified=' . json_encode($i['price_verified'] ?? null)
        . "\n";
}
if (!empty($skinport['error'])) {
    echo 'error: ' . $skinport['error'] . "\n";
}
