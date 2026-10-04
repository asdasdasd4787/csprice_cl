<?php
declare(strict_types=1);

function haloskinsConfig(): array
{
    $config = function_exists('appConfig') ? (appConfig()['haloskins'] ?? []) : [];
    return is_array($config) ? $config : [];
}

function haloskinsCacheDir(): string
{
    $dir = __DIR__ . '/assets/haloskins-cache';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    return $dir;
}

function haloskinsQuoteCachePath(string $name): string
{
    return haloskinsCacheDir() . '/' . md5(trim($name)) . '_quote.json';
}

function haloskinsHistoryCachePath(string $name): string
{
    return haloskinsCacheDir() . '/' . md5(trim($name)) . '_history.json';
}

function haloskinsItemUrl(string $name): string
{
    return 'https://www.haloskins.com/market?keyword=' . rawurlencode(trim($name));
}

/**
 * HaloSkins prices are USD dollars (not cents). Convert to EUR via usd_to_eur.
 */
function haloskinsParsePrice(mixed $value, float $usdToEur = 0.92): ?float
{
    if (!is_numeric($value)) {
        return null;
    }

    $usd = (float)$value;
    if (!is_finite($usd) || $usd <= 0) {
        return null;
    }

    $rate = max(0.01, $usdToEur);
    $eur = $usd * $rate;
    return round($eur, $eur < 1 ? 4 : 2);
}

/**
 * @return array{price:float,volume:int}|null
 */
function &haloskinsMemoryIndex(): array
{
    static $index = [];
    return $index;
}

function haloskinsRememberQuote(string $name, float $price, int $volume): void
{
    $name = trim($name);
    if ($name === '' || $price <= 0) {
        return;
    }
    $index = &haloskinsMemoryIndex();
    $index[$name] = [
        'price' => $price,
        'volume' => max(0, $volume),
        'fetched_at' => time(),
    ];
}

/**
 * @return array{price:float,volume:int}|null
 */
function haloskinsMemoryLookup(string $name, int $ttl): ?array
{
    $name = trim($name);
    if ($name === '') {
        return null;
    }
    $index = &haloskinsMemoryIndex();
    $entry = is_array($index[$name] ?? null) ? $index[$name] : null;
    if ($entry === null) {
        return null;
    }
    $fetchedAt = isset($entry['fetched_at']) && is_numeric($entry['fetched_at']) ? (int)$entry['fetched_at'] : 0;
    if ($ttl > 0 && $fetchedAt > 0 && (time() - $fetchedAt) >= $ttl) {
        unset($index[$name]);
        return null;
    }
    $price = isset($entry['price']) && is_numeric($entry['price']) ? (float)$entry['price'] : 0.0;
    if ($price <= 0) {
        return null;
    }
    $volume = isset($entry['volume']) && is_numeric($entry['volume']) ? max(0, (int)$entry['volume']) : 0;
    return ['price' => $price, 'volume' => $volume];
}

function haloskinsTraceId(): string
{
    try {
        return bin2hex(random_bytes(8));
    } catch (Throwable $e) {
        return substr(md5((string)microtime(true) . mt_rand()), 0, 16);
    }
}

/**
 * @return list<string>
 */
function haloskinsRequestHeaders(array $config): array
{
    // Website market search uses a logged-in HaloSkins session `access_token`.
    // The Open Platform Trading API key is a different credential: sending it as
    // access_token / Authorization yields HTTP 200 with business code 1003 LOGIN_AGAIN.
    $accessToken = trim((string)($config['access_token'] ?? ''));
    $headers = [
        'Content-Type: application/json',
        'Accept: application/json',
        'Platform: halo',
        'device: 1',
        'device_id: cs2-price-tracker',
        'app_version_code: web pc',
        'access_token: ' . $accessToken,
        'trace_id: ' . haloskinsTraceId(),
        'Accept-Language: en',
        'area: 1',
        'Origin: https://www.haloskins.com',
        'Referer: https://www.haloskins.com/',
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ];
    if ($accessToken !== '') {
        $headers[] = 'Authorization: Bearer ' . $accessToken;
    }
    return $headers;
}

function haloskinsLastError(?array $set = null): ?array
{
    static $error = null;
    if (func_num_args() > 0) {
        $error = $set;
    }
    return $error;
}

function haloskinsHttpPost(string $url, array $body, array $config): ?array
{
    $timeout = max(5, (int)($config['timeout_seconds'] ?? 25));

    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => min(10, $timeout),
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => (string)json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_HTTPHEADER => haloskinsRequestHeaders($config),
    ]);

    $responseBody = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);

    if ($responseBody === false || $status < 200 || $status >= 300) {
        haloskinsLastError([
            'http' => $status,
            'code' => null,
            'message' => 'http_error',
        ]);
        return null;
    }

    $decoded = json_decode((string)$responseBody, true);
    if (!is_array($decoded)) {
        return null;
    }
    $code = isset($decoded['code']) && is_numeric($decoded['code']) ? (int)$decoded['code'] : null;
    $success = $decoded['success'] ?? null;
    if ($code !== null && $code !== 200 && $success === false) {
        haloskinsLastError([
            'http' => $status,
            'code' => $code,
            'message' => trim((string)($decoded['message'] ?? '')),
        ]);
    }
    return $decoded;
}

/**
 * Extract a product list from common HaloSkins response shapes.
 *
 * @return list<array<string, mixed>>
 */
function haloskinsExtractProductList(?array $payload): array
{
    if (!is_array($payload)) {
        return [];
    }

    $candidates = [
        $payload['data']['list'] ?? null,
        $payload['data']['records'] ?? null,
        $payload['data']['items'] ?? null,
        $payload['data']['rows'] ?? null,
        $payload['list'] ?? null,
        $payload['records'] ?? null,
        $payload['items'] ?? null,
        $payload['data'] ?? null,
    ];

    foreach ($candidates as $candidate) {
        if (!is_array($candidate)) {
            continue;
        }
        // Numeric list of product rows
        if ($candidate === [] || array_is_list($candidate)) {
            $rows = [];
            foreach ($candidate as $row) {
                if (is_array($row) && (
                    isset($row['marketHashName'])
                    || isset($row['market_hash_name'])
                    || isset($row['itemName'])
                    || isset($row['price'])
                    || isset($row['salePrice'])
                )) {
                    $rows[] = $row;
                }
            }
            if ($rows) {
                return $rows;
            }
        }
    }

    return [];
}

function haloskinsRowMarketHashName(array $row): string
{
    return trim((string)(
        $row['marketHashName']
        ?? $row['market_hash_name']
        ?? $row['itemName']
        ?? $row['name']
        ?? $row['shortName']
        ?? ''
    ));
}

function haloskinsRowUsdPrice(array $row): ?float
{
    foreach (['salePrice', 'price', 'queryTopPrice', 'manualPrice', 'autoPrice', 'subsidyPrice'] as $key) {
        if (!isset($row[$key]) || !is_numeric($row[$key])) {
            continue;
        }
        $value = (float)$row[$key];
        if (is_finite($value) && $value > 0) {
            return $value;
        }
    }
    return null;
}

function haloskinsRowQuantity(array $row): int
{
    foreach (['quantity', 'manualQuantity', 'autoQuantity', 'count', 'volume'] as $key) {
        if (isset($row[$key]) && is_numeric($row[$key])) {
            return max(0, (int)$row[$key]);
        }
    }
    return 0;
}

/**
 * Prefer exact marketHashName match (case-sensitive, then case-insensitive).
 *
 * @param list<array<string, mixed>> $rows
 * @return array{price:float,volume:int}|null
 */
function haloskinsPickExactMatch(array $rows, string $name, float $usdToEur): ?array
{
    $name = trim($name);
    if ($name === '' || !$rows) {
        return null;
    }

    $caseSensitive = null;
    $caseInsensitive = null;

    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $rowName = haloskinsRowMarketHashName($row);
        if ($rowName === '') {
            continue;
        }
        $usd = haloskinsRowUsdPrice($row);
        if ($usd === null) {
            continue;
        }
        $eur = haloskinsParsePrice($usd, $usdToEur);
        if ($eur === null) {
            continue;
        }
        $entry = [
            'price' => $eur,
            'volume' => haloskinsRowQuantity($row),
        ];
        if ($rowName === $name) {
            $caseSensitive = $entry;
            break;
        }
        if ($caseInsensitive === null && strcasecmp($rowName, $name) === 0) {
            $caseInsensitive = $entry;
        }
    }

    return $caseSensitive ?? $caseInsensitive;
}

/**
 * Search HaloSkins product list by keyword.
 *
 * @return array{price:float,volume:int}|null
 */
function haloskinsSearchProduct(string $name, array $config): ?array
{
    $name = trim($name);
    if ($name === '') {
        return null;
    }

    $baseUrl = rtrim((string)($config['base_url'] ?? 'https://api.haloskins.com'), '/');
    $appId = (int)($config['app_id'] ?? 730) ?: 730;
    $usdToEur = (float)($config['usd_to_eur'] ?? 0.92);

    $url = $baseUrl . '/steam-trade-center/search/product/list?appId=' . $appId;
    $payload = haloskinsHttpPost($url, [
        'appId' => $appId,
        'page' => 1,
        'limit' => 30,
        'sort' => 0,
        'keyword' => $name,
    ], $config);

    $rows = haloskinsExtractProductList($payload);
    return haloskinsPickExactMatch($rows, $name, $usdToEur);
}

/**
 * @return array{price:float,volume:int}|null
 */
function haloskinsLoadCachedQuote(string $name, array $config, bool $allowStale = false): ?array
{
    $name = trim($name);
    if ($name === '') {
        return null;
    }

    $ttl = max(60, (int)($config['cache_ttl_seconds'] ?? 300));
    $memory = haloskinsMemoryLookup($name, $ttl);
    if ($memory !== null) {
        return $memory;
    }

    $cacheFile = haloskinsQuoteCachePath($name);
    if (!is_file($cacheFile)) {
        return null;
    }

    $age = time() - (int)filemtime($cacheFile);
    if (!$allowStale && $age >= $ttl) {
        return null;
    }

    $cached = json_decode((string)file_get_contents($cacheFile), true);
    if (!is_array($cached)) {
        return null;
    }

    $price = isset($cached['price']) && is_numeric($cached['price']) ? (float)$cached['price'] : 0.0;
    if ($price <= 0) {
        return null;
    }

    $volume = isset($cached['volume']) && is_numeric($cached['volume']) ? max(0, (int)$cached['volume']) : 0;
    $entry = ['price' => $price, 'volume' => $volume];
    if ($age < $ttl) {
        haloskinsRememberQuote($name, $price, $volume);
    }
    return $entry;
}

function haloskinsStoreQuoteCache(string $name, float $price, int $volume, float $usdToEur): void
{
    $name = trim($name);
    if ($name === '' || $price <= 0) {
        return;
    }

    file_put_contents(haloskinsQuoteCachePath($name), (string)json_encode([
        'fetched_at' => time(),
        'market_hash_name' => $name,
        'price' => $price,
        'volume' => max(0, $volume),
        'usd_to_eur' => $usdToEur,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

    haloskinsRememberQuote($name, $price, $volume);
}

/**
 * No public history API — return empty or a single current-price point dated today.
 *
 * @return list<array{date:string,price:float,volume:int}>
 */
function haloskinsFetchSalesHistory(string $name, array $config, ?array $entry = null): array
{
    $name = trim($name);
    if ($name === '') {
        return [];
    }

    $ttl = max(60, (int)($config['history_cache_ttl_seconds'] ?? 1800));
    $cacheFile = haloskinsHistoryCachePath($name);

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

    if ($entry === null) {
        $entry = haloskinsLoadCachedQuote($name, $config, true);
    }
    if ($entry === null) {
        $entry = haloskinsSearchProduct($name, $config);
        if ($entry !== null) {
            haloskinsStoreQuoteCache(
                $name,
                (float)$entry['price'],
                (int)($entry['volume'] ?? 0),
                (float)($config['usd_to_eur'] ?? 0.92)
            );
        }
    }

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

function haloskinsAttachHistoryToItem(array $item, array $historyPoints): array
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

function haloskinsBuildQuote(string $name, array $config, array $options = []): ?array
{
    $name = trim($name);
    if ($name === '') {
        return null;
    }

    $entry = is_array($options['entry'] ?? null) ? $options['entry'] : null;
    $cacheOnly = !empty($options['cache_only']);
    $preferLive = !empty($options['prefer_live']) || !empty($options['fresh']) || !empty($options['ignore_cache']);

    if ($entry === null && !$preferLive) {
        $entry = haloskinsLoadCachedQuote($name, $config, $cacheOnly);
    }

    if ($entry === null && !$cacheOnly) {
        $entry = haloskinsSearchProduct($name, $config);
        if ($entry !== null) {
            haloskinsStoreQuoteCache(
                $name,
                (float)$entry['price'],
                (int)($entry['volume'] ?? 0),
                (float)($config['usd_to_eur'] ?? 0.92)
            );
        }
    }

    if ($entry === null && $preferLive) {
        $entry = haloskinsLoadCachedQuote($name, $config, true);
    }

    $price = $entry !== null && isset($entry['price']) && is_numeric($entry['price'])
        ? (float)$entry['price']
        : 0.0;
    if ($price <= 0) {
        return null;
    }

    $feePct = (float)($config['default_fee_pct'] ?? 3.0);
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
        'range_used' => 'search_product',
        'range_notice' => '',
        'secondary_metric_label' => 'HaloSkins',
        'secondary_metric_display' => 'Lowest',
        'market_url' => haloskinsItemUrl($name),
        'sparkline' => [],
        'price_history' => null,
        'source' => 'haloskins',
        'source_label' => 'HaloSkins',
        'available' => true,
        'updated_at' => gmdate(DATE_ATOM),
        'price_verified' => true,
        'fee_pct' => $feePct,
    ];

    if (!empty($options['include_history'])) {
        $history = haloskinsFetchSalesHistory($name, $config, $entry);
        if ($history) {
            $quote = haloskinsAttachHistoryToItem($quote, $history);
        }
    }

    return $quote;
}

/**
 * @param list<string> $names
 * @return array<string, array<string, mixed>>
 */
function haloskinsFetchQuotes(array $names, array $config, array $options = []): array
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

    $cacheOnly = !empty($options['cache_only']);
    $preferLive = !empty($options['prefer_live']) || !empty($options['fresh']) || !empty($options['ignore_cache']);
    $includeHistory = !empty($options['include_history'])
        || ($preferLive && !$cacheOnly && count($nameList) === 1);

    $quotes = [];
    $concurrency = max(1, min(3, (int)($options['concurrency'] ?? 2)));

    if ($cacheOnly || count($nameList) === 1 || $concurrency <= 1) {
        foreach ($nameList as $name) {
            $quote = haloskinsBuildQuote($name, $config, [
                'cache_only' => $cacheOnly,
                'prefer_live' => $preferLive,
                'include_history' => $includeHistory && count($nameList) === 1,
            ]);
            if (is_array($quote)) {
                $quotes[$name] = $quote;
            }
        }
        return $quotes;
    }

    // Small-concurrency batches for multi-name live lookups.
    $chunks = array_chunk($nameList, $concurrency);
    foreach ($chunks as $chunk) {
        foreach ($chunk as $name) {
            $quote = haloskinsBuildQuote($name, $config, [
                'cache_only' => $cacheOnly,
                'prefer_live' => $preferLive,
                'include_history' => false,
            ]);
            if (is_array($quote)) {
                $quotes[$name] = $quote;
            }
        }
    }

    return $quotes;
}

function haloskinsRequestedNames(array $payload): array
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
