<?php
declare(strict_types=1);

/**
 * RapidSkins Public API (https://api.rapidskins.com/docs, OpenAPI at
 * /docs/swagger.json — the account/docs pages block plain fetches behind
 * Cloudflare, but the swagger.json itself is reachable with a normal
 * browser-like User-Agent).
 *
 * Auth: single API key, no login/JWT exchange. Accepted as:
 *   - "Authorization" header (with or without "Bearer " prefix)
 *   - "x-api-key" header
 *   - ?api_key= query param
 * We use the Authorization header.
 *
 * GET /stock/listings?appId=730 returns a map of every in-stock item for the
 * app: { success, listings: { "<market_hash_name>": { price, count } } }.
 * price is in USD cents. There's no per-item URL or sales-history endpoint,
 * so (like Mannco) we synthesize a single-point "history" from the live price.
 */

function rapidskinsConfig(): array
{
    $config = function_exists('appConfig') ? (appConfig()['rapidskins'] ?? []) : [];
    return is_array($config) ? $config : [];
}

function rapidskinsCacheDir(): string
{
    $dir = __DIR__ . '/assets/rapidskins-cache';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    return $dir;
}

function rapidskinsPricesCachePath(): string
{
    return rapidskinsCacheDir() . '/prices_csgo.json';
}

function rapidskinsHistoryCachePath(string $name): string
{
    return rapidskinsCacheDir() . '/' . md5(trim($name)) . '_history.json';
}

/**
 * Deep-link to the RapidSkins buy board filtered to one market hash name.
 *
 * /market returns 404, and the apex -> www redirect drops the query string, so
 * the URL must be www + /buy?marketHashNames=<name>.
 */
function rapidskinsItemUrl(string $name): string
{
    return 'https://www.rapidskins.com/buy?marketHashNames=' . rawurlencode(trim($name));
}

/**
 * RapidSkins prices are integer USD cents (e.g. 2850 = $28.50). Convert to EUR.
 */
function rapidskinsParsePrice(mixed $value, float $usdToEur = 0.92): ?float
{
    if (!is_numeric($value)) {
        return null;
    }
    $cents = (float)$value;
    if (!is_finite($cents) || $cents <= 0) {
        return null;
    }
    $usd = $cents / 100.0;
    $rate = max(0.01, $usdToEur);
    $eur = $usd * $rate;
    return round($eur, $eur < 1 ? 4 : 2);
}

function rapidskinsHttpRequest(string $url, array $config): ?array
{
    $timeout = max(5, (int)($config['timeout_seconds'] ?? 25));
    $apiKey = trim((string)($config['api_key'] ?? ''));

    $headers = ['Accept: application/json', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'];
    if ($apiKey !== '') {
        $headers[] = 'Authorization: ' . $apiKey;
    }

    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => min(10, $timeout),
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER => $headers,
    ]);

    $responseBody = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);

    if ($responseBody === false) {
        return null;
    }
    $decoded = json_decode((string)$responseBody, true);
    return [
        'status' => $status,
        'json' => is_array($decoded) ? $decoded : [],
    ];
}

/**
 * @return array<string, array{price:float,volume:int}>
 */
function rapidskinsLoadPricesIndex(array $config): array
{
    $ttl = max(60, (int)($config['cache_ttl_seconds'] ?? 1800));
    $cacheFile = rapidskinsPricesCachePath();
    $usdToEur = (float)($config['usd_to_eur'] ?? 0.92);

    $decodeIndex = static function (?array $cached): array {
        $index = is_array($cached['index'] ?? null) ? $cached['index'] : [];
        $out = [];
        foreach ($index as $name => $row) {
            if (!is_array($row) || !isset($row['price']) || (float)$row['price'] <= 0) {
                continue;
            }
            $out[(string)$name] = [
                'price' => (float)$row['price'],
                'volume' => isset($row['volume']) ? max(0, (int)$row['volume']) : 0,
            ];
        }
        return $out;
    };

    if (is_file($cacheFile) && (time() - (int)filemtime($cacheFile)) < $ttl) {
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        $out = $decodeIndex(is_array($cached) ? $cached : null);
        if ($out) {
            return $out;
        }
    }

    $apiKey = trim((string)($config['api_key'] ?? ''));
    if ($apiKey === '') {
        if (is_file($cacheFile)) {
            return $decodeIndex(json_decode((string)file_get_contents($cacheFile), true) ?: null);
        }
        return [];
    }

    $baseUrl = rtrim((string)($config['base_url'] ?? 'https://api.rapidskins.com/api/v1'), '/');
    $appId = (string)($config['app_id'] ?? '730');
    $url = $baseUrl . '/stock/listings?' . http_build_query(['appId' => $appId]);
    $result = rapidskinsHttpRequest($url, $config);

    $listings = is_array($result['json']['listings'] ?? null) ? $result['json']['listings'] : [];
    $index = [];
    foreach ($listings as $name => $row) {
        if (!is_array($row)) {
            continue;
        }
        $name = trim((string)$name);
        $price = rapidskinsParsePrice($row['price'] ?? null, $usdToEur);
        if ($name === '' || $price === null) {
            continue;
        }
        $index[$name] = [
            'price' => $price,
            'volume' => isset($row['count']) && is_numeric($row['count']) ? max(0, (int)$row['count']) : 0,
        ];
    }

    if ($index) {
        file_put_contents($cacheFile, (string)json_encode([
            'fetched_at' => time(),
            'usd_to_eur' => $usdToEur,
            'index' => $index,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        return $index;
    }

    if (is_file($cacheFile)) {
        return $decodeIndex(json_decode((string)file_get_contents($cacheFile), true) ?: null);
    }

    return [];
}

/**
 * No sales-history endpoint is published — record just today's snapshot point
 * so charts still get at least one live-priced point (same approach as the
 * Mannco/Waxpeer integrations).
 *
 * @return list<array{date:string,price:float,volume:int}>
 */
function rapidskinsFetchSalesHistory(string $name, array $config, ?array $index = null): array
{
    $name = trim($name);
    if ($name === '') {
        return [];
    }

    $ttl = max(60, (int)($config['history_cache_ttl_seconds'] ?? 1800));
    $cacheFile = rapidskinsHistoryCachePath($name);

    if (is_file($cacheFile) && (time() - (int)filemtime($cacheFile)) < $ttl) {
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        $points = is_array($cached['points'] ?? null) ? $cached['points'] : [];
        return array_values(array_filter($points, static function ($row): bool {
            return is_array($row) && !empty($row['date']) && isset($row['price']) && (float)$row['price'] > 0;
        }));
    }

    $index = is_array($index) ? $index : rapidskinsLoadPricesIndex($config);
    $entry = is_array($index[$name] ?? null) ? $index[$name] : null;
    $price = $entry !== null ? (float)($entry['price'] ?? 0) : 0.0;
    if ($price <= 0) {
        return [];
    }

    $volume = isset($entry['volume']) ? max(1, (int)$entry['volume']) : 1;
    $points = [[
        'date' => gmdate('Y-m-d'),
        'price' => round($price, $price < 1 ? 4 : 2),
        'volume' => $volume,
    ]];

    file_put_contents($cacheFile, (string)json_encode([
        'fetched_at' => time(),
        'points' => $points,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

    return $points;
}

function rapidskinsAttachHistoryToItem(array $item, array $historyPoints): array
{
    if (!$historyPoints) {
        return $item;
    }
    $item['price_history'] = $historyPoints;
    $item['sparkline'] = array_values(array_map(
        static fn(array $point): float => (float)($point['price'] ?? 0),
        array_slice($historyPoints, -30)
    ));
    return $item;
}

function rapidskinsBuildQuote(string $name, array $config, array $options = []): ?array
{
    $name = trim($name);
    if ($name === '') {
        return null;
    }

    $index = is_array($options['index'] ?? null) ? $options['index'] : rapidskinsLoadPricesIndex($config);
    $entry = is_array($index[$name] ?? null) ? $index[$name] : null;
    $price = $entry !== null ? (float)($entry['price'] ?? 0) : 0.0;
    if ($price <= 0) {
        return null;
    }

    $feePct = (float)($config['default_fee_pct'] ?? 0.0);
    $listings = isset($options['listings']) && is_numeric($options['listings'])
        ? max(0, (int)$options['listings'])
        : (isset($entry['volume']) ? max(0, (int)$entry['volume']) : 0);

    $quote = [
        'market_hash_name' => $name,
        'current_price' => $price,
        'current_price_display' => '€' . number_format($price, $price < 1 ? 4 : 2, '.', ''),
        'listings' => $listings,
        'listings_display' => $listings > 0 ? number_format($listings) . ' listings' : '—',
        'sell_orders' => $listings,
        'roi_pct' => null,
        'roi_display' => '—',
        'profit_display' => '—',
        'baseline_price_display' => '—',
        'range_used' => 'prices_index',
        'range_notice' => '',
        'secondary_metric_label' => 'RapidSkins',
        'secondary_metric_display' => 'Lowest',
        'market_url' => rapidskinsItemUrl($name),
        'sparkline' => [],
        'price_history' => null,
        'source' => 'rapidskins',
        'source_label' => 'RapidSkins',
        'available' => true,
        'updated_at' => gmdate(DATE_ATOM),
        'price_verified' => true,
        'fee_pct' => $feePct,
    ];

    if (!empty($options['include_history'])) {
        $history = rapidskinsFetchSalesHistory($name, $config, $index);
        if ($history) {
            $quote = rapidskinsAttachHistoryToItem($quote, $history);
        }
    }

    return $quote;
}

/**
 * @param list<string> $names
 * @return array<string, array<string, mixed>>
 */
function rapidskinsFetchQuotes(array $names, array $config, array $options = []): array
{
    $cleanNames = [];
    foreach ($names as $name) {
        $clean = trim((string)$name);
        if ($clean !== '') {
            $cleanNames[$clean] = true;
        }
    }
    $nameList = array_keys($cleanNames);
    if (!$nameList) {
        return [];
    }

    $apiKey = trim((string)($config['api_key'] ?? ''));
    if ($apiKey === '') {
        return [];
    }

    $cacheOnly = !empty($options['cache_only']);
    if ($cacheOnly && !is_file(rapidskinsPricesCachePath())) {
        return [];
    }

    $preferLive = !empty($options['prefer_live']) || !empty($options['fresh']) || !empty($options['ignore_cache']);
    $includeHistory = !empty($options['include_history']) || ($preferLive && !$cacheOnly && count($nameList) === 1);

    $index = rapidskinsLoadPricesIndex($config);
    $quotes = [];
    foreach ($nameList as $name) {
        $quote = rapidskinsBuildQuote($name, $config, [
            'index' => $index,
            'include_history' => $includeHistory && count($nameList) === 1,
        ]);
        if (is_array($quote)) {
            $quotes[$name] = $quote;
        }
    }

    return $quotes;
}

/**
 * Single-item convenience wrapper around the cached index, used by
 * get_market_chart_bundle.php the same way haloskinsLoadCachedQuote() is.
 *
 * @return array{price:float,volume:int}|null
 */
function rapidskinsLoadCachedQuote(string $name, array $config, bool $allowStale = false): ?array
{
    $name = trim($name);
    if ($name === '') {
        return null;
    }

    $ttl = max(60, (int)($config['cache_ttl_seconds'] ?? 1800));
    $cacheFile = rapidskinsPricesCachePath();
    if (!is_file($cacheFile)) {
        return null;
    }

    $age = time() - (int)filemtime($cacheFile);
    if (!$allowStale && $age >= $ttl) {
        return null;
    }

    $cached = json_decode((string)file_get_contents($cacheFile), true);
    $entry = is_array($cached['index'][$name] ?? null) ? $cached['index'][$name] : null;
    if (!$entry || !isset($entry['price']) || (float)$entry['price'] <= 0) {
        return null;
    }

    return [
        'price' => (float)$entry['price'],
        'volume' => isset($entry['volume']) ? max(0, (int)$entry['volume']) : 0,
    ];
}

function rapidskinsRequestedNames(array $payload): array
{
    $names = $payload['market_hash_names'] ?? [];
    if (is_string($names)) {
        $names = array_map('trim', explode(',', $names));
    }

    $result = [];
    foreach ((array)$names as $name) {
        $clean = trim((string)$name);
        if ($clean !== '') {
            $result[] = $clean;
        }
    }

    return array_values(array_unique($result));
}
