<?php
declare(strict_types=1);

function shadowpayConfig(): array
{
    $config = function_exists('appConfig') ? (appConfig()['shadowpay'] ?? []) : [];
    return is_array($config) ? $config : [];
}

function shadowpayCacheDir(): string
{
    $dir = __DIR__ . '/assets/shadowpay-cache';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    return $dir;
}

function shadowpayPricesCachePath(): string
{
    return shadowpayCacheDir() . '/prices_eur.json';
}

function shadowpayHistoryCachePath(string $name): string
{
    return shadowpayCacheDir() . '/' . md5(trim($name)) . '_history.json';
}

function shadowpayWearFloatRange(?string $wear): ?array
{
    return match (trim((string)$wear)) {
        'Factory New' => [0.0, 0.07],
        'Minimal Wear' => [0.07, 0.15],
        'Field-Tested' => [0.15, 0.38],
        'Well-Worn' => [0.38, 0.45],
        'Battle-Scarred' => [0.45, 1.0],
        default => null,
    };
}

function shadowpayItemUrl(string $name): string
{
    $name = trim($name);
    $wear = '';
    if (preg_match('/^(.*)\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i', $name, $matches)) {
        $name = trim((string)$matches[1]);
        $wear = trim((string)$matches[2]);
    }

    $isStatTrak = (bool)preg_match('/^StatTrak™?\s+/iu', $name);
    $search = trim((string)preg_replace('/^StatTrak™?\s+/iu', '', $name));
    if ($search === '') {
        $search = $name;
    }

    $query = [
        'price_from' => '0',
        'price_to' => '100000',
        'is_stattrak' => $isStatTrak ? '1' : '',
        'hold_days' => '',
        'search' => $search,
    ];
    $floatRange = shadowpayWearFloatRange($wear);
    if (is_array($floatRange)) {
        $query['float_from'] = (string)$floatRange[0];
        $query['float_to'] = (string)$floatRange[1];
    }

    return 'https://shadowpay.com/csgo-items?' . http_build_query($query);
}

function shadowpayParsePrice(mixed $value, float $usdToEur = 0.92): ?float
{
    if (!is_numeric($value)) {
        return null;
    }

    $price = (float)$value;
    if (!is_finite($price) || $price <= 0) {
        return null;
    }

    $rate = max(0.01, $usdToEur);
    $eur = $price * $rate;
    return round($eur, $eur < 1 ? 4 : 2);
}

function shadowpayHttpGet(string $url, array $config): ?array
{
    $token = trim((string)($config['api_token'] ?? ''));
    if ($token === '') {
        return null;
    }

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
            'Authorization: Bearer ' . $token,
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
function shadowpayLoadPricesIndex(array $config): array
{
    $ttl = max(60, (int)($config['cache_ttl_seconds'] ?? 300));
    $cacheFile = shadowpayPricesCachePath();
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

    $token = trim((string)($config['api_token'] ?? ''));
    if ($token === '') {
        if (is_file($cacheFile)) {
            $cached = json_decode((string)file_get_contents($cacheFile), true);
            return $decodeIndex(is_array($cached) ? $cached : null);
        }
        return [];
    }

    $baseUrl = rtrim((string)($config['base_url'] ?? 'https://api.shadowpay.com'), '/');
    $payload = shadowpayHttpGet($baseUrl . '/api/v2/user/items/prices', $config);
    $items = is_array($payload['data'] ?? null) ? $payload['data'] : [];
    $index = [];

    foreach ($items as $row) {
        if (!is_array($row)) {
            continue;
        }
        $name = trim((string)($row['steam_market_hash_name'] ?? $row['market_hash_name'] ?? $row['name'] ?? ''));
        $price = shadowpayParsePrice($row['price'] ?? null, $usdToEur);
        if ($name === '' || $price === null) {
            continue;
        }
        $volume = isset($row['volume']) && is_numeric($row['volume']) ? max(0, (int)$row['volume']) : 0;
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
 * Optional single-name lookup via ?search= (prefer full index for batch).
 *
 * @return array{price:float,volume:int}|null
 */
function shadowpayLookupBySearch(string $name, array $config): ?array
{
    $name = trim($name);
    $token = trim((string)($config['api_token'] ?? ''));
    if ($name === '' || $token === '') {
        return null;
    }

    $usdToEur = (float)($config['usd_to_eur'] ?? 0.92);
    $baseUrl = rtrim((string)($config['base_url'] ?? 'https://api.shadowpay.com'), '/');
    $url = $baseUrl . '/api/v2/user/items/prices?search=' . rawurlencode($name);
    $payload = shadowpayHttpGet($url, $config);
    $items = is_array($payload['data'] ?? null) ? $payload['data'] : [];

    foreach ($items as $row) {
        if (!is_array($row)) {
            continue;
        }
        $rowName = trim((string)($row['steam_market_hash_name'] ?? $row['market_hash_name'] ?? $row['name'] ?? ''));
        if ($rowName === '' || strcasecmp($rowName, $name) !== 0) {
            continue;
        }
        $price = shadowpayParsePrice($row['price'] ?? null, $usdToEur);
        if ($price === null) {
            return null;
        }
        $volume = isset($row['volume']) && is_numeric($row['volume']) ? max(0, (int)$row['volume']) : 0;
        return ['price' => $price, 'volume' => $volume];
    }

    return null;
}

/**
 * No public history API — return empty or a single current-price point dated today.
 *
 * @return list<array{date:string,price:float,volume:int}>
 */
function shadowpayFetchSalesHistory(string $name, array $config, ?array $index = null): array
{
    $name = trim($name);
    if ($name === '') {
        return [];
    }

    $ttl = max(60, (int)($config['history_cache_ttl_seconds'] ?? 1800));
    $cacheFile = shadowpayHistoryCachePath($name);

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

    $index = is_array($index) ? $index : shadowpayLoadPricesIndex($config);
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

function shadowpayAttachHistoryToItem(array $item, array $historyPoints): array
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

function shadowpayBuildQuote(string $name, array $config, array $options = []): ?array
{
    $name = trim($name);
    if ($name === '') {
        return null;
    }

    $index = is_array($options['index'] ?? null)
        ? $options['index']
        : shadowpayLoadPricesIndex($config);

    $entry = is_array($index[$name] ?? null) ? $index[$name] : null;
    if ($entry === null && !empty($options['allow_search'])) {
        $entry = shadowpayLookupBySearch($name, $config);
    }

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
        'secondary_metric_label' => 'ShadowPay',
        'secondary_metric_display' => 'Lowest',
        'market_url' => shadowpayItemUrl($name),
        'sparkline' => [],
        'price_history' => null,
        'source' => 'shadowpay',
        'source_label' => 'ShadowPay',
        'available' => true,
        'updated_at' => gmdate(DATE_ATOM),
        'price_verified' => true,
        'fee_pct' => $feePct,
    ];

    if (!empty($options['include_history'])) {
        $history = shadowpayFetchSalesHistory($name, $config, $index);
        if ($history) {
            $quote = shadowpayAttachHistoryToItem($quote, $history);
        }
    }

    return $quote;
}

/**
 * @param list<string> $names
 * @return array<string, array<string, mixed>>
 */
function shadowpayFetchQuotes(array $names, array $config, array $options = []): array
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

    $token = trim((string)($config['api_token'] ?? ''));
    if ($token === '') {
        return [];
    }

    $cacheOnly = !empty($options['cache_only']);
    $preferLive = !empty($options['prefer_live']) || !empty($options['fresh']) || !empty($options['ignore_cache']);
    $includeHistory = !empty($options['include_history'])
        || ($preferLive && !$cacheOnly && count($nameList) === 1);

    if ($cacheOnly) {
        $cacheFile = shadowpayPricesCachePath();
        if (!is_file($cacheFile)) {
            return [];
        }
    }

    $index = shadowpayLoadPricesIndex($config);
    $quotes = [];
    foreach ($nameList as $name) {
        $quote = shadowpayBuildQuote($name, $config, [
            'index' => $index,
            'include_history' => $includeHistory && count($nameList) === 1,
            'allow_search' => $preferLive && !$cacheOnly && !isset($index[$name]) && count($nameList) === 1,
        ]);
        if (is_array($quote)) {
            $quotes[$name] = $quote;
        }
    }

    return $quotes;
}

function shadowpayRequestedNames(array $payload): array
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
