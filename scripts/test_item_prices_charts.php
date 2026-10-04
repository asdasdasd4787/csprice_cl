<?php
declare(strict_types=1);

/**
 * Integration test: item prices + chart bundles for representative skins.
 *
 * Usage:
 *   php scripts/test_item_prices_charts.php
 *   php scripts/test_item_prices_charts.php --refresh
 *   php scripts/test_item_prices_charts.php --base=http://localhost/csgo_price_tracker
 */

set_time_limit(0);

$opts = getopt('', ['refresh', 'base::', 'json']);
$refresh = isset($opts['refresh']);
$baseUrl = rtrim((string)($opts['base'] ?? 'http://localhost/csgo_price_tracker'), '/');
$jsonOut = isset($opts['json']);

require_once __DIR__ . '/../app_bootstrap.php';
require_once __DIR__ . '/../white_market_history_lib.php';

$fixtures = [
    [
        'lookup' => 'MAC-10 | Neon Rider',
        'wear' => 'Factory New',
        'tags' => ['wear_skin', 'white_market'],
    ],
    [
        'lookup' => '★ Driver Gloves | Racing Green',
        'wear' => 'Factory New',
        'tags' => ['wear_skin', 'gloves'],
    ],
    [
        'lookup' => 'MP5-SD | Agent',
        'wear' => 'Factory New',
        'tags' => ['wear_skin', 'white_market'],
    ],
    [
        'lookup' => 'MAG-7 | Insomnia',
        'wear' => 'Factory New',
        'tags' => ['wear_skin'],
    ],
    [
        'lookup' => 'AK-47 | Redline',
        'wear' => 'Field-Tested',
        'tags' => ['wear_skin'],
    ],
    [
        'lookup' => 'AWP | Asiimov',
        'wear' => 'Field-Tested',
        'tags' => ['wear_skin'],
    ],
    [
        'lookup' => 'M4A1-S | Vaporwave',
        'wear' => 'Factory New',
        'tags' => ['wear_skin'],
    ],
    [
        'lookup' => 'Glock-18 | Water Elemental',
        'wear' => 'Factory New',
        'tags' => ['wear_skin'],
    ],
];

$wearOptions = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
$providers = ['steam', 'skinport', 'csfloat', 'white_market', 'dmarket'];

function logLine(string $message): void
{
    global $jsonOut;
    if (!$jsonOut) {
        echo $message . PHP_EOL;
    }
}

function wearMarketName(string $base, string $wear): string
{
    return "{$base} ({$wear})";
}

function postJson(string $url, array $payload, int $timeout = 60): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => min(10, $timeout),
    ]);
    $body = (string)(curl_exec($ch) ?: '');
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    $decoded = json_decode($body, true);
    return [
        'http' => $code,
        'json' => is_array($decoded) ? $decoded : null,
        'raw' => $body,
    ];
}

function getJson(string $url, int $timeout = 90): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => min(10, $timeout),
    ]);
    $body = (string)(curl_exec($ch) ?: '');
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    $decoded = json_decode($body, true);
    return [
        'http' => $code,
        'json' => is_array($decoded) ? $decoded : null,
        'raw' => $body,
    ];
}

function positivePrice($value): ?float
{
    $price = is_numeric($value) ? (float)$value : 0.0;
    return $price > 0 ? $price : null;
}

function marketplaceOutlier(?float $price, ?float $steamPrice): bool
{
    if ($price === null || $steamPrice === null || $steamPrice <= 0) {
        return false;
    }
    $ratio = $price / $steamPrice;
    return $ratio > 80 || $ratio < 0.008;
}

function seriesEndpointLooksSynthetic(array $points): bool
{
    if (count($points) < 2) {
        return true;
    }
    return count($points) > 0 && count(array_filter($points, static fn(array $p): bool => empty($p['synthetic']))) === 0;
}

function seriesMatchesSteamScale(array $steamPoints, array $providerPoints): bool
{
    $steam = array_values(array_filter($steamPoints, static fn(array $p): bool => positivePrice($p['price'] ?? null) !== null));
    $provider = array_values(array_filter($providerPoints, static fn(array $p): bool => positivePrice($p['price'] ?? null) !== null));
    if (count($steam) < 8 || count($provider) < 8) {
        return false;
    }

    $steamLast = positivePrice($steam[count($steam) - 1]['price'] ?? null);
    $providerLast = positivePrice($provider[count($provider) - 1]['price'] ?? null);
    if ($steamLast === null || $providerLast === null) {
        return false;
    }

    $ratio = $providerLast / $steamLast;
    if (abs($ratio - 1.0) > 0.04) {
        return false;
    }

    $matches = 0;
    $samples = min(12, count($steam), count($provider));
    for ($i = 0; $i < $samples; $i++) {
        $s = positivePrice($steam[count($steam) - 1 - $i]['price'] ?? null);
        $p = positivePrice($provider[count($provider) - 1 - $i]['price'] ?? null);
        if ($s !== null && $p !== null && abs(($p / $s) - 1.0) < 0.04) {
            $matches++;
        }
    }

    return $matches >= (int)ceil($samples * 0.75);
}

function refreshMarketData(string $baseUrl): array
{
    $results = [];
    $cfg = appConfig()['white_market'] ?? [];
    $exportUrl = trim((string)($cfg['export_url'] ?? 'https://export.white.market/v1/prices/730.json'));
    $cacheDir = __DIR__ . '/../assets/white-market-cache';
    $cacheFile = $cacheDir . '/prices_730.json';
    if (!is_dir($cacheDir)) {
        mkdir($cacheDir, 0755, true);
    }

    logLine('Downloading White.Market export…');
    $ch = curl_init($exportUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
        CURLOPT_USERAGENT => 'CS2MarketTracker/1.0',
    ]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($body !== false && $status >= 200 && $status < 300) {
        file_put_contents($cacheFile, (string)$body);
        $results['white_market_export'] = 'ok';
    } else {
        $results['white_market_export'] = 'failed HTTP ' . $status;
    }

    $php = PHP_BINARY !== '' ? PHP_BINARY : 'php';
    $syncScript = __DIR__ . '/../sync_market_prices.php';
    logLine('Syncing marketplace_price_cache (optional DB)…');
    ob_start();
    passthru('"' . $php . '" "' . $syncScript . '"', $exitCode);
    ob_end_clean();
    $results['sync_market_prices'] = $exitCode === 0 ? 'ok' : 'exit ' . $exitCode;

    return $results;
}

function fetchChartBundle(string $baseUrl, string $lookup, string $wear, string $range = '1Y'): array
{
    $url = $baseUrl . '/get_market_chart_bundle.php?' . http_build_query([
        'lookup_name' => $lookup,
        'wear' => $wear,
        'range' => $range,
        'source' => 'all',
        'item_id' => 1,
    ]);
    $resp = getJson($url, 180);
    return is_array($resp['json'] ?? null) ? $resp['json'] : [
        'success' => false,
        'error' => 'HTTP ' . ($resp['http'] ?? 0),
    ];
}

function fetchSteamWearPrices(string $baseUrl, string $lookup): array
{
    $url = $baseUrl . '/get_steam_wear_prices.php?' . http_build_query([
        'lookup_name' => $lookup,
        'prefer_live' => '1',
    ]);
    $resp = getJson($url, 120);
    return is_array($resp['json'] ?? null) ? $resp['json'] : [
        'success' => false,
        'error' => 'HTTP ' . ($resp['http'] ?? 0),
    ];
}

function buildWearNames(string $base): array
{
    global $wearOptions;
    return array_map(static fn(string $wear): string => wearMarketName($base, $wear), $wearOptions);
}

function testFixture(array $fixture, string $baseUrl): array
{
    global $providers, $wearOptions;

    $lookup = (string)$fixture['lookup'];
    $wear = (string)$fixture['wear'];
    $marketHash = wearMarketName($lookup, $wear);
    $issues = [];
    $details = [
        'lookup' => $lookup,
        'wear' => $wear,
        'market_hash_name' => $marketHash,
        'providers' => [],
        'chart' => [],
    ];

    $bundle = fetchChartBundle($baseUrl, $lookup, $wear, '1Y');
    if (empty($bundle['success'])) {
        $issues[] = 'chart bundle failed: ' . (string)($bundle['error'] ?? 'unknown');
        return ['ok' => false, 'issues' => $issues, 'details' => $details];
    }

    $seriesRoot = $bundle['series'] ?? [];
    $steamPoints = is_array($seriesRoot['steam']['points'] ?? null) ? $seriesRoot['steam']['points'] : [];
    $steamPrice = positivePrice($seriesRoot['steam']['current_price'] ?? null)
        ?? positivePrice($steamPoints[count($steamPoints) - 1]['price'] ?? null);

    foreach ($providers as $source) {
        $entry = is_array($seriesRoot[$source] ?? null) ? $seriesRoot[$source] : null;
        $points = is_array($entry['points'] ?? null) ? $entry['points'] : [];
        $count = count($points);
        $current = positivePrice($entry['current_price'] ?? null);
        $marketUrl = trim((string)($entry['market_url'] ?? ''));

        $details['chart'][$source] = [
            'points' => $count,
            'current_price' => $current,
            'synthetic' => seriesEndpointLooksSynthetic($points),
            'market_url' => $marketUrl,
        ];

        if ($count < 2) {
            $issues[] = "{$source}: chart has {$count} points";
            continue;
        }

        if ($source === 'white_market') {
            if ($marketUrl !== '' && str_contains($marketUrl, '/search?query=')) {
                $issues[] = 'white_market: broken search URL in chart bundle';
            }
            if ($steamPrice !== null && $current !== null && marketplaceOutlier($current, $steamPrice)) {
                $issues[] = "white_market: chart price outlier vs steam ({$current} vs {$steamPrice})";
            }
            if ($steamPrice !== null && $current !== null && abs($current - $steamPrice) < 0.05 && $lookup === 'MAC-10 | Neon Rider') {
                $issues[] = 'white_market: chart price equals Steam (expected third-party price)';
            }
            if (seriesMatchesSteamScale($steamPoints, $points) && !seriesEndpointLooksSynthetic($points)) {
                $issues[] = 'white_market: chart series is a Steam copy';
            }
        }
    }

    $wearNames = buildWearNames($lookup);
    $quoteResp = postJson($baseUrl . '/get_white_market_prices.php', [
        'market_hash_names' => $wearNames,
        'prefer_live' => true,
        'cache_only' => false,
    ], 120);
    $quoteJson = $quoteResp['json'] ?? [];
    if (empty($quoteJson['success'])) {
        $issues[] = 'white_market quotes API failed';
    } else {
        $items = is_array($quoteJson['items'] ?? null) ? $quoteJson['items'] : [];
        $byName = [];
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $name = trim((string)($item['market_hash_name'] ?? ''));
            if ($name !== '') {
                $byName[$name] = $item;
            }
        }

        $selected = $byName[$marketHash] ?? null;
        $wmPrice = positivePrice($selected['current_price'] ?? null);
        $wmUrl = trim((string)($selected['market_url'] ?? ''));
        $history = $selected['price_history'] ?? null;
        $historyCount = is_array($history) ? count($history) : 0;

        $details['providers']['white_market'] = [
            'price' => $wmPrice,
            'listings' => (int)($selected['listings'] ?? 0),
            'market_url' => $wmUrl,
            'history_points' => $historyCount,
            'range_used' => (string)($selected['range_used'] ?? ''),
        ];

        if ($wmPrice === null) {
            $issues[] = 'white_market: missing live/export price for selected wear';
        }
        if ($wmUrl !== '' && str_contains($wmUrl, '/search?query=')) {
            $issues[] = 'white_market: broken search URL in quotes API';
        }
        if ($steamPrice !== null && $wmPrice !== null && marketplaceOutlier($wmPrice, $steamPrice)) {
            $issues[] = "white_market: quote outlier vs steam ({$wmPrice} vs {$steamPrice})";
        }

        $ownershipTotal = 0;
        foreach ($wearNames as $wearName) {
            $row = $byName[$wearName] ?? null;
            $ownershipTotal += max(0, (int)($row['listings'] ?? 0));
        }
        $details['providers']['white_market']['ownership_all_wears'] = $ownershipTotal;
        if ($ownershipTotal <= 0) {
            $issues[] = 'white_market: no listings across wears for ownership chart';
        }
    }

    $steamWearJson = fetchSteamWearPrices($baseUrl, $lookup);
    $steamWearRows = is_array($steamWearJson['quality_rows'] ?? null) ? $steamWearJson['quality_rows'] : [];
    if (!$steamWearRows && !empty($steamWearJson['error'])) {
        $issues[] = 'steam wear prices failed: ' . (string)$steamWearJson['error'];
    } elseif (!$steamWearRows) {
        $issues[] = 'steam wear prices failed: empty response';
    } else {
        $rows = $steamWearRows;
        $wearPrices = 0;
        foreach ($rows as $row) {
            if (positivePrice($row['price'] ?? $row['priceGross'] ?? null) !== null) {
                $wearPrices++;
            }
        }
        $details['providers']['steam_wear_rows'] = $wearPrices;
        if ($wearPrices < 2) {
            $issues[] = "steam: fewer than 2 wear prices ({$wearPrices})";
        }
    }

    $otherProviders = [
        'skinport' => $baseUrl . '/get_roi_prices_cached.php',
        'csfloat' => $baseUrl . '/get_csfloat_prices.php',
        'dmarket' => $baseUrl . '/get_dmarket_prices.php',
    ];
    foreach ($otherProviders as $source => $url) {
        $body = [
            'market_hash_names' => [$marketHash],
            'prefer_live' => true,
            'cache_only' => false,
        ];
        if ($source === 'skinport') {
            $body['source'] = 'skinport';
        }
        if ($source === 'dmarket') {
            $body['max_live_requests'] = 1;
        }
        if ($source === 'csfloat') {
            $body['ignore_auctions'] = true;
            $body['require_verified_buy_now'] = true;
        }

        $resp = postJson($url, $body, 90);
        $json = $resp['json'] ?? [];
        $items = $json['records'] ?? $json['items'] ?? [];
        $row = is_array($items[0] ?? null) ? $items[0] : null;
        $price = positivePrice($row['current_price'] ?? $row['price'] ?? null);
        $details['providers'][$source] = [
            'price' => $price,
            'http' => $resp['http'],
            'success' => !empty($json['success']),
        ];
        if (empty($json['success']) || $price === null) {
            $isGlove = in_array('gloves', $fixture['tags'] ?? [], true);
            if ($source === 'skinport' && $isGlove) {
                $details['providers'][$source] = [
                    'price' => null,
                    'http' => $resp['http'],
                    'success' => false,
                    'skipped' => 'gloves often lack Skinport listings',
                ];
                continue;
            }
            $issues[] = "{$source}: missing price for selected wear";
        } elseif ($steamPrice !== null && marketplaceOutlier($price, $steamPrice)) {
            $issues[] = "{$source}: price outlier vs steam ({$price} vs {$steamPrice})";
        }
    }

    return [
        'ok' => $issues === [],
        'issues' => $issues,
        'details' => $details,
    ];
}

$refreshResults = [];
logLine('Item prices + charts test');
logLine('Base URL: ' . $baseUrl);
logLine('Fixtures: ' . count($fixtures));
if ($refresh) {
    logLine('Data refresh: enabled');
    $refreshResults = refreshMarketData($baseUrl);
}
logLine('');

$results = [];
$passed = 0;
$failed = 0;

foreach ($fixtures as $fixture) {
    $result = testFixture($fixture, $baseUrl);
    $results[] = $result;
    $label = $fixture['lookup'] . ' (' . $fixture['wear'] . ')';

    if ($result['ok']) {
        $passed++;
        logLine("PASS  {$label}");
        $wm = $result['details']['providers']['white_market'] ?? null;
        if (is_array($wm)) {
            logLine('      WM €' . ($wm['price'] ?? '—') . ', ownership=' . ($wm['ownership_all_wears'] ?? 0) . ', history=' . ($wm['history_points'] ?? 0));
        }
    } else {
        $failed++;
        logLine("FAIL  {$label}");
        foreach ($result['issues'] as $issue) {
            logLine('      - ' . $issue);
        }
    }
}

$report = [
    'generated_at' => date('c'),
    'base_url' => $baseUrl,
    'refresh' => $refresh,
    'refresh_results' => $refreshResults,
    'passed' => $passed,
    'failed' => $failed,
    'total' => count($fixtures),
    'results' => $results,
];

$reportPath = __DIR__ . '/test_item_prices_charts_report.json';
file_put_contents($reportPath, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

logLine('');
logLine("Summary: {$passed}/" . count($fixtures) . ' passed, ' . $failed . ' failed');
logLine('Report: scripts/test_item_prices_charts_report.json');

if ($jsonOut) {
    echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
}

exit($failed > 0 ? 1 : 0);
