<?php
declare(strict_types=1);

function dmarketCacheDir(): string
{
    $dir = __DIR__ . '/assets/dmarket-cache';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    return $dir;
}

function dmarketCachePath(string $marketHashName): string
{
    return dmarketCacheDir() . '/' . md5($marketHashName) . '.json';
}

function dmarketHistoryCachePath(string $marketHashName): string
{
    return dmarketCacheDir() . '/' . md5($marketHashName) . '_history.json';
}

function dmarketSecretKeyBytes(string $secretHex): ?string
{
    $hex = strtolower(trim($secretHex));
    if ($hex === '') {
        return null;
    }

    $binary = hex2bin($hex);
    if ($binary === false) {
        return null;
    }

    if (strlen($binary) === 64) {
        return $binary;
    }

    if (strlen($binary) === 32) {
        if (!function_exists('sodium_crypto_sign_seed_keypair')) {
            return null;
        }
        return sodium_crypto_sign_seed_keypair($binary);
    }

    return null;
}

function dmarketSignedHeaders(string $method, string $pathWithQuery, string $body, array $config): array
{
    $publicKey = trim((string)($config['public_key'] ?? ''));
    $secretHex = trim((string)($config['secret_key'] ?? ''));
    if ($publicKey === '' || $secretHex === '' || !function_exists('sodium_crypto_sign_detached')) {
        return [];
    }

    $secretKey = dmarketSecretKeyBytes($secretHex);
    if ($secretKey === null) {
        return [];
    }

    $timestamp = (string)time();
    $toSign = strtoupper($method) . $pathWithQuery . $body . $timestamp;
    $signature = sodium_crypto_sign_detached($toSign, $secretKey);

    return [
        'Accept: application/json',
        'Content-Type: application/json',
        'User-Agent: CS2MarketTracker/1.0',
        'X-Api-Key: ' . $publicKey,
        'X-Sign-Date: ' . $timestamp,
        'X-Request-Sign: dmar ed25519 ' . bin2hex($signature),
    ];
}

function dmarketSignedPost(string $path, array $payload, array $config, int $timeout = 25): array
{
    $baseUrl = rtrim((string)($config['base_url'] ?? 'https://api.dmarket.com'), '/');
    $body = (string)json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $headers = dmarketSignedHeaders('POST', $path, $body, $config);
    if (!$headers) {
        return ['status' => 401, 'json' => [], 'error' => 'missing_keys'];
    }

    return dmarketHttpJson('POST', $baseUrl . $path, $headers, $timeout, $body);
}

function dmarketSignedGet(string $path, array $query, array $config, int $timeout = 25): array
{
    $baseUrl = rtrim((string)($config['base_url'] ?? 'https://api.dmarket.com'), '/');
    $queryString = http_build_query($query);
    $pathWithQuery = $path . ($queryString !== '' ? '?' . $queryString : '');
    $headers = dmarketSignedHeaders('GET', $pathWithQuery, '', $config);
    if (!$headers) {
        return ['status' => 401, 'json' => [], 'error' => 'missing_keys'];
    }

    return dmarketHttpJson('GET', $baseUrl . $pathWithQuery, $headers, $timeout, null);
}

function dmarketHttpJson(string $method, string $url, array $headers = [], int $timeoutSeconds = 20, ?string $body = null): array
{
    $curl = curl_init($url);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => $timeoutSeconds,
        CURLOPT_CONNECTTIMEOUT => min(10, $timeoutSeconds),
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
    ];
    if ($body !== null) {
        $opts[CURLOPT_POSTFIELDS] = $body;
    }
    curl_setopt_array($curl, $opts);

    $responseBody = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);

    if ($responseBody === false) {
        $error = curl_error($curl);
        curl_close($curl);
        throw new RuntimeException('HTTP request failed: ' . $error);
    }

    curl_close($curl);

    $decoded = json_decode((string)$responseBody, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Invalid JSON response received.');
    }

    return [
        'status' => $status,
        'body' => $responseBody,
        'json' => $decoded,
    ];
}

function dmarketSaleDateKey(mixed $rawDate): string
{
    $value = trim((string)$rawDate);
    if ($value === '') {
        return '';
    }

    if (ctype_digit($value)) {
        $timestamp = (int)$value;
        if ($timestamp > 0) {
            return gmdate('Y-m-d', $timestamp);
        }
    }

    if (is_numeric($value)) {
        $timestamp = (int)$value;
        if ($timestamp > 0) {
            return gmdate('Y-m-d', $timestamp);
        }
    }

    return substr($value, 0, 10);
}

function dmarketSalePriceEur(mixed $price, float $usdToEur): ?float
{
    if (is_array($price)) {
        if (isset($price['USD']) && is_numeric($price['USD'])) {
            return dmarketPriceFromCents($price['USD'], $usdToEur);
        }
        if (isset($price['Amount']) && is_numeric($price['Amount'])) {
            return dmarketPriceFromCents($price['Amount'], $usdToEur);
        }
        if (isset($price['amount']) && is_numeric($price['amount'])) {
            return dmarketPriceFromCents($price['amount'], $usdToEur);
        }
    }

    if (!is_numeric($price)) {
        return null;
    }

    $numeric = (float)$price;
    if ($numeric <= 0) {
        return null;
    }

    if ($numeric >= 100) {
        return dmarketPriceFromCents($numeric, $usdToEur);
    }

    return round($numeric * $usdToEur, $numeric < 1 ? 4 : 2);
}

function dmarketAggregateSalesHistory(array $sales, float $usdToEur): array
{
    $byDate = [];
    foreach ($sales as $sale) {
        if (!is_array($sale)) {
            continue;
        }

        $day = dmarketSaleDateKey($sale['date'] ?? $sale['createdAt'] ?? '');
        $price = dmarketSalePriceEur($sale['price'] ?? null, $usdToEur);
        if ($day === '' || $price === null || $price <= 0) {
            continue;
        }

        if (!isset($byDate[$day])) {
            $byDate[$day] = [
                'date' => $day,
                'price' => $price,
                'volume' => 1,
                '_sum' => $price,
            ];
            continue;
        }

        $byDate[$day]['volume']++;
        $byDate[$day]['_sum'] += $price;
        $byDate[$day]['price'] = round($byDate[$day]['_sum'] / $byDate[$day]['volume'], $price < 1 ? 4 : 2);
    }

    if (count($byDate) < 2) {
        return [];
    }

    ksort($byDate);
    return array_values(array_map(static function (array $row): array {
        return [
            'date' => $row['date'],
            'price' => $row['price'],
            'volume' => max(1, (int)$row['volume']),
        ];
    }, $byDate));
}

function dmarketFetchLastSalesHistory(string $marketHashName, array $config, bool $forceLive = false): array
{
    $marketHashName = trim($marketHashName);
    if ($marketHashName === '') {
        return [];
    }

    $publicKey = trim((string)($config['public_key'] ?? ''));
    $secretHex = trim((string)($config['secret_key'] ?? ''));
    if ($publicKey === '' || $secretHex === '' || !function_exists('sodium_crypto_sign_detached')) {
        return [];
    }

    $historyFile = dmarketHistoryCachePath($marketHashName);
    $historyTtl = 3600;
    if (!$forceLive && is_file($historyFile)) {
        $cached = json_decode((string)file_get_contents($historyFile), true);
        $fetchedAt = (int)($cached['fetched_at'] ?? 0);
        $points = is_array($cached['points'] ?? null) ? $cached['points'] : [];
        if ($fetchedAt > 0 && (time() - $fetchedAt) < $historyTtl && count($points) >= 2) {
            return $points;
        }
    }

    $gameId = trim((string)($config['game_id'] ?? 'a8db')) ?: 'a8db';
    $usdToEur = max(0.01, (float)($config['usd_to_eur'] ?? 0.92));
    $sales = [];
    $offset = 0;
    $limit = 20;
    $maxPages = 40;

    for ($page = 0; $page < $maxPages; $page++) {
        $response = dmarketSignedGet('/trade-aggregator/v1/last-sales', [
            'gameId' => $gameId,
            'title' => $marketHashName,
            'limit' => (string)$limit,
            'offset' => (string)$offset,
            'txOperationType' => 'Offer',
        ], $config, 25);

        if ((int)($response['status'] ?? 500) >= 400) {
            break;
        }

        $batch = is_array($response['json']['sales'] ?? null) ? $response['json']['sales'] : [];
        if (!$batch) {
            break;
        }

        foreach ($batch as $row) {
            if (is_array($row)) {
                $sales[] = $row;
            }
        }

        if (count($batch) < $limit) {
            break;
        }

        $offset += $limit;
        usleep(180000);
    }

    $points = dmarketAggregateSalesHistory($sales, $usdToEur);
    if (count($points) >= 2) {
        file_put_contents($historyFile, (string)json_encode([
            'fetched_at' => time(),
            'points'     => $points,
        ], JSON_UNESCAPED_UNICODE));
        return $points;
    }

    if (is_file($historyFile)) {
        $cached = json_decode((string)file_get_contents($historyFile), true);
        $points = is_array($cached['points'] ?? null) ? $cached['points'] : [];
        if (count($points) >= 2) {
            return $points;
        }
    }

    return [];
}

function dmarketAttachHistoryToItem(array $item, array $historyPoints): array
{
    if (count($historyPoints) < 2) {
        return $item;
    }

    $item['price_history'] = $historyPoints;
    $item['sparkline'] = array_values(array_map(
        static fn(array $point): float => (float)($point['price'] ?? 0),
        array_slice($historyPoints, -30)
    ));

    return $item;
}

function dmarketLoadCachedQuote(string $marketHashName, int $hitTtl, int $missTtl): ?array
{
    $path = dmarketCachePath($marketHashName);
    if (!is_file($path)) {
        return null;
    }

    $modifiedAt = @filemtime($path);
    if ($modifiedAt === false) {
        return null;
    }

    $decoded = json_decode((string)@file_get_contents($path), true);
    if (!is_array($decoded)) {
        return null;
    }

    $ttl = !empty($decoded['_no_listing']) ? $missTtl : $hitTtl;
    if ($modifiedAt < time() - $ttl) {
        return null;
    }

    return $decoded;
}

function dmarketSaveCachedQuote(string $marketHashName, array $quote): void
{
    @file_put_contents(dmarketCachePath($marketHashName), (string)json_encode($quote));
}

function dmarketRequestedNames(array $payload): array
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

function dmarketPriceFromCents(mixed $value, float $usdToEur): ?float
{
    if (!is_numeric($value)) {
        return null;
    }

    $cents = (float)$value;
    if (!is_finite($cents) || $cents <= 0) {
        return null;
    }

    return round(($cents / 100) * $usdToEur, 2);
}

function dmarketUsdPriceFromCents(mixed $value): ?float
{
    if (!is_numeric($value)) {
        return null;
    }

    $cents = (float)$value;
    return $cents > 0 ? round($cents / 100, 2) : null;
}

function dmarketRowPriceCents(array $row): ?string
{
    foreach (['discountPrice', 'price', 'instantPrice', 'suggestedPrice'] as $section) {
        if (isset($row[$section]['USD']) && is_numeric($row[$section]['USD']) && (float)$row[$section]['USD'] > 0) {
            return (string)$row[$section]['USD'];
        }
    }

    return null;
}

function dmarketMarketUrl(string $marketHashName, ?array $row = null): string
{
    $slug = is_array($row) ? trim((string)($row['slug'] ?? $row['productSlug'] ?? '')) : '';
    if ($slug !== '') {
        return 'https://dmarket.com/csgo-skins/product-card/' . rawurlencode($slug);
    }

    return 'https://dmarket.com/ingame-items/item-list/csgo-skins?title=' . rawurlencode($marketHashName);
}

function dmarketBuildEmptyQuote(string $marketHashName, string $message = 'No DMarket listing found.'): array
{
    return [
        'market_hash_name' => $marketHashName,
        'source' => 'dmarket',
        'source_label' => 'DMarket',
        'available' => false,
        '_no_listing' => true,
        'error' => $message,
        'items' => [],
        'updated_at' => gmdate(DATE_ATOM),
    ];
}

function dmarketTitleAliases(string $marketHashName): array
{
    $raw = trim($marketHashName);
    if ($raw === '') {
        return [];
    }

    $aliases = [$raw];
    $aliases[] = str_ireplace('Holo-Foil', 'Holo/Foil', $raw);
    $aliases[] = str_ireplace('Holo/Foil', 'Holo-Foil', $raw);
    $aliases[] = str_replace('™', '', $raw);

    $unique = [];
    foreach ($aliases as $alias) {
        $clean = trim(preg_replace('/\s+/', ' ', (string)$alias) ?? '');
        if ($clean !== '') {
            $unique[$clean] = true;
        }
    }

    return array_keys($unique);
}

function dmarketNormalizeTitleKey(string $title): string
{
    return strtolower(trim(preg_replace('/\s+/', ' ', $title) ?? ''));
}

function dmarketParseMoneyCents(mixed $price): ?float
{
    if (is_array($price)) {
        foreach (['Amount', 'amount', 'USD', 'usd'] as $key) {
            if (isset($price[$key]) && is_numeric($price[$key]) && (float)$price[$key] > 0) {
                return (float)$price[$key];
            }
        }
        return null;
    }

    if (!is_numeric($price)) {
        return null;
    }

    $value = (float)$price;
    return $value > 0 ? $value : null;
}

/**
 * @param list<string> $titles
 * @return array<string, array<string, mixed>>
 */
function dmarketFetchAggregatedPriceRows(array $titles, array $config): array
{
    $cleanTitles = [];
    foreach ($titles as $title) {
        foreach (dmarketTitleAliases((string)$title) as $alias) {
            $cleanTitles[$alias] = true;
        }
    }
    $titleList = array_keys($cleanTitles);
    if (!$titleList) {
        return [];
    }

    $baseUrl = rtrim((string)($config['base_url'] ?? 'https://api.dmarket.com'), '/');
    $timeout = max(5, (int)($config['timeout_seconds'] ?? 20));
    $gameId = trim((string)($config['game_id'] ?? 'a8db')) ?: 'a8db';
    $path = '/marketplace-api/v1/aggregated-prices';
    $byTitle = [];

    foreach (array_chunk($titleList, 80) as $chunk) {
        $payload = [
            'filter' => [
                'game' => $gameId,
                'titles' => array_values($chunk),
            ],
            'limit' => (string)max(1, count($chunk)),
        ];
        $body = (string)json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $headers = [
            'Accept: application/json',
            'Content-Type: application/json',
            'User-Agent: CS2MarketTracker/1.0',
        ];

        $signed = dmarketSignedHeaders('POST', $path, $body, $config);
        if ($signed) {
            $headers = $signed;
        } else {
            $publicKey = trim((string)($config['public_key'] ?? ''));
            if ($publicKey !== '') {
                $headers[] = 'X-Api-Key: ' . $publicKey;
            }
        }

        try {
            $response = dmarketHttpJson('POST', $baseUrl . $path, $headers, $timeout, $body);
        } catch (Throwable) {
            continue;
        }

        // Signed auth can fail even when public aggregated-prices works unsigned.
        if ((int)($response['status'] ?? 500) === 401 && $signed) {
            $fallbackHeaders = [
                'Accept: application/json',
                'Content-Type: application/json',
                'User-Agent: CS2MarketTracker/1.0',
            ];
            try {
                $response = dmarketHttpJson('POST', $baseUrl . $path, $fallbackHeaders, $timeout, $body);
            } catch (Throwable) {
                continue;
            }
        }

        if ((int)($response['status'] ?? 500) >= 400) {
            continue;
        }

        $rows = is_array($response['json']['aggregatedPrices'] ?? null)
            ? $response['json']['aggregatedPrices']
            : [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $title = trim((string)($row['title'] ?? ''));
            if ($title === '') {
                continue;
            }
            $byTitle[dmarketNormalizeTitleKey($title)] = $row;
        }
    }

    return $byTitle;
}

function dmarketFindAggregatedRow(array $byTitle, string $marketHashName): ?array
{
    foreach (dmarketTitleAliases($marketHashName) as $alias) {
        $key = dmarketNormalizeTitleKey($alias);
        if (isset($byTitle[$key]) && is_array($byTitle[$key])) {
            return $byTitle[$key];
        }
    }

    return null;
}

function dmarketQuoteFromAggregatedRow(string $marketHashName, ?array $row, array $config): array
{
    if (!is_array($row)) {
        return dmarketBuildEmptyQuote($marketHashName);
    }

    $usdToEur = max(0.01, (float)($config['usd_to_eur'] ?? 0.92));
    $offerCents = dmarketParseMoneyCents($row['offerBestPrice'] ?? null);
    $offerCount = max(0, (int)($row['offerCount'] ?? 0));
    $orderCents = dmarketParseMoneyCents($row['orderBestPrice'] ?? null);
    $orderCount = max(0, (int)($row['orderCount'] ?? 0));

    $buyOrderPrice = $orderCents !== null ? dmarketPriceFromCents($orderCents, $usdToEur) : null;
    $buyOrderUsd = $orderCents !== null ? dmarketUsdPriceFromCents($orderCents) : null;

    if ($offerCents === null || $offerCents <= 0 || $offerCount <= 0) {
        $empty = dmarketBuildEmptyQuote($marketHashName, 'No DMarket sell offers found.');
        if ($buyOrderPrice !== null && $buyOrderPrice > 0) {
            $empty['buy_order_price'] = $buyOrderPrice;
            $empty['buy_order_price_display'] = '€' . number_format($buyOrderPrice, 2, '.', '');
            $empty['buy_order_price_usd'] = $buyOrderUsd;
            $empty['buy_order_listings'] = $orderCount;
            $empty['market_url'] = dmarketMarketUrl($marketHashName, $row);
        }
        return $empty;
    }

    $price = dmarketPriceFromCents($offerCents, $usdToEur);
    $usdPrice = dmarketUsdPriceFromCents($offerCents);
    if ($price === null || $price <= 0) {
        return dmarketBuildEmptyQuote($marketHashName);
    }

    return [
        'market_hash_name' => $marketHashName,
        'current_price' => $price,
        'current_price_display' => '€' . number_format($price, 2, '.', ''),
        'current_price_usd' => $usdPrice,
        'current_price_usd_display' => $usdPrice !== null ? '$' . number_format($usdPrice, 2, '.', '') : '—',
        'listings' => $offerCount,
        'listings_display' => number_format($offerCount) . ' listings',
        'buy_order_price' => $buyOrderPrice,
        'buy_order_price_display' => $buyOrderPrice !== null ? '€' . number_format($buyOrderPrice, 2, '.', '') : '—',
        'buy_order_price_usd' => $buyOrderUsd,
        'buy_order_listings' => $orderCount,
        'roi_pct' => null,
        'roi_display' => '—',
        'profit_display' => '—',
        'baseline_price_display' => '—',
        'range_used' => 'live',
        'range_notice' => '',
        'secondary_metric_label' => 'DMarket USD',
        'secondary_metric_display' => $usdPrice !== null ? '$' . number_format($usdPrice, 2, '.', '') : '—',
        'market_url' => dmarketMarketUrl($marketHashName, $row),
        'sparkline' => [],
        'source' => 'dmarket',
        'source_label' => 'DMarket',
        'available' => true,
        '_no_listing' => false,
        'updated_at' => gmdate(DATE_ATOM),
        'price_verified' => true,
    ];
}

function dmarketLoadSqlCachedQuotes(array $marketHashNames, int $ttl): array
{
    if (!$marketHashNames) {
        return [];
    }

    try {
        $pdo = dbPdoConnection('db');
        if (!dbTableExists($pdo, 'marketplace_price_cache')) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($marketHashNames), '?'));
        $stmt = $pdo->prepare(<<<SQL
SELECT market_hash_name, price, listings, market_url, updated_at
FROM marketplace_price_cache
WHERE marketplace = 'dmarket'
  AND market_hash_name IN ({$placeholders})
SQL);
        $stmt->execute($marketHashNames);

        $quotes = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $name = trim((string)($row['market_hash_name'] ?? ''));
            $price = isset($row['price']) && is_numeric($row['price']) ? round((float)$row['price'], 2) : 0.0;
            if ($name === '' || $price <= 0) {
                continue;
            }

            $updatedAt = strtotime((string)($row['updated_at'] ?? ''));
            if ($ttl > 0 && $updatedAt !== false && $updatedAt < time() - $ttl) {
                continue;
            }

            $listings = isset($row['listings']) && is_numeric($row['listings'])
                ? max(0, (int)$row['listings'])
                : 0;

            $quotes[$name] = [
                'market_hash_name' => $name,
                'current_price' => $price,
                'current_price_display' => "\xE2\x82\xAC" . number_format($price, 2, '.', ''),
                'listings' => $listings,
                'listings_display' => $listings > 0 ? number_format($listings) . ' listings' : '—',
                'roi_pct' => null,
                'roi_display' => '—',
                'profit_display' => '—',
                'baseline_price_display' => '—',
                'range_used' => 'sql-cache',
                'range_notice' => '',
                'secondary_metric_label' => 'DMarket',
                'secondary_metric_display' => 'SQL cache',
                'market_url' => (string)($row['market_url'] ?? dmarketMarketUrl($name)),
                'sparkline' => [],
                'source' => 'dmarket',
                'source_label' => 'DMarket',
                'available' => true,
                '_no_listing' => false,
                '_from_db' => true,
                'price_verified' => true,
                'updated_at' => (string)($row['updated_at'] ?? gmdate(DATE_ATOM)),
            ];
        }

        return $quotes;
    } catch (Throwable) {
        return [];
    }
}

function dmarketFetchTitleQuote(string $marketHashName, array $config): array
{
    $rows = dmarketFetchAggregatedPriceRows([$marketHashName], $config);
    $matched = dmarketFindAggregatedRow($rows, $marketHashName);
    return dmarketQuoteFromAggregatedRow($marketHashName, $matched, $config);
}

function dmarketFetchQuotes(array $marketHashNames, array $config, array $options = []): array
{
    $hitTtl = max(60, (int)($config['cache_ttl_seconds'] ?? 900));
    $dbTtl = max($hitTtl, (int)($config['db_cache_ttl_seconds'] ?? 86400));
    $missTtl = max(300, (int)($config['miss_ttl_seconds'] ?? 1800));
    $cacheOnly = !empty($options['cache_only']);
    $forceLive = !empty($options['prefer_live']) || !empty($options['fresh']) || !empty($options['ignore_cache']);
    $dealsMode = !empty($options['deals_mode']);
    $strictIgnoreCache = !empty($options['fresh']) || !empty($options['ignore_cache']);
    // Prefer live cheapest sell offers (aggregated offerBestPrice), not day-old SQL.
    // Keep a 15-minute hit window so a failed live round still paints the last ask.
    if ($dealsMode || $forceLive) {
        $hitTtl = 900;
        $dbTtl = 900;
        $missTtl = 300;
    }
    $maxLive = isset($options['max_live_requests']) && is_numeric($options['max_live_requests'])
        ? max(0, (int)$options['max_live_requests'])
        : max(0, (int)($config['max_live_requests'] ?? count($marketHashNames)));
    if (($dealsMode || $forceLive) && (!isset($options['max_live_requests']) || !is_numeric($options['max_live_requests']))) {
        $maxLive = max($maxLive, count($marketHashNames));
    }

    $quotes = [];
    $toFetch = [];

    foreach ($marketHashNames as $name) {
        if (!$strictIgnoreCache) {
            $cached = dmarketLoadCachedQuote($name, $hitTtl, $missTtl);
            if (is_array($cached)) {
                $quotes[$name] = $cached;
                continue;
            }
        }

        $toFetch[] = $name;
    }

    if (!$strictIgnoreCache && $toFetch) {
        $sqlQuotes = dmarketLoadSqlCachedQuotes($toFetch, $dbTtl);
        if ($sqlQuotes) {
            $stillNeeded = [];
            foreach ($toFetch as $name) {
                if (isset($sqlQuotes[$name])) {
                    $quotes[$name] = $sqlQuotes[$name];
                    dmarketSaveCachedQuote($name, $sqlQuotes[$name]);
                    continue;
                }
                $stillNeeded[] = $name;
            }
            $toFetch = $stillNeeded;
        }
    }

    if (!$cacheOnly && $maxLive > 0 && $toFetch) {
        $liveNames = array_slice($toFetch, 0, $maxLive);
        try {
            $aggregated = dmarketFetchAggregatedPriceRows($liveNames, $config);
        } catch (Throwable) {
            $aggregated = [];
        }

        foreach ($liveNames as $name) {
            $matched = dmarketFindAggregatedRow($aggregated, $name);
            $quote = dmarketQuoteFromAggregatedRow($name, $matched, $config);
            dmarketSaveCachedQuote($name, $quote);
            $quotes[$name] = $quote;
        }
    }

    $hasSigningKeys = trim((string)($config['public_key'] ?? '')) !== ''
        && trim((string)($config['secret_key'] ?? '')) !== ''
        && function_exists('sodium_crypto_sign_detached');

    $skipHistory = !empty($options['skip_history']) || !empty($options['deals_mode']);
    if (!$cacheOnly && !$skipHistory && $hasSigningKeys) {
        foreach ($quotes as $name => $quote) {
            if (!is_array($quote) || empty($quote['available']) || !empty($quote['_no_listing'])) {
                continue;
            }

            $historyPoints = dmarketFetchLastSalesHistory($name, $config, $forceLive);
            if (count($historyPoints) >= 2) {
                $quotes[$name] = dmarketAttachHistoryToItem($quote, $historyPoints);
                dmarketSaveCachedQuote($name, $quotes[$name]);
            }

            usleep(160000);
        }
    }

    return $quotes;
}
