<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';
require __DIR__ . '/dmarket_helpers.php';
require_once __DIR__ . '/lib/skinport_listing_stamps.php';

function requestJsonPayload(): array
{
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $raw = (string)file_get_contents('php://input');
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    $names = isset($_GET['market_hash_names']) ? explode(',', (string)$_GET['market_hash_names']) : [];
    $providers = isset($_GET['providers']) ? explode(',', (string)$_GET['providers']) : [];

    return [
        'market_hash_names' => $names,
        'providers' => $providers,
    ];
}

function providerCachePath(string $key): string
{
    return rtrim(sys_get_temp_dir(), '\\/') . DIRECTORY_SEPARATOR . 'csgo_inventory_provider_' . md5($key) . '.json';
}

function loadProviderCache(string $key, int $ttlSeconds): ?array
{
    $path = providerCachePath($key);
    if (!is_file($path)) {
        return null;
    }

    $modifiedAt = @filemtime($path);
    if ($modifiedAt === false || $modifiedAt < time() - $ttlSeconds) {
        return null;
    }

    $decoded = json_decode((string)@file_get_contents($path), true);
    return is_array($decoded) ? $decoded : null;
}

function saveProviderCache(string $key, array $payload): void
{
    @file_put_contents(providerCachePath($key), json_encode($payload));
}

function resolvePythonExecutable(): string
{
    $override = trim((string)getenv('PYTHON_BIN'));
    if ($override !== '') {
        return $override;
    }

    $localAppData = getenv('LOCALAPPDATA');
    if (is_string($localAppData) && $localAppData !== '') {
        $matches = glob($localAppData . DIRECTORY_SEPARATOR . 'Python' . DIRECTORY_SEPARATOR . 'pythoncore-*' . DIRECTORY_SEPARATOR . 'python.exe');
        if (is_array($matches) && $matches) {
            rsort($matches);
            return $matches[0];
        }
    }

    return 'python';
}

function fetchSkinportIndex(array $config): array
{
    // Prefer the shared Skinport items index (same source as ROI / item page).
    $sharedIndexPath = __DIR__ . '/assets/skinport-cache/items_index.json';
    if (is_file($sharedIndexPath)) {
        $sharedAge = time() - (int)@filemtime($sharedIndexPath);
        if ($sharedAge >= 0 && $sharedAge < 180) {
            $sharedDecoded = json_decode((string)@file_get_contents($sharedIndexPath), true);
            $sharedItems = $sharedDecoded['items'] ?? null;
            if (is_array($sharedItems)) {
                // Index may be name=>row map; normalize to a list for mapSkinportQuotes.
                $list = [];
                foreach ($sharedItems as $key => $row) {
                    if (!is_array($row)) {
                        continue;
                    }
                    if (!isset($row['market_hash_name']) && is_string($key) && $key !== '') {
                        $row['market_hash_name'] = $key;
                    }
                    $list[] = $row;
                }
                if ($list) {
                    return $list;
                }
            }
        }
    }

    $cacheKey = 'skinport_items_index_' . md5(json_encode([
        $config['base_url'] ?? 'https://api.skinport.com',
        $config['app_id'] ?? 730,
        $config['currency'] ?? 'EUR',
        $config['tradable'] ?? 0,
    ]));
    $cached = loadProviderCache($cacheKey, 180);
    if (is_array($cached['items'] ?? null)) {
        return $cached['items'];
    }

    // Shared hosting has no process functions, so the Python fetch below cannot
    // run. Serve the Skinport index the deploy ships (assets/skinport-cache),
    // which the sync scripts on the developer PC keep fresh.
    if (!function_exists('proc_open')) {
        $sharedPath = __DIR__ . '/assets/skinport-cache/items_index.json';
        if (is_file($sharedPath)) {
            $shared = json_decode((string)@file_get_contents($sharedPath), true);
            $sharedItems = is_array($shared['items'] ?? null) ? $shared['items'] : [];
            if ($sharedItems) {
                return array_values(array_filter($sharedItems, 'is_array'));
            }
        }
        return [];
    }

    $url = sprintf(
        '%s/v1/items?%s',
        rtrim((string)($config['base_url'] ?? 'https://api.skinport.com'), '/'),
        http_build_query([
            'app_id' => (int)($config['app_id'] ?? 730),
            'currency' => (string)($config['currency'] ?? 'EUR'),
            // 0 = newest cheapest ask on the item board (incl. trade-locked).
            'tradable' => (int)($config['tradable'] ?? 0),
        ], '', '&', PHP_QUERY_RFC3986)
    );
    $timeoutSeconds = max(5, (int)($config['timeout_seconds'] ?? 30));
    $pythonScript = <<<'PY'
import json
import sys
import requests

url = sys.argv[1]
timeout = int(sys.argv[2])
response = requests.get(
    url,
    headers={
        'Accept-Encoding': 'br',
        'User-Agent': 'Mozilla/5.0',
    },
    timeout=timeout,
)
print(json.dumps({
    'status': response.status_code,
    'body': response.json(),
}))
PY;

    $command = sprintf(
        '%s - %s %s',
        escapeshellarg(resolvePythonExecutable()),
        escapeshellarg($url),
        escapeshellarg((string)$timeoutSeconds)
    );
    $descriptorSpec = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $process = function_exists('proc_open') ? proc_open($command, $descriptorSpec, $pipes) : null;
    if (!is_resource($process)) {
        throw new RuntimeException('Could not start the Skinport provider process (process functions are disabled on this host).');
    }

    fwrite($pipes[0], $pythonScript);
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[2]);
    $exitCode = proc_close($process);

    if ($exitCode !== 0) {
        throw new RuntimeException('Skinport provider request failed: ' . trim($stderr ?: $stdout));
    }

    $decoded = json_decode($stdout, true);
    if (!is_array($decoded) || !isset($decoded['status'])) {
        throw new RuntimeException('Skinport provider returned invalid JSON.');
    }

    if ((int)$decoded['status'] >= 400) {
        $errorBody = $decoded['body'] ?? [];
        $message = 'HTTP ' . (int)$decoded['status'];
        if (is_array($errorBody['errors'] ?? null) && isset($errorBody['errors'][0]['message'])) {
            $message = (string)$errorBody['errors'][0]['message'];
        }

        throw new RuntimeException('Skinport provider error: ' . $message);
    }

    $items = is_array($decoded['body'] ?? null) ? $decoded['body'] : [];
    saveProviderCache($cacheKey, [
        'fetched_at' => gmdate(DATE_ATOM),
        'items' => $items,
    ]);

    // Keep the shared Skinport index in sync so item page / ROI use the same live asks.
    $sharedDir = __DIR__ . '/assets/skinport-cache';
    if (!is_dir($sharedDir)) {
        @mkdir($sharedDir, 0755, true);
    }
    $sharedMap = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $name = trim((string)($item['market_hash_name'] ?? ''));
        if ($name !== '') {
            $sharedMap[$name] = $item;
        }
    }
    if ($sharedMap) {
        $sharedPath = $sharedDir . '/items_index.json';
        $previousMeta = skinportLoadItemsIndexMeta($sharedPath);
        $sharedMap = skinportMergeListingStamps(
            $sharedMap,
            is_array($previousMeta['items'] ?? null) ? $previousMeta['items'] : []
        );
        @file_put_contents($sharedPath, (string)json_encode([
            'fetched_at' => time(),
            'tradable' => (int)($config['tradable'] ?? 0),
            'listings_enriched_at' => (int)($previousMeta['listings_enriched_at'] ?? 0) ?: null,
            'items' => $sharedMap,
        ], JSON_UNESCAPED_UNICODE));
    }

    return $items;
}

function mapSkinportQuotes(array $marketHashNames, array $config): array
{
    $items = fetchSkinportIndex($config);
    $index = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }

        $name = trim((string)($item['market_hash_name'] ?? ''));
        if ($name === '') {
            continue;
        }

        $index[$name] = [
            'available' => true,
            'provider' => 'skinport',
            'currency' => (string)($item['currency'] ?? 'EUR'),
            'prices' => [
                'skinport_min' => isset($item['min_price']) ? (float)$item['min_price'] : null,
                'skinport_suggested' => isset($item['suggested_price']) ? (float)$item['suggested_price'] : null,
                'skinport_mean' => isset($item['mean_price']) ? (float)$item['mean_price'] : null,
                'skinport_median' => isset($item['median_price']) ? (float)$item['median_price'] : null,
            ],
            'quantity' => (int)($item['quantity'] ?? 0),
            'item_page' => isset($item['item_page']) ? (string)$item['item_page'] : '',
            'market_page' => isset($item['market_page']) ? (string)$item['market_page'] : '',
        ];
    }

    $quotes = [];
    foreach ($marketHashNames as $name) {
        $quotes[$name] = $index[$name] ?? [
            'available' => false,
            'provider' => 'skinport',
            'error' => 'Skinport snapshot not found for this item.',
            'prices' => [],
            'quantity' => 0,
            'item_page' => '',
            'market_page' => '',
        ];
    }

    return $quotes;
}

function csfloatQuoteIsAuctionLike(array $record): bool
{
    $type = strtolower((string)($record['listing_type'] ?? $record['type'] ?? ''));
    return !empty($record['auction'])
        || !empty($record['is_auction'])
        || isset($record['auction_ends_at'])
        || str_contains($type, 'auction');
}

function csfloatQuoteIsBuyNowListing(array $listing): bool
{
    $priceCents = isset($listing['price']) ? (int)$listing['price'] : 0;
    return $priceCents > 0 && !csfloatQuoteIsAuctionLike($listing);
}

function csfloatQuoteFromCachedRecord(string $marketHashName): ?array
{
    $cacheFile = __DIR__ . '/assets/csfloat-cache/' . md5($marketHashName) . '.json';
    if (!is_file($cacheFile)) {
        return null;
    }

    $record = json_decode((string)@file_get_contents($cacheFile), true);
    if (!is_array($record) || !empty($record['_no_listing']) || csfloatQuoteIsAuctionLike($record)) {
        return null;
    }

    $price = isset($record['current_price']) ? (float)$record['current_price'] : 0.0;
    if ($price <= 0) {
        return null;
    }

    return [
        'available' => true,
        'provider' => 'csfloat',
        'error' => '',
        'prices' => [
            'csfloat_lowest' => round($price, 2),
        ],
        'listing_count' => (int)($record['listings'] ?? 1),
        'listing_id' => (string)($record['listing_id'] ?? ''),
        'listing_type' => (string)($record['listing_type'] ?? 'buy_now'),
        'float_value' => $record['float_value'] ?? null,
        'market_url' => 'https://csfloat.com/search?market_hash_name=' . rawurlencode($marketHashName),
    ];
}

function csfloatQuoteSplitMarketHashName(string $marketHashName): array
{
    $cleanName = trim($marketHashName);
    if (preg_match('/^(.*)\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i', $cleanName, $matches)) {
        return [trim((string)$matches[1]), trim((string)$matches[2])];
    }

    return [$cleanName, ''];
}

function csfloatQuoteLookupKey(string $baseName, string $wearName = ''): string
{
    return strtolower(trim($baseName)) . '|' . strtolower(trim($wearName));
}

function csfloatQuoteFromSqlCache(string $marketHashName): ?array
{
    try {
        $pdo = marketHistoryPdoConnection();
        if (!dbTableExists($pdo, 'price_history') || !dbTableExists($pdo, 'items')) {
            return null;
        }

        [$baseName, $wearName] = csfloatQuoteSplitMarketHashName($marketHashName);
        $queryNames = array_values(array_unique(array_filter([$marketHashName, $baseName])));
        if (!$queryNames) {
            return null;
        }

        $placeholders = implode(',', array_fill(0, count($queryNames), '?'));
        $cutoff = (new DateTimeImmutable('7 days ago', new DateTimeZone('UTC')))->format('Y-m-d H:i:s');
        $hasWearColumn = dbColumnExists($pdo, 'price_history', 'wear');

        if ($hasWearColumn) {
            $statement = $pdo->prepare(
                "SELECT i.name AS lookup_name, COALESCE(ph.wear, '') AS wear_name, AVG(ph.price) AS price
                 FROM price_history ph
                 INNER JOIN items i ON i.id = ph.item_id
                 WHERE i.name IN ({$placeholders})
                   AND ph.source = 'CSFloat'
                   AND ph.recorded_at >= ?
                 GROUP BY i.name, COALESCE(ph.wear, '')"
            );
        } else {
            $statement = $pdo->prepare(
                "SELECT i.name AS lookup_name, '' AS wear_name, AVG(ph.price) AS price
                 FROM price_history ph
                 INNER JOIN items i ON i.id = ph.item_id
                 WHERE i.name IN ({$placeholders})
                   AND ph.source = 'CSFloat'
                   AND ph.recorded_at >= ?
                 GROUP BY i.name"
            );
        }
        $statement->execute([...$queryNames, $cutoff]);

        $targetKey = csfloatQuoteLookupKey($baseName, $wearName);
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $lookupName = trim((string)($row['lookup_name'] ?? ''));
            if ($lookupName === '') {
                continue;
            }

            [$rowBaseName, $rowWearFromLookupName] = csfloatQuoteSplitMarketHashName($lookupName);
            $rowWear = trim((string)($row['wear_name'] ?? ''));
            if ($rowWear === '' && $rowWearFromLookupName !== '') {
                $rowWear = $rowWearFromLookupName;
            }

            $candidateKeys = array_unique(array_filter([
                csfloatQuoteLookupKey($lookupName, $rowWear),
                csfloatQuoteLookupKey($rowBaseName, $rowWear),
            ]));
            if (!in_array($targetKey, $candidateKeys, true)) {
                continue;
            }

            $price = isset($row['price']) ? round((float)$row['price'], 2) : 0.0;
            if ($price <= 0) {
                continue;
            }

            return [
                'available' => true,
                'provider' => 'csfloat',
                'error' => '',
                'prices' => [
                    'csfloat_lowest' => $price,
                ],
                'listing_count' => 1,
                'listing_id' => '',
                'listing_type' => 'buy_now',
                'float_value' => null,
                'market_url' => 'https://csfloat.com/search?market_hash_name=' . rawurlencode($marketHashName),
                '_from_db' => true,
            ];
        }
    } catch (Throwable) {
        return null;
    }

    return null;
}

function fetchCsfloatQuote(string $marketHashName, array $config): array
{
    $apiKey = trim((string)($config['api_key'] ?? ''));
    $cacheKey = 'csfloat_quote_v2_' . md5($marketHashName . '|' . ($apiKey !== '' ? 'auth' : 'anon'));
    $cached = loadProviderCache($cacheKey, 900);
    if ($cached !== null) {
        return $cached;
    }

    $cachedListing = csfloatQuoteFromCachedRecord($marketHashName);
    if ($cachedListing !== null) {
        saveProviderCache($cacheKey, $cachedListing);
        return $cachedListing;
    }

    $sqlCachedQuote = csfloatQuoteFromSqlCache($marketHashName);
    if ($sqlCachedQuote !== null) {
        saveProviderCache($cacheKey, $sqlCachedQuote);
        return $sqlCachedQuote;
    }

    $query = http_build_query([
        'market_hash_name' => $marketHashName,
        'limit' => max(1, min(20, (int)($config['limit'] ?? 5))),
        'sort_by' => (string)($config['sort_by'] ?? 'lowest_price'),
        'type' => (string)($config['listing_type'] ?? 'buy_now'),
    ], '', '&', PHP_QUERY_RFC3986);
    $url = rtrim((string)($config['base_url'] ?? 'https://csfloat.com'), '/') . '/api/v1/listings?' . $query;
    $headers = [
        'Accept: application/json',
        'User-Agent: CS2MarketTracker/1.0',
    ];
    if ($apiKey !== '') {
        $headers[] = 'Authorization: ' . $apiKey;
    }

    try {
        $response = httpJsonRequest($url, $headers, (int)($config['timeout_seconds'] ?? 20));
        if (($response['status'] ?? 500) >= 400) {
            $message = (string)($response['json']['message'] ?? ('HTTP ' . (int)$response['status']));
            $payload = [
                'available' => false,
                'provider' => 'csfloat',
                'error' => $message,
                'prices' => [],
                'listing_count' => 0,
            ];
            saveProviderCache($cacheKey, $payload);
            return $payload;
        }

        $json = is_array($response['json']) ? $response['json'] : [];
        $isListPayload = array_keys($json) === range(0, max(0, count($json) - 1));
        $rows = is_array($json['data'] ?? null)
            ? $json['data']
            : ($isListPayload ? $json : []);
        $rows = array_values(array_filter($rows, static fn (mixed $row): bool => is_array($row) && csfloatQuoteIsBuyNowListing($row)));
        if (!$rows) {
            $payload = [
                'available' => false,
                'provider' => 'csfloat',
                'error' => 'No active CSFloat buy-now listings found.',
                'prices' => [],
                'listing_count' => 0,
            ];
            saveProviderCache($cacheKey, $payload);
            return $payload;
        }

        usort($rows, static function (array $left, array $right): int {
            return (int)($left['price'] ?? PHP_INT_MAX) <=> (int)($right['price'] ?? PHP_INT_MAX);
        });
        $bestListing = $rows[0];
        $priceCents = (int)($bestListing['price'] ?? 0);

        $payload = [
            'available' => $priceCents > 0,
            'provider' => 'csfloat',
            'error' => $priceCents > 0 ? '' : 'No priced CSFloat listing found.',
            'prices' => $priceCents > 0 ? [
                'csfloat_lowest' => round($priceCents / 100, 2),
            ] : [],
            'listing_count' => count($rows),
            'listing_id' => (string)($bestListing['id'] ?? ''),
            'listing_type' => (string)($bestListing['type'] ?? $bestListing['listing_type'] ?? 'buy_now'),
            'float_value' => $bestListing['item']['float_value'] ?? null,
            'market_url' => 'https://csfloat.com/search?market_hash_name=' . rawurlencode($marketHashName),
        ];
        saveProviderCache($cacheKey, $payload);
        return $payload;
    } catch (Throwable $exception) {
        $payload = [
            'available' => false,
            'provider' => 'csfloat',
            'error' => $exception->getMessage(),
            'prices' => [],
            'listing_count' => 0,
        ];
        saveProviderCache($cacheKey, $payload);
        return $payload;
    }
}

function mapDmarketQuotes(array $marketHashNames, array $config): array
{
    $quotes = dmarketFetchQuotes($marketHashNames, $config, [
        'cache_only' => false,
        'prefer_live' => true,
        'skip_history' => true,
        'max_live_requests' => count($marketHashNames),
    ]);

    $mapped = [];
    foreach ($marketHashNames as $name) {
        $quote = $quotes[$name] ?? null;
        if (is_array($quote) && !empty($quote['available']) && empty($quote['_no_listing'])) {
            $mapped[$name] = [
                'available' => true,
                'provider' => 'dmarket',
                'error' => '',
                'prices' => [
                    'dmarket_lowest' => round((float)$quote['current_price'], 2),
                ],
                'listing_count' => (int)($quote['listings'] ?? 0),
                'market_url' => (string)($quote['market_url'] ?? ''),
                'item_page' => (string)($quote['market_url'] ?? ''),
                'market_page' => (string)($quote['market_url'] ?? ''),
            ];
            continue;
        }

        $mapped[$name] = [
            'available' => false,
            'provider' => 'dmarket',
            'error' => is_array($quote) ? (string)($quote['error'] ?? 'DMarket quote not found.') : 'DMarket quote not found.',
            'prices' => [],
            'listing_count' => 0,
            'market_url' => '',
            'item_page' => '',
            'market_page' => '',
        ];
    }

    return $mapped;
}

try {
    $payload = requestJsonPayload();
    $marketHashNames = array_values(array_unique(array_filter(array_map(
        static fn ($value): string => trim((string)$value),
        is_array($payload['market_hash_names'] ?? null) ? $payload['market_hash_names'] : []
    ))));
    $providers = array_values(array_unique(array_filter(array_map(
        static fn ($value): string => strtolower(trim((string)$value)),
        is_array($payload['providers'] ?? null) ? $payload['providers'] : ['skinport', 'csfloat']
    ))));

    if (!$marketHashNames) {
        respondJson([
            'success' => true,
            'quotes' => [],
        ]);
    }

    $config = appConfig();
    $quotes = [];
    foreach ($marketHashNames as $name) {
        $quotes[$name] = [];
    }

    if (in_array('skinport', $providers, true)) {
        $skinportQuotes = mapSkinportQuotes($marketHashNames, $config['skinport'] ?? []);
        foreach ($marketHashNames as $name) {
            $quotes[$name]['skinport'] = $skinportQuotes[$name] ?? [
                'available' => false,
                'provider' => 'skinport',
                'error' => 'Skinport quote not found.',
                'prices' => [],
            ];
        }
    }

    if (in_array('csfloat', $providers, true)) {
        foreach ($marketHashNames as $name) {
            $quotes[$name]['csfloat'] = fetchCsfloatQuote($name, $config['csfloat'] ?? []);
        }
    }

    if (in_array('dmarket', $providers, true)) {
        $dmarketQuotes = mapDmarketQuotes($marketHashNames, $config['dmarket'] ?? []);
        foreach ($marketHashNames as $name) {
            $quotes[$name]['dmarket'] = $dmarketQuotes[$name] ?? [
                'available' => false,
                'provider' => 'dmarket',
                'error' => 'DMarket quote not found.',
                'prices' => [],
            ];
        }
    }

    respondJson([
        'success' => true,
        'quotes' => $quotes,
    ]);
} catch (Throwable $exception) {
    respondJson([
        'success' => false,
        'error' => $exception->getMessage(),
    ], 500);
}
