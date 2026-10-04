<?php
declare(strict_types=1);

function marketCsgoConfig(): array
{
    $config = function_exists('appConfig') ? (appConfig()['market_csgo'] ?? []) : [];
    return is_array($config) ? $config : [];
}

function marketCsgoCacheDir(): string
{
    $dir = __DIR__ . '/assets/market-csgo-cache';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    return $dir;
}

function marketCsgoPricesCachePath(string $currency = 'EUR'): string
{
    $currency = strtoupper(preg_replace('/[^A-Za-z]/', '', $currency) ?: 'EUR');
    return marketCsgoCacheDir() . '/prices_' . strtolower($currency) . '.json';
}

function marketCsgoHistoryCachePath(string $name): string
{
    return marketCsgoCacheDir() . '/' . md5(trim($name)) . '_history.json';
}

function marketCsgoItemUrl(string $name): string
{
    return 'https://market.csgo.com/en/?search=' . rawurlencode(trim($name));
}

function marketCsgoParsePrice(mixed $value): ?float
{
    if (!is_numeric($value)) {
        return null;
    }

    $price = (float)$value;
    if (!is_finite($price) || $price <= 0) {
        return null;
    }

    return round($price, $price < 1 ? 4 : 2);
}

function marketCsgoHttpGet(string $url, array $config): ?array
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
 * Auth history / item info: GET or POST get-list-items-info with list_hash_name[0]=...
 *
 * @return array<string, mixed>|null
 */
function marketCsgoFetchItemInfo(string $name, array $config): ?array
{
    $name = trim($name);
    $apiKey = trim((string)($config['api_key'] ?? ''));
    if ($name === '' || $apiKey === '') {
        return null;
    }

    $baseUrl = rtrim((string)($config['base_url'] ?? 'https://market.csgo.com'), '/');
    $timeout = max(5, (int)($config['timeout_seconds'] ?? 30));
    $url = $baseUrl . '/api/v2/get-list-items-info?key=' . rawurlencode($apiKey);
    $postFields = http_build_query([
        'list_hash_name' => [$name],
    ]);

    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $postFields,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => min(10, $timeout),
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'Content-Type: application/x-www-form-urlencoded',
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
function marketCsgoLoadPricesIndex(array $config): array
{
    $ttl = max(60, (int)($config['cache_ttl_seconds'] ?? 300));
    $currency = strtoupper(trim((string)($config['currency'] ?? 'EUR')) ?: 'EUR');
    $currency = preg_replace('/[^A-Z]/', '', $currency) ?: 'EUR';
    $cacheFile = marketCsgoPricesCachePath($currency);

    $decodeIndex = static function (?array $cached): array {
        $index = is_array($cached['index'] ?? null) ? $cached['index'] : [];
        $out = [];
        foreach ($index as $name => $row) {
            if (is_array($row)) {
                $price = marketCsgoParsePrice($row['price'] ?? null);
                $volume = isset($row['volume']) && is_numeric($row['volume']) ? max(0, (int)$row['volume']) : 0;
                if ($price !== null) {
                    $out[(string)$name] = ['price' => $price, 'volume' => $volume];
                }
                continue;
            }
            // Legacy: index mapped name => price float
            $price = marketCsgoParsePrice($row);
            if ($price !== null) {
                $out[(string)$name] = ['price' => $price, 'volume' => 0];
            }
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

    $baseUrl = rtrim((string)($config['base_url'] ?? 'https://market.csgo.com'), '/');
    $payload = marketCsgoHttpGet($baseUrl . '/api/v2/prices/' . $currency . '.json', $config);
    $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
    $index = [];

    foreach ($items as $row) {
        if (!is_array($row)) {
            continue;
        }
        $name = trim((string)($row['market_hash_name'] ?? $row['marketname'] ?? $row['name'] ?? ''));
        $price = marketCsgoParsePrice($row['price'] ?? null);
        if ($name === '' || $price === null) {
            continue;
        }
        $volume = isset($row['volume']) && is_numeric($row['volume']) ? max(0, (int)$row['volume']) : 0;
        $index[$name] = ['price' => $price, 'volume' => $volume];
    }

    if ($index) {
        file_put_contents($cacheFile, (string)json_encode([
            'fetched_at' => time(),
            'currency' => $currency,
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
 * @return list<array{date:string,price:float,volume:int}>
 */
function marketCsgoFetchSalesHistory(string $name, array $config): array
{
    $name = trim($name);
    if ($name === '') {
        return [];
    }

    $ttl = max(60, (int)($config['history_cache_ttl_seconds'] ?? 1800));
    $cacheFile = marketCsgoHistoryCachePath($name);

    if (is_file($cacheFile) && (time() - (int)filemtime($cacheFile)) < $ttl) {
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        $points = is_array($cached['points'] ?? null) ? $cached['points'] : [];
        if (count($points) >= 2) {
            return array_values(array_filter($points, static function ($row): bool {
                return is_array($row)
                    && !empty($row['date'])
                    && isset($row['price'])
                    && is_numeric($row['price'])
                    && (float)$row['price'] > 0;
            }));
        }
    }

    $apiKey = trim((string)($config['api_key'] ?? ''));
    if ($apiKey === '') {
        return [];
    }

    $payload = marketCsgoFetchItemInfo($name, $config);
    $data = is_array($payload['data'] ?? null) ? $payload['data'] : [];
    $item = is_array($data[$name] ?? null) ? $data[$name] : null;
    if ($item === null && $data) {
        // Case-insensitive fallback
        foreach ($data as $key => $row) {
            if (strcasecmp((string)$key, $name) === 0 && is_array($row)) {
                $item = $row;
                break;
            }
        }
    }

    $history = is_array($item['history'] ?? null) ? $item['history'] : [];
    $byDate = [];
    foreach ($history as $row) {
        if (!is_array($row) || count($row) < 2) {
            continue;
        }

        $timeRaw = $row[0] ?? null;
        $priceRaw = $row[1] ?? null;
        $day = '';
        if (is_numeric($timeRaw)) {
            $ts = (int)$timeRaw;
            if ($ts > 0) {
                $day = gmdate('Y-m-d', $ts > 1e12 ? (int)floor($ts / 1000) : $ts);
            }
        }

        $price = marketCsgoParsePrice($priceRaw);
        if ($day === '' || $price === null) {
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
        $byDate[$day]['price'] = round(
            $byDate[$day]['_sum'] / $byDate[$day]['volume'],
            $price < 1 ? 4 : 2
        );
    }

    ksort($byDate);
    $points = array_values(array_map(static function (array $row): array {
        return [
            'date' => $row['date'],
            'price' => $row['price'],
            'volume' => max(1, (int)$row['volume']),
        ];
    }, $byDate));

    if (count($points) >= 2) {
        file_put_contents($cacheFile, (string)json_encode([
            'fetched_at' => time(),
            'points' => $points,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        return $points;
    }

    if (is_file($cacheFile)) {
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        $stale = is_array($cached['points'] ?? null) ? $cached['points'] : [];
        if (count($stale) >= 2) {
            return $stale;
        }
    }

    return $points;
}

function marketCsgoAttachHistoryToItem(array $item, array $historyPoints): array
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

function marketCsgoBuildQuote(string $name, array $config, array $options = []): ?array
{
    $name = trim($name);
    if ($name === '') {
        return null;
    }

    $index = is_array($options['index'] ?? null)
        ? $options['index']
        : marketCsgoLoadPricesIndex($config);

    $entry = is_array($index[$name] ?? null) ? $index[$name] : null;
    $price = $entry !== null ? marketCsgoParsePrice($entry['price'] ?? null) : null;
    if ($price === null || $price <= 0) {
        return null;
    }

    $feePct = (float)($config['default_fee_pct'] ?? 5.0);
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
        'secondary_metric_label' => 'Market.CSGO',
        'secondary_metric_display' => 'Lowest',
        'market_url' => marketCsgoItemUrl($name),
        'sparkline' => [],
        'price_history' => null,
        'source' => 'market_csgo',
        'source_label' => 'Market.CSGO',
        'available' => true,
        'updated_at' => gmdate(DATE_ATOM),
        'price_verified' => true,
        'fee_pct' => $feePct,
    ];

    if (!empty($options['include_history'])) {
        $history = marketCsgoFetchSalesHistory($name, $config);
        if (count($history) >= 2) {
            $quote = marketCsgoAttachHistoryToItem($quote, $history);
        }
    }

    return $quote;
}

/**
 * @param list<string> $names
 * @return array<string, array<string, mixed>>
 */
function marketCsgoFetchQuotes(array $names, array $config, array $options = []): array
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

    // Public prices endpoint does not require API key; history does.
    if ($cacheOnly) {
        $currency = strtoupper(trim((string)($config['currency'] ?? 'EUR')) ?: 'EUR');
        $cacheFile = marketCsgoPricesCachePath($currency);
        if (!is_file($cacheFile)) {
            return [];
        }
    }

    $index = marketCsgoLoadPricesIndex($config);
    $quotes = [];
    foreach ($nameList as $name) {
        $quote = marketCsgoBuildQuote($name, $config, [
            'index' => $index,
            'include_history' => $includeHistory && count($nameList) === 1,
        ]);
        if (is_array($quote)) {
            $quotes[$name] = $quote;
        }
    }

    return $quotes;
}

function marketCsgoRequestedNames(array $payload): array
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
