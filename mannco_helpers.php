<?php
declare(strict_types=1);

function manncoConfig(): array
{
    $config = function_exists('appConfig') ? (appConfig()['mannco'] ?? []) : [];
    return is_array($config) ? $config : [];
}

function manncoCacheDir(): string
{
    $dir = __DIR__ . '/assets/mannco-cache';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    return $dir;
}

function manncoPricesCachePath(): string
{
    return manncoCacheDir() . '/prices_csgo.json';
}

function manncoTokenCachePath(): string
{
    return manncoCacheDir() . '/access_token.json';
}

function manncoHistoryCachePath(string $name): string
{
    return manncoCacheDir() . '/' . md5(trim($name)) . '_history.json';
}

function manncoItemUrl(string $name, string $slug = ''): string
{
    $slug = trim($slug);
    if ($slug !== '') {
        return 'https://mannco.store/item/' . rawurlencode($slug);
    }
    return 'https://mannco.store/?search=' . rawurlencode(trim($name));
}

/**
 * Mannco prices are integer USD cents (e.g. 2850 = $28.50). Convert to EUR.
 */
function manncoParsePrice(mixed $value, float $usdToEur = 0.92): ?float
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

function manncoHttpRequest(string $method, string $url, array $config, array $options = []): ?array
{
    $timeout = max(5, (int)($config['timeout_seconds'] ?? 25));
    $headers = ['Accept: application/json', 'User-Agent: CS2MarketTracker/1.0'];
    if (!empty($options['token'])) {
        $headers[] = 'Authorization: Bearer ' . $options['token'];
    }
    if (!empty($options['json_body'])) {
        $headers[] = 'Content-Type: application/json';
    }

    $curl = curl_init($url);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => min(10, $timeout),
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER => $headers,
    ];
    if (strtoupper($method) === 'POST') {
        $opts[CURLOPT_POST] = true;
        if (isset($options['json_body'])) {
            $opts[CURLOPT_POSTFIELDS] = (string)json_encode($options['json_body']);
        }
    }
    curl_setopt_array($curl, $opts);

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
 * Exchange the partner API key for a short-lived JWT (mannco ties the JWT to the
 * requesting IP, so we just cache it and re-login on 401 rather than relying on
 * a fixed TTL).
 */
function manncoAcquireToken(array $config, bool $forceLive = false): string
{
    $apiKey = trim((string)($config['api_key'] ?? ''));
    if ($apiKey === '') {
        return '';
    }

    $cacheFile = manncoTokenCachePath();
    $ttl = 20 * 3600;

    if (!$forceLive && is_file($cacheFile)) {
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        $token = trim((string)($cached['token'] ?? ''));
        $fetchedAt = (int)($cached['fetched_at'] ?? 0);
        if ($token !== '' && $fetchedAt > 0 && (time() - $fetchedAt) < $ttl) {
            return $token;
        }
    }

    $baseUrl = rtrim((string)($config['base_url'] ?? 'https://api.mannco.store'), '/');
    $result = manncoHttpRequest('POST', $baseUrl . '/user/login', $config, [
        'json_body' => ['apiKey' => $apiKey],
    ]);
    $token = trim((string)($result['json']['content']['jwt'] ?? ''));

    if ($token === '') {
        if (is_file($cacheFile)) {
            $cached = json_decode((string)file_get_contents($cacheFile), true);
            return trim((string)($cached['token'] ?? ''));
        }
        return '';
    }

    file_put_contents($cacheFile, (string)json_encode([
        'fetched_at' => time(),
        'token' => $token,
    ]));

    return $token;
}

/**
 * @return array<string, array{price:float,volume:int,url:string,item_id:int}>
 */
function manncoLoadPricesIndex(array $config): array
{
    $ttl = max(60, (int)($config['cache_ttl_seconds'] ?? 1800));
    $cacheFile = manncoPricesCachePath();
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
                'url' => (string)($row['url'] ?? ''),
                'item_id' => isset($row['item_id']) ? (int)$row['item_id'] : 0,
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

    $token = manncoAcquireToken($config);
    if ($token === '') {
        if (is_file($cacheFile)) {
            return $decodeIndex(json_decode((string)file_get_contents($cacheFile), true) ?: null);
        }
        return [];
    }

    $baseUrl = rtrim((string)($config['base_url'] ?? 'https://api.mannco.store'), '/');
    $game = (int)($config['game'] ?? 730);
    $url = $baseUrl . '/item/prices?' . http_build_query(['game' => $game, 'outofstock' => 0]);
    $result = manncoHttpRequest('GET', $url, $config, ['token' => $token]);

    // Token likely expired/IP changed — retry once with a fresh login.
    if (($result['status'] ?? 0) === 401) {
        $token = manncoAcquireToken($config, true);
        if ($token !== '') {
            $result = manncoHttpRequest('GET', $url, $config, ['token' => $token]);
        }
    }

    $rows = is_array($result['json'] ?? null) ? $result['json'] : [];
    $index = [];
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $name = trim((string)($row['name'] ?? ''));
        $price = manncoParsePrice($row['price'] ?? null, $usdToEur);
        if ($name === '' || $price === null) {
            continue;
        }
        $index[$name] = [
            'price' => $price,
            'volume' => isset($row['assetcount']) && is_numeric($row['assetcount']) ? max(0, (int)$row['assetcount']) : 0,
            'url' => (string)($row['url'] ?? ''),
            'item_id' => isset($row['item_id']) ? (int)$row['item_id'] : 0,
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
 * No lightweight public sales-history endpoint is used here (the real one needs a
 * per-item numeric id + extra calls); mirror waxpeer's approach and record just
 * today's snapshot point so charts still get at least one live-priced point.
 *
 * @return list<array{date:string,price:float,volume:int}>
 */
function manncoFetchSalesHistory(string $name, array $config, ?array $index = null): array
{
    $name = trim($name);
    if ($name === '') {
        return [];
    }

    $ttl = max(60, (int)($config['history_cache_ttl_seconds'] ?? 1800));
    $cacheFile = manncoHistoryCachePath($name);

    if (is_file($cacheFile) && (time() - (int)filemtime($cacheFile)) < $ttl) {
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        $points = is_array($cached['points'] ?? null) ? $cached['points'] : [];
        return array_values(array_filter($points, static function ($row): bool {
            return is_array($row) && !empty($row['date']) && isset($row['price']) && (float)$row['price'] > 0;
        }));
    }

    $index = is_array($index) ? $index : manncoLoadPricesIndex($config);
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

function manncoAttachHistoryToItem(array $item, array $historyPoints): array
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

function manncoBuildQuote(string $name, array $config, array $options = []): ?array
{
    $name = trim($name);
    if ($name === '') {
        return null;
    }

    $index = is_array($options['index'] ?? null) ? $options['index'] : manncoLoadPricesIndex($config);
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
        'secondary_metric_label' => 'Mannco.store',
        'secondary_metric_display' => 'Lowest',
        'market_url' => manncoItemUrl($name, (string)($entry['url'] ?? '')),
        'sparkline' => [],
        'price_history' => null,
        'source' => 'mannco',
        'source_label' => 'Mannco.store',
        'available' => true,
        'updated_at' => gmdate(DATE_ATOM),
        'price_verified' => true,
        'fee_pct' => $feePct,
    ];

    if (!empty($options['include_history'])) {
        $history = manncoFetchSalesHistory($name, $config, $index);
        if ($history) {
            $quote = manncoAttachHistoryToItem($quote, $history);
        }
    }

    return $quote;
}

/**
 * @param list<string> $names
 * @return array<string, array<string, mixed>>
 */
function manncoFetchQuotes(array $names, array $config, array $options = []): array
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
    if ($cacheOnly && !is_file(manncoPricesCachePath())) {
        return [];
    }

    $preferLive = !empty($options['prefer_live']) || !empty($options['fresh']) || !empty($options['ignore_cache']);
    $includeHistory = !empty($options['include_history']) || ($preferLive && !$cacheOnly && count($nameList) === 1);

    $index = manncoLoadPricesIndex($config);
    $quotes = [];
    foreach ($nameList as $name) {
        $quote = manncoBuildQuote($name, $config, [
            'index' => $index,
            'include_history' => $includeHistory && count($nameList) === 1,
        ]);
        if (is_array($quote)) {
            $quotes[$name] = $quote;
        }
    }

    return $quotes;
}

function manncoRequestedNames(array $payload): array
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
