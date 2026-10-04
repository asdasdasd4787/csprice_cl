<?php
declare(strict_types=1);

function waxpeerConfig(): array
{
    $config = function_exists('appConfig') ? (appConfig()['waxpeer'] ?? []) : [];
    return is_array($config) ? $config : [];
}

function waxpeerCacheDir(): string
{
    $dir = __DIR__ . '/assets/waxpeer-cache';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    return $dir;
}

function waxpeerPricesCachePath(): string
{
    return waxpeerCacheDir() . '/prices_csgo.json';
}

function waxpeerHistoryCachePath(string $name): string
{
    return waxpeerCacheDir() . '/' . md5(trim($name)) . '_history.json';
}

function waxpeerItemUrl(string $name): string
{
    return 'https://waxpeer.com/?search=' . rawurlencode(trim($name));
}

/**
 * Waxpeer min is 1000 = $1 USD. Convert to EUR via usd_to_eur.
 */
function waxpeerParsePrice(mixed $value, float $usdToEur = 0.92): ?float
{
    if (!is_numeric($value)) {
        return null;
    }

    $min = (float)$value;
    if (!is_finite($min) || $min <= 0) {
        return null;
    }

    $usd = $min / 1000.0;
    $rate = max(0.01, $usdToEur);
    $eur = $usd * $rate;
    return round($eur, $eur < 1 ? 4 : 2);
}

function waxpeerHttpGet(string $url, array $config): ?array
{
    $timeout = max(5, (int)($config['timeout_seconds'] ?? 30));

    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => min(10, $timeout),
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'User-Agent: CS2MarketTracker/1.0',
        ],
    ]);

    $responseBody = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);

    if ($responseBody === false || $status < 200 || $status >= 300) {
        return null;
    }

    $decoded = json_decode((string)$responseBody, true);
    return is_array($decoded) ? $decoded : null;
}

/**
 * @return array<string, array{price:float,volume:int}>
 */
function waxpeerLoadPricesIndex(array $config): array
{
    $ttl = max(60, (int)($config['cache_ttl_seconds'] ?? 300));
    $cacheFile = waxpeerPricesCachePath();
    $usdToEur = (float)($config['usd_to_eur'] ?? 0.92);

    $decodeIndex = static function (?array $cached): array {
        $index = is_array($cached['index'] ?? null) ? $cached['index'] : [];
        $out = [];
        foreach ($index as $name => $row) {
            if (!is_array($row)) {
                continue;
            }
            $price = isset($row['price']) && is_numeric($row['price']) ? (float)$row['price'] : 0.0;
            if ($price <= 0) {
                continue;
            }
            $volume = isset($row['volume']) && is_numeric($row['volume']) ? max(0, (int)$row['volume']) : 0;
            $out[(string)$name] = ['price' => $price, 'volume' => $volume];
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
            $cached = json_decode((string)file_get_contents($cacheFile), true);
            return $decodeIndex(is_array($cached) ? $cached : null);
        }
        return [];
    }

    $baseUrl = rtrim((string)($config['base_url'] ?? 'https://api.waxpeer.com'), '/');
    $game = trim((string)($config['game'] ?? 'csgo')) ?: 'csgo';
    $url = $baseUrl . '/v1/prices?' . http_build_query([
        'game' => $game,
        'api' => $apiKey,
    ]);
    $payload = waxpeerHttpGet($url, $config);
    $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
    $index = [];

    foreach ($items as $row) {
        if (!is_array($row)) {
            continue;
        }
        $name = trim((string)($row['name'] ?? $row['market_hash_name'] ?? ''));
        $price = waxpeerParsePrice($row['min'] ?? null, $usdToEur);
        if ($name === '' || $price === null) {
            continue;
        }
        $volume = isset($row['count']) && is_numeric($row['count']) ? max(0, (int)$row['count']) : 0;
        $index[$name] = ['price' => $price, 'volume' => $volume];
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
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        return $decodeIndex(is_array($cached) ? $cached : null);
    }

    return [];
}

/**
 * No public history API — return empty or a single current-price point dated today.
 *
 * @return list<array{date:string,price:float,volume:int}>
 */
function waxpeerFetchSalesHistory(string $name, array $config, ?array $index = null): array
{
    $name = trim($name);
    if ($name === '') {
        return [];
    }

    $ttl = max(60, (int)($config['history_cache_ttl_seconds'] ?? 1800));
    $cacheFile = waxpeerHistoryCachePath($name);

    if (is_file($cacheFile) && (time() - (int)filemtime($cacheFile)) < $ttl) {
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        $points = is_array($cached['points'] ?? null) ? $cached['points'] : [];
        return array_values(array_filter($points, static function ($row): bool {
            return is_array($row)
                && !empty($row['date'])
                && isset($row['price'])
                && is_numeric($row['price'])
                && (float)$row['price'] > 0;
        }));
    }

    $index = is_array($index) ? $index : waxpeerLoadPricesIndex($config);
    $entry = is_array($index[$name] ?? null) ? $index[$name] : null;
    $price = $entry !== null && isset($entry['price']) && is_numeric($entry['price'])
        ? (float)$entry['price']
        : 0.0;

    if ($price <= 0) {
        return [];
    }

    $volume = isset($entry['volume']) && is_numeric($entry['volume']) ? max(1, (int)$entry['volume']) : 1;
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

function waxpeerAttachHistoryToItem(array $item, array $historyPoints): array
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

function waxpeerBuildQuote(string $name, array $config, array $options = []): ?array
{
    $name = trim($name);
    if ($name === '') {
        return null;
    }

    $index = is_array($options['index'] ?? null)
        ? $options['index']
        : waxpeerLoadPricesIndex($config);

    $entry = is_array($index[$name] ?? null) ? $index[$name] : null;

    $price = $entry !== null && isset($entry['price']) && is_numeric($entry['price'])
        ? (float)$entry['price']
        : 0.0;
    if ($price <= 0) {
        return null;
    }

    $feePct = (float)($config['default_fee_pct'] ?? 2.0);
    $listings = isset($options['listings']) && is_numeric($options['listings'])
        ? max(0, (int)$options['listings'])
        : (isset($entry['volume']) && is_numeric($entry['volume']) ? max(0, (int)$entry['volume']) : 0);

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
        'secondary_metric_label' => 'Waxpeer',
        'secondary_metric_display' => 'Lowest',
        'market_url' => waxpeerItemUrl($name),
        'sparkline' => [],
        'price_history' => null,
        'source' => 'waxpeer',
        'source_label' => 'Waxpeer',
        'available' => true,
        'updated_at' => gmdate(DATE_ATOM),
        'price_verified' => true,
        'fee_pct' => $feePct,
    ];

    if (!empty($options['include_history'])) {
        $history = waxpeerFetchSalesHistory($name, $config, $index);
        if ($history) {
            $quote = waxpeerAttachHistoryToItem($quote, $history);
        }
    }

    return $quote;
}

/**
 * @param list<string> $names
 * @return array<string, array<string, mixed>>
 */
function waxpeerFetchQuotes(array $names, array $config, array $options = []): array
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
    $preferLive = !empty($options['prefer_live']) || !empty($options['fresh']) || !empty($options['ignore_cache']);
    $includeHistory = !empty($options['include_history'])
        || ($preferLive && !$cacheOnly && count($nameList) === 1);

    if ($cacheOnly) {
        $cacheFile = waxpeerPricesCachePath();
        if (!is_file($cacheFile)) {
            return [];
        }
    }

    $index = waxpeerLoadPricesIndex($config);
    $quotes = [];
    foreach ($nameList as $name) {
        $quote = waxpeerBuildQuote($name, $config, [
            'index' => $index,
            'include_history' => $includeHistory && count($nameList) === 1,
        ]);
        if (is_array($quote)) {
            $quotes[$name] = $quote;
        }
    }

    return $quotes;
}

function waxpeerRequestedNames(array $payload): array
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
