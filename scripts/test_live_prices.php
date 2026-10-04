<?php
declare(strict_types=1);

$base = 'http://localhost/csgo_price_tracker';
$names = ['AK-47 | Redline (Field-Tested)', 'AWP | Asiimov (Field-Tested)'];

function postJson(string $url, array $payload, int $timeout = 60): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout,
    ]);
    $body = (string)(curl_exec($ch) ?: '');
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    $decoded = json_decode($body, true);
    return is_array($decoded) ? $decoded + ['_http' => $code] : ['_http' => $code, '_raw' => substr($body, 0, 200)];
}

$tests = [
    'steam' => [
        'url' => $base . '/get_roi_prices_cached.php',
        'body' => [
            'market_hash_names' => $names,
            'source' => 'steam',
            'prefer_live' => true,
            'allow_live_refresh' => true,
            'skip_catalog_fallback' => true,
            'steam_listing_first' => false,
            'steam_listing_fallback' => false,
        ],
        'timeout' => 90,
    ],
    'skinport' => [
        'url' => $base . '/get_roi_prices_cached.php',
        'body' => [
            'market_hash_names' => [$names[0]],
            'source' => 'skinport',
            'prefer_live' => true,
        ],
        'timeout' => 90,
    ],
    'dmarket' => [
        'url' => $base . '/get_dmarket_prices.php',
        'body' => [
            'market_hash_names' => [$names[0]],
            'prefer_live' => true,
            'max_live_requests' => 1,
        ],
        'timeout' => 30,
    ],
    'white_market' => [
        'url' => $base . '/get_white_market_prices.php',
        'body' => [
            'market_hash_names' => [$names[0]],
            'prefer_live' => true,
            'cache_only' => false,
        ],
        'timeout' => 45,
    ],
    'csfloat' => [
        'url' => $base . '/get_csfloat_prices.php',
        'body' => [
            'market_hash_names' => [$names[0]],
            'prefer_live' => true,
            'cache_only' => false,
            'ignore_auctions' => true,
            'require_verified_buy_now' => true,
        ],
        'timeout' => 30,
    ],
];

foreach ($tests as $label => $test) {
    echo "=== {$label} ===" . PHP_EOL;
    $json = postJson($test['url'], $test['body'], $test['timeout']);
    $ok = !empty($json['success']);
    echo ($ok ? 'OK' : 'FAIL') . ' HTTP ' . ($json['_http'] ?? '?') . PHP_EOL;
    if (!$ok && !empty($json['error'])) {
        echo '  error: ' . $json['error'] . PHP_EOL;
    }
    $items = $json['records'] ?? $json['items'] ?? [];
    foreach ($items as $row) {
        $name = (string)($row['market_hash_name'] ?? '?');
        $price = $row['current_price_display'] ?? $row['current_price'] ?? '—';
        $src = $row['steam_price_source'] ?? $row['range_used'] ?? '';
        echo "  {$name} => {$price}" . ($src !== '' ? " [{$src}]" : '') . PHP_EOL;
    }
    echo PHP_EOL;
}

// Compare Steam listing-first vs overview-only
$overview = postJson($base . '/get_roi_prices_cached.php', [
    'market_hash_names' => [$names[0]],
    'source' => 'steam',
    'prefer_live' => true,
    'skip_catalog_fallback' => true,
    'steam_listing_first' => false,
    'steam_listing_fallback' => false,
], 60);
echo "=== steam_overview_only ===" . PHP_EOL;
echo 'success=' . (($overview['success'] ?? false) ? 'yes' : 'no') . PHP_EOL;
foreach ($overview['records'] ?? [] as $row) {
    $src = $row['steam_price_source'] ?? '';
    echo '  ' . ($row['market_hash_name'] ?? '?') . ' => ' . ($row['current_price_display'] ?? '—') . " [{$src}]" . PHP_EOL;
}

$url = 'https://steamcommunity.com/market/priceoverview/?appid=730&currency=3&market_hash_name=' . rawurlencode($names[0]);
$ch = curl_init($url);
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_USERAGENT => 'Mozilla/5.0']);
$raw = (string)(curl_exec($ch) ?: '');
curl_close($ch);
echo "=== steam_priceoverview_raw ===" . PHP_EOL;
echo substr($raw, 0, 300) . PHP_EOL;
