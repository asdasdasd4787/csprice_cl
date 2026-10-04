<?php
declare(strict_types=1);
require __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/csfloat_history_lib.php';
set_time_limit(90);

$raw     = (string)file_get_contents('php://input');
$payload = json_decode($raw, true) ?: [];
// Cached answer when a recent identical request exists (see provider_quote_cache.php).
require_once __DIR__ . '/provider_quote_cache.php';
providerQuoteCacheStart('csfloat', $raw);
$forceLive = !empty($payload['prefer_live']) || !empty($payload['fresh']) || !empty($payload['ignore_cache']);
$cacheOnly = !empty($payload['cache_only']) || !empty($payload['offline_cache_only']);
$ignoreAuctions = !empty($payload['ignore_auctions']) || !empty($payload['buy_now_only']);
$requireVerifiedBuyNow = !empty($payload['require_verified_buy_now']) || !empty($payload['verified_buy_now_only']);
$skipHistory = !empty($payload['skip_history']) || !empty($payload['deals_mode']);
$maxListingPrice = isset($payload['max_listing_price']) && is_numeric($payload['max_listing_price'])
    ? max(1.0, (float)$payload['max_listing_price'])
    : null;
$listingFetchLimit = isset($payload['listing_fetch_limit']) && is_numeric($payload['listing_fetch_limit'])
    ? max(1, min(200, (int)$payload['listing_fetch_limit']))
    : 50;
$countSchema = 2;
$names   = [];
foreach ((array)($payload['market_hash_names'] ?? []) as $n) {
    $t = trim((string)$n);
    if ($t !== '') $names[] = $t;
}
$names = array_values(array_unique($names));

if (empty($names)) {
    respondJson(['success' => false, 'error' => 'No names', 'items' => []]);
    exit;
}

$config = appConfig();
$apiKey = trim((string)($config['csfloat']['api_key'] ?? ''));
$usdToEur = max(0.01, (float)($config['dmarket']['usd_to_eur'] ?? 0.92));

$cacheDir = __DIR__ . '/assets/csfloat-cache';
if (!is_dir($cacheDir)) {
    mkdir($cacheDir, 0755, true);
}

function csfloatRecordIsAuctionLike(array $record): bool
{
    $type = strtolower((string)($record['listing_type'] ?? $record['type'] ?? ''));
    return !empty($record['auction'])
        || !empty($record['is_auction'])
        || isset($record['auction_ends_at'])
        || str_contains($type, 'auction');
}

function csfloatRecordIsVerifiedBuyNow(array $record): bool
{
    if (!empty($record['_csfloat_buy_now']) || !empty($record['_ignore_auctions_verified'])) {
        return true;
    }

    $type = strtolower((string)($record['listing_type'] ?? $record['type'] ?? ''));
    if (in_array($type, ['buy_now', 'fixed', 'fixed_price'], true)) {
        return true;
    }

    // Older CSFloat cache files were generated from the buy_now endpoint but did
    // not store listing_type yet. Trust only file-cache listing records, never DB
    // aggregates, and only when no auction flags are present.
    return empty($record['_from_db'])
        && strtolower((string)($record['source'] ?? '')) === 'csfloat'
        && isset($record['current_price'])
        && (float)$record['current_price'] > 0
        && !csfloatRecordIsAuctionLike($record);
}

function csfloatListingIsBuyNow(array $listing): bool
{
    $priceCents = isset($listing['price']) ? (int)$listing['price'] : 0;
    $type = strtolower((string)($listing['type'] ?? $listing['listing_type'] ?? ''));
    $auctionLike = !empty($listing['auction'])
        || !empty($listing['is_auction'])
        || isset($listing['auction_ends_at'])
        || str_contains($type, 'auction');

    return $priceCents > 0 && !$auctionLike;
}

function csfloatPriceAllowed(?float $price, ?float $maxListingPrice): bool
{
    if ($price === null || !is_finite($price) || $price <= 0) {
        return false;
    }
    return $maxListingPrice === null || $price <= $maxListingPrice;
}

function csfloatResponseListingCount(array $payload, array $listings): int
{
    foreach (['total', 'total_count', 'totalCount', 'count'] as $key) {
        if (isset($payload[$key]) && is_numeric($payload[$key])) {
            return max(0, (int)$payload[$key]);
        }
    }

    foreach (['pagination', 'meta'] as $section) {
        if (!isset($payload[$section]) || !is_array($payload[$section])) {
            continue;
        }
        foreach (['total', 'total_count', 'totalCount', 'count'] as $key) {
            if (isset($payload[$section][$key]) && is_numeric($payload[$section][$key])) {
                return max(0, (int)$payload[$section][$key]);
            }
        }
    }

    return count($listings);
}

function csfloatSplitMarketHashName(string $marketHashName): array
{
    $cleanName = trim($marketHashName);
    if (preg_match('/^(.*)\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i', $cleanName, $matches)) {
        return [trim((string)$matches[1]), trim((string)$matches[2])];
    }

    return [$cleanName, ''];
}

function csfloatLookupKey(string $baseName, string $wearName = ''): string
{
    return strtolower(trim($baseName)) . '|' . strtolower(trim($wearName));
}

function csfloatMarketUrl(string $marketHashName, string $listingId = ''): string
{
    $cleanListingId = trim($listingId);
    if ($cleanListingId !== '') {
        return 'https://csfloat.com/item/' . rawurlencode($cleanListingId);
    }

    return 'https://csfloat.com/search?' . http_build_query([
        'market_hash_name' => $marketHashName,
    ]);
}

function csfloatLoadPriceListIndex(string $cacheDir, bool $forceLive): array
{
    static $memoryIndex = null;

    if ($memoryIndex !== null && !$forceLive) {
        return $memoryIndex;
    }

    $indexFile = $cacheDir . '/_price_list_index.json';
    $indexTtl = 900; // 15 minutes — public bulk index, cheap to refresh

    if (!$forceLive && is_file($indexFile)) {
        $payload = json_decode((string)file_get_contents($indexFile), true);
        $fetchedAt = (int)($payload['fetched_at'] ?? 0);
        $map = is_array($payload['map'] ?? null) ? $payload['map'] : null;
        if ($map !== null && $fetchedAt > 0 && (time() - $fetchedAt) < $indexTtl) {
            $memoryIndex = $map;
            return $memoryIndex;
        }
    }

    $ch = curl_init('https://csfloat.com/api/v1/listings/price-list');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 90,
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
        CURLOPT_USERAGENT      => 'CS2MarketTracker/1.0',
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $body = (string)(curl_exec($ch) ?: '');
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        if (is_file($indexFile)) {
            $payload = json_decode((string)file_get_contents($indexFile), true);
            $map = is_array($payload['map'] ?? null) ? $payload['map'] : [];
            if ($map) {
                $memoryIndex = $map;
                return $memoryIndex;
            }
        }
        return [];
    }

    $rows = json_decode($body, true);
    if (!is_array($rows)) {
        return [];
    }

    $map = [];
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $marketName = trim((string)($row['market_hash_name'] ?? ''));
        if ($marketName === '') {
            continue;
        }
        $map[$marketName] = $row;
    }

    file_put_contents($indexFile, (string)json_encode([
        'fetched_at' => time(),
        'map'        => $map,
    ], JSON_UNESCAPED_UNICODE));

    $memoryIndex = $map;
    return $memoryIndex;
}

function csfloatItemFromPriceListRow(string $name, array $row, float $usdToEur, int $countSchema): array
{
    $minPriceCents = isset($row['min_price']) ? (int)$row['min_price'] : 0;
    $quantity = max(0, (int)($row['quantity'] ?? 0));
    $priceUsd = $minPriceCents > 0 ? round($minPriceCents / 100, 2) : null;
    $price = $priceUsd !== null ? round($priceUsd * $usdToEur, 2) : null;

    return [
        'market_hash_name'         => $name,
        'current_price'            => $price,
        'current_price_display'    => $price !== null ? '€' . number_format($price, 2) : '—',
        'current_price_usd'        => $priceUsd,
        'listings'                 => $quantity > 0 ? $quantity : 0,
        'listings_display'         => $quantity > 0 ? ($quantity . ' listings') : '—',
        'roi_pct'                  => null,
        'roi_display'              => '—',
        'profit_display'           => '—',
        'baseline_price_display'   => '—',
        'range_used'               => 'live',
        'range_notice'             => '',
        'secondary_metric_label'   => 'Float',
        'secondary_metric_display' => '—',
        'sparkline'                => [],
        'source'                   => 'csfloat',
        'source_label'             => 'CSFloat',
        'market_url'               => csfloatMarketUrl($name),
        'wear_name'                => csfloatSplitMarketHashName($name)[1],
        'float_value'              => null,
        'def_index'                => null,
        'listing_type'             => 'buy_now',
        '_no_listing'              => false,
        '_csfloat_buy_now'         => true,
        '_csfloat_price_list'      => true,
        '_ignore_auctions_verified'=> true,
        '_csfloat_count_schema'    => $countSchema,
        '_cached_at'               => time(),
        'price_verified'           => true,
    ];
}

function csfloatOverlayListingsFromPriceList(array &$results, string $cacheDir, bool $forceLive): int
{
    if (!$results) {
        return 0;
    }

    $index = csfloatLoadPriceListIndex($cacheDir, $forceLive);
    if (!$index) {
        return 0;
    }

    $updated = 0;
    foreach ($results as $name => &$item) {
        if (!is_array($item) || !empty($item['_no_listing'])) {
            continue;
        }
        $row = is_array($index[$name] ?? null) ? $index[$name] : null;
        if (!$row) {
            continue;
        }
        $qty = max(0, (int)($row['quantity'] ?? 0));
        if ((int)($item['listings'] ?? 0) === $qty) {
            $item['_csfloat_price_list_overlay'] = true;
            continue;
        }
        $item['listings'] = $qty;
        $item['listings_display'] = $qty > 0 ? ($qty . ' listings') : '—';
        $item['_csfloat_price_list_overlay'] = true;
        $updated++;
    }
    unset($item);

    return $updated;
}

function csfloatUseStaleCacheRecord(array $cached): bool
{
    if (!empty($cached['_no_listing'])) {
        return false;
    }

    $price = isset($cached['current_price']) && is_numeric($cached['current_price'])
        ? (float)$cached['current_price']
        : null;

    return $price !== null && $price > 0;
}

$results      = [];
$toFetch      = [];
$staleCache   = [];
$cacheTtl     = 86400; // 24 hours for real listings
$noListingTtl = 21600; // 6 hours for "no listing" misses
$authFailureDetected = false;

foreach ($names as $name) {
    $cacheFile = $cacheDir . '/' . md5($name) . '.json';
    if (!$forceLive && is_file($cacheFile)) {
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        if (is_array($cached) && isset($cached['market_hash_name'])) {
            $age = time() - (int)filemtime($cacheFile);
            $ttl = !empty($cached['_no_listing']) ? $noListingTtl : $cacheTtl;
            if ($age < $ttl) {
                if (empty($cached['_no_listing'])) {
                    $cachedPrice = isset($cached['current_price']) && is_numeric($cached['current_price'])
                        ? (float)$cached['current_price']
                        : null;
                    if (!csfloatPriceAllowed($cachedPrice, $maxListingPrice)) {
                        $toFetch[] = $name;
                        continue;
                    }
                    if ($ignoreAuctions && csfloatRecordIsAuctionLike($cached)) {
                        $toFetch[] = $name;
                        continue;
                    }
                    if ($ignoreAuctions && $requireVerifiedBuyNow && !csfloatRecordIsVerifiedBuyNow($cached)) {
                        $toFetch[] = $name;
                        continue;
                    }
                    if (!$cacheOnly && (int)($cached['_csfloat_count_schema'] ?? 0) < $countSchema) {
                        $toFetch[] = $name;
                        continue;
                    }
                    if (!isset($cached['price_verified'])) {
                        $cached['price_verified'] = csfloatRecordIsVerifiedBuyNow($cached);
                    }
                    $results[$name] = $cached;
                }
                continue;
            }
            if (csfloatUseStaleCacheRecord($cached)) {
                $staleCache[$name] = $cached;
            }
        }
    }
    $toFetch[] = $name;
}

// ── Public price-list index (CSFloat search API now requires login) ───────────
if (!empty($toFetch) && !$cacheOnly) {
    $priceListIndex = csfloatLoadPriceListIndex($cacheDir, $forceLive);
    if ($priceListIndex) {
        $stillNeeded = [];
        foreach ($toFetch as $name) {
            $row = $priceListIndex[$name] ?? null;
            if (!is_array($row)) {
                $stillNeeded[] = $name;
                continue;
            }

            $item = csfloatItemFromPriceListRow($name, $row, $usdToEur, $countSchema);
            $price = isset($item['current_price']) ? (float)$item['current_price'] : null;
            if (!csfloatPriceAllowed($price, $maxListingPrice)) {
                $stillNeeded[] = $name;
                continue;
            }

            $cacheFile = $cacheDir . '/' . md5($name) . '.json';
            file_put_contents($cacheFile, (string)json_encode($item, JSON_UNESCAPED_UNICODE));
            $results[$name] = $item;
            unset($staleCache[$name]);
        }
        $toFetch = $stillNeeded;
    }
}

// ── DB fallback: pull latest CSFloat price from price_history ─────────────
if (!empty($toFetch) && !$forceLive) {
    try {
        $pdo = marketHistoryPdoConnection();
        if (dbTableExists($pdo, 'price_history') && dbTableExists($pdo, 'items')) {
            $requestMap = [];
            $queryNames = [];
            foreach ($toFetch as $requestedName) {
                [$baseName, $wearName] = csfloatSplitMarketHashName($requestedName);
                $requestMap[csfloatLookupKey($baseName, $wearName)][] = $requestedName;
                foreach (array_unique(array_filter([$requestedName, $baseName])) as $queryName) {
                    $queryNames[$queryName] = $queryName;
                }
            }

            $queryNames = array_values($queryNames);
            $placeholders = implode(',', array_fill(0, count($queryNames), '?'));
            $cutoff = new DateTimeImmutable('7 days ago', new DateTimeZone('UTC'));
            $cutoff = $cutoff->format('Y-m-d H:i:s');
            $hasWearColumn = dbColumnExists($pdo, 'price_history', 'wear');
            if ($hasWearColumn) {
                $stmt = $pdo->prepare(
                    "SELECT i.name AS lookup_name, COALESCE(ph.wear, '') AS wear_name, AVG(ph.price) AS price
                     FROM price_history ph
                     INNER JOIN items i ON i.id = ph.item_id
                     WHERE i.name IN ({$placeholders})
                       AND ph.source = 'CSFloat'
                       AND ph.recorded_at >= ?
                     GROUP BY i.name, COALESCE(ph.wear, '')"
                );
            } else {
                $stmt = $pdo->prepare(
                    "SELECT i.name AS lookup_name, '' AS wear_name, AVG(ph.price) AS price
                     FROM price_history ph
                     INNER JOIN items i ON i.id = ph.item_id
                     WHERE i.name IN ({$placeholders})
                       AND ph.source = 'CSFloat'
                       AND ph.recorded_at >= ?
                     GROUP BY i.name"
                );
            }
            $stmt->execute([...$queryNames, $cutoff]);
            $stillNeeded = [];
            foreach ($toFetch as $name) {
                $stillNeeded[$name] = true;
            }
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $price = round((float)$row['price'], 2);
                if (!csfloatPriceAllowed($price, $maxListingPrice)) {
                    continue;
                }

                $lookupName = trim((string)($row['lookup_name'] ?? ''));
                if ($lookupName === '') {
                    continue;
                }

                [$baseNameFromRow, $wearFromLookupName] = csfloatSplitMarketHashName($lookupName);
                $wearName = trim((string)($row['wear_name'] ?? ''));
                if ($wearName === '' && $wearFromLookupName !== '') {
                    $wearName = $wearFromLookupName;
                }

                $candidateKeys = array_unique(array_filter([
                    csfloatLookupKey($lookupName, $wearName),
                    csfloatLookupKey($baseNameFromRow, $wearName),
                ]));
                $matchedNames = [];
                foreach ($candidateKeys as $candidateKey) {
                    foreach ($requestMap[$candidateKey] ?? [] as $requestedName) {
                        if (isset($stillNeeded[$requestedName])) {
                            $matchedNames[$requestedName] = $requestedName;
                        }
                    }
                }

                foreach ($matchedNames as $requestedName) {
                    $item = [
                        'market_hash_name'         => $requestedName,
                        'current_price'            => $price,
                        'current_price_display'    => '€' . number_format($price, 2),
                        'listings'                 => 0,
                        'listings_display'         => 'DB cache',
                        'roi_pct'                  => null,
                        'roi_display'              => '—',
                        'profit_display'           => '—',
                        'baseline_price_display'   => '—',
                        'range_used'               => '7d',
                        'range_notice'             => '',
                        'secondary_metric_label'   => 'Float',
                        'secondary_metric_display' => '—',
                        'sparkline'                => [],
                        'source'                   => 'csfloat',
                        'source_label'             => 'CSFloat',
                        'market_url'               => csfloatMarketUrl($requestedName),
                        'wear_name'                => $wearName,
                        'float_value'              => null,
                        'def_index'                => null,
                        '_no_listing'              => false,
                        '_from_db'                 => true,
                        '_csfloat_count_schema'    => 2,
                        'price_verified'           => false,
                    ];
                    $results[$requestedName] = $item;
                    unset($stillNeeded[$requestedName]);
                    $cacheFile = $cacheDir . '/' . md5($requestedName) . '.json';
                    file_put_contents($cacheFile, (string)json_encode($item));
                }
            }
            $toFetch = array_values(array_keys($stillNeeded));
        }
    } catch (Throwable) {
        // DB unavailable — fall through to live API
    }
}

// ── Stale file-cache fallback for items missing from the public price-list ────
if (!empty($toFetch)) {
    foreach ($toFetch as $name) {
        if (isset($results[$name]) || !isset($staleCache[$name])) {
            continue;
        }

        $cached = $staleCache[$name];
        if (!csfloatUseStaleCacheRecord($cached)) {
            continue;
        }
        if ($ignoreAuctions && csfloatRecordIsAuctionLike($cached)) {
            continue;
        }
        $cachedPrice = (float)$cached['current_price'];
        if (!csfloatPriceAllowed($cachedPrice, $maxListingPrice)) {
            continue;
        }
        if (!isset($cached['price_verified'])) {
            $cached['price_verified'] = csfloatRecordIsVerifiedBuyNow($cached);
        }
        $results[$name] = $cached;
    }
}

// ── Legacy per-item listing search (CSFloat now requires login for market_hash_name filters) ─
if (!empty($toFetch) && !$cacheOnly && $apiKey !== '' && $forceLive) {
    $CHUNK = 6;
    $headers = [
        'Accept: application/json',
        'Authorization: ' . $apiKey,
    ];

    for ($offset = 0; $offset < count($toFetch); $offset += $CHUNK) {
        $batch   = array_slice($toFetch, $offset, $CHUNK);
        $mh      = curl_multi_init();
        $handles = [];

        foreach ($batch as $name) {
            $url = 'https://csfloat.com/api/v1/listings?' . http_build_query([
                'market_hash_name' => $name,
                'limit'            => $listingFetchLimit,
                'sort_by'          => 'lowest_price',
                'type'             => 'buy_now',
            ]);
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 15,
                CURLOPT_HTTPHEADER     => $headers,
                CURLOPT_USERAGENT      => 'CS2MarketTracker/1.0',
                CURLOPT_SSL_VERIFYPEER => true,
            ]);
            $handles[$name] = $ch;
            curl_multi_add_handle($mh, $ch);
        }

        do {
            curl_multi_exec($mh, $running);
            if ($running > 0) curl_multi_select($mh, 1.0);
        } while ($running > 0);

        foreach ($handles as $name => $ch) {
            $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $body     = (string)(curl_multi_getcontent($ch) ?: '');
            $data     = json_decode($body, true);
            $listings = is_array($data['data'] ?? null) ? $data['data'] : [];
            $listings = array_values(array_filter($listings, 'csfloatListingIsBuyNow'));

            $cacheFile = $cacheDir . '/' . md5($name) . '.json';

            if (!empty($listings) && $httpCode === 200) {
                $first      = $listings[0];
                $priceCents = isset($first['price']) ? (int)$first['price'] : null;
                $priceUsd   = $priceCents !== null ? round($priceCents / 100, 2) : null;
                $price      = $priceUsd !== null ? round($priceUsd * $usdToEur, 2) : null;
                $floatVal   = $first['item']['float_value'] ?? null;
                $wearName   = $first['item']['wear_name']   ?? '';
                $defIndex   = $first['item']['def_index']   ?? null;
                $listingType = (string)($first['type'] ?? $first['listing_type'] ?? 'buy_now');
                $listingCount = max(1, csfloatResponseListingCount($data, $listings));

                if (!csfloatPriceAllowed($price, $maxListingPrice)) {
                    curl_multi_remove_handle($mh, $ch);
                    continue;
                }

                $item = [
                    'market_hash_name'         => $name,
                    'current_price'            => $price,
                    'current_price_display'    => $price !== null ? '€' . number_format($price, 2) : '—',
                    'current_price_usd'        => $priceUsd,
                    'listings'                 => $listingCount,
                    'listings_display'         => $listingCount . ($listingCount >= $listingFetchLimit ? '+ listings' : ' listings'),
                    'roi_pct'                  => null,
                    'roi_display'              => '—',
                    'profit_display'           => '—',
                    'baseline_price_display'   => '—',
                    'range_used'               => '—',
                    'range_notice'             => '',
                    'secondary_metric_label'   => 'Float',
                    'secondary_metric_display' => $floatVal !== null ? number_format((float)$floatVal, 4) : '—',
                    'sparkline'                => [],
                    'source'                   => 'csfloat',
                    'source_label'             => 'CSFloat',
                    'market_url'               => csfloatMarketUrl($name, (string)($first['id'] ?? '')),
                    'wear_name'                => $wearName,
                    'float_value'              => $floatVal,
                    'def_index'                => $defIndex,
                    'listing_id'               => (string)($first['id'] ?? ''),
                    'listing_type'             => $listingType,
                    'state'                    => (string)($first['state'] ?? ''),
                    '_no_listing'              => false,
                    '_csfloat_buy_now'         => true,
                    '_ignore_auctions_verified'=> true,
                    '_csfloat_count_schema'    => $countSchema,
                    '_cached_at'               => time(),
                    'price_verified'           => true,
                ];

                file_put_contents($cacheFile, (string)json_encode($item));
                $results[$name] = $item;

            } elseif (in_array($httpCode, [401, 403], true)) {
                $authFailureDetected = true;
            } elseif ($httpCode !== 429 && $httpCode < 500) {
                $miss = ['market_hash_name' => $name, '_no_listing' => true, '_cached_at' => time()];
                file_put_contents($cacheFile, (string)json_encode($miss));
            }
            // On 401/403/429/5xx do NOT cache so the next request can retry after auth/rate issues recover.

            curl_multi_remove_handle($mh, $ch);
        }
        curl_multi_close($mh);
        if ($offset + $CHUNK < count($toFetch)) {
            usleep(850000);
        }
    }
}

if (!empty($results) && !$cacheOnly && !$skipHistory) {
    $historyNames = array_keys($results);
    foreach ($historyNames as $historyName) {
        if (!empty($results[$historyName]['_no_listing'])) {
            continue;
        }
        $historyPoints = csfloatFetchHistoryGraph($historyName, $cacheDir, $apiKey, $usdToEur, $forceLive);
        if (count($historyPoints) >= 2) {
            $results[$historyName] = csfloatAttachHistoryToItem($results[$historyName], $historyPoints);
            $itemCacheFile = $cacheDir . '/' . md5($historyName) . '.json';
            if (is_file($itemCacheFile)) {
                $cachedItem = json_decode((string)file_get_contents($itemCacheFile), true);
                if (is_array($cachedItem)) {
                    file_put_contents(
                        $itemCacheFile,
                        (string)json_encode(csfloatAttachHistoryToItem($cachedItem, $historyPoints), JSON_UNESCAPED_UNICODE)
                    );
                }
            }
        }
        usleep(120000);
    }
}

csfloatOverlayListingsFromPriceList($results, $cacheDir, false);

respondJson([
    'success'    => true,
    'items'      => array_values($results),
    'source'     => 'csfloat',
    'price_cap'  => $maxListingPrice,
    'warning'    => $authFailureDetected ? 'CSFloat authorization failed for at least one live request.' : null,
    'updated_at' => date('c'),
]);
