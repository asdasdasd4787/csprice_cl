<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/white_market_history_lib.php';
set_time_limit(60);

// Background export refresh (spawned by whiteMarketLoadExport when the cached
// export is past its TTL): pull the 10 MB file, store it, say nothing useful.
if (isset($_GET['refresh_export']) && (string)$_GET['refresh_export'] === '1') {
    @ignore_user_abort(true);
    @set_time_limit(120);
    $refreshConfig = appConfig()['white_market'] ?? [];
    $refreshDir = __DIR__ . '/assets/white-market-cache';
    if (!is_dir($refreshDir)) {
        @mkdir($refreshDir, 0755, true);
    }
    whiteMarketDownloadExport(
        trim((string)($refreshConfig['export_url'] ?? 'https://export.white.market/v1/prices/730.json')),
        $refreshDir . '/prices_730.json',
        60
    );
    @unlink($refreshDir . '/prices_730.json.refreshing');
    header('Content-Type: application/json');
    echo '{"ok":true}';
    exit;
}

$raw = (string)file_get_contents('php://input');
$payload = json_decode($raw, true);
// Cached answer when a recent identical request exists (see provider_quote_cache.php).
require_once __DIR__ . '/provider_quote_cache.php';
providerQuoteCacheStart('white_market', $raw);
if (!is_array($payload)) {
    $payload = $_GET;
}

$names = $payload['market_hash_names'] ?? [];
if (is_string($names)) {
    $names = array_map('trim', explode(',', $names));
}

$requested = [];
foreach ((array)$names as $name) {
    $clean = trim((string)$name);
    if ($clean !== '') {
        $requested[] = $clean;
    }
}
$requested = array_values(array_unique($requested));

if (!$requested) {
    respondJson(['success' => false, 'source' => 'white_market', 'error' => 'No names', 'items' => []]);
    exit;
}

$config = appConfig()['white_market'] ?? [];
$partnerToken = trim((string)($config['partner_token'] ?? ''));
$usdToEur = whiteMarketUsdToEurRate();
$exportUrl = trim((string)($config['export_url'] ?? 'https://export.white.market/v1/prices/730.json'));
$ttl = max(60, (int)($config['cache_ttl_seconds'] ?? 600));
$timeout = max(5, (int)($config['timeout_seconds'] ?? 20));
$cacheOnly = !empty($payload['cache_only']) || !empty($payload['offline_cache_only']);
$preferLive = !empty($payload['prefer_live']) || !empty($payload['fresh']) || !empty($payload['ignore_cache']);
$ignoreLiveCache = !empty($payload['fresh']) || !empty($payload['ignore_cache']);
// Deals / bulk quotes skip history, but still overlay live cheapest asks.
$bulkMode = !empty($payload['skip_history'])
    || !empty($payload['deals_mode'])
    || count($requested) > 8;
$skipHistory = $bulkMode || !$preferLive;
$allowLiveQuote = $partnerToken !== '' && !$cacheOnly;
$allowLiveHistory = $allowLiveQuote && !$bulkMode && ($preferLive || count($requested) <= 5);
$cacheDir = __DIR__ . '/assets/white-market-cache';
$cacheFile = $cacheDir . '/prices_730.json';

if (!is_dir($cacheDir)) {
    mkdir($cacheDir, 0755, true);
}

/**
 * The bulk export is ~10 MB. The deals page used to force a fresh download on
 * EVERY request (prefer_live passed ttl=0), several chunks in parallel, so
 * the PHP workers spent their time re-fetching and re-decoding the same file
 * and the requests ran past the page's 30 s timeout - both columns then sat
 * as dashes until a reload found the file already cached. Now the cached
 * copy is always answered from disk; when it is past its TTL a detached
 * self-request (?refresh_export=1) replaces it for the next caller.
 */
function whiteMarketLoadExport(string $url, string $cacheFile, int $ttl, int $timeout): array
{
    // The deals page discards a quote whose timestamp is older than 2 h, and
    // the rows here carry the export file's mtime. So: under the TTL serve the
    // file; up to 90 min old serve it and refresh behind the scenes; older
    // than that (the site sat idle) download now - the upstream answers in
    // ~1 s, it was the download-on-every-request that used to be slow. One
    // downloader at a time: while another request holds the lock, the stale
    // file is still the answer.
    if (is_file($cacheFile)) {
        $age = time() - (int)filemtime($cacheFile);
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        if (is_array($cached)) {
            if ($ttl > 0 && $age < $ttl) {
                return $cached;
            }
            if ($ttl > 0 && $age < 5400) {
                whiteMarketSpawnExportRefresh($cacheFile);
                return $cached;
            }
            if ($ttl === 0 && $age < 60) {
                return $cached;
            }
            $lock = $cacheFile . '.downloading';
            if (is_file($lock) && (time() - (int)filemtime($lock)) < 120) {
                return $cached;
            }
            @touch($lock);
            $fresh = whiteMarketDownloadExport($url, $cacheFile, $timeout);
            @unlink($lock);
            return $fresh ?? $cached;
        }
    }

    return whiteMarketDownloadExport($url, $cacheFile, $timeout) ?? [];
}

function whiteMarketSpawnExportRefresh(string $cacheFile): void
{
    $cacheLib = __DIR__ . '/market_chart_bundle_cache.php';
    if (!is_file($cacheLib) || !function_exists('curl_init')) {
        return;
    }
    require_once $cacheLib;
    if (!function_exists('cacheSpawnBackgroundRefresh')) {
        return;
    }
    $lock = $cacheFile . '.refreshing';
    if (is_file($lock) && (time() - (int)filemtime($lock)) < 180) {
        return;
    }
    @touch($lock);
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'
        || (int)($_SERVER['SERVER_PORT'] ?? 0) === 443;
    $base = ($https ? 'https' : 'http') . '://' . (string)($_SERVER['HTTP_HOST'] ?? 'localhost')
        . rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
    cacheSpawnBackgroundRefresh($base . '/get_white_market_prices.php?refresh_export=1', null, $lock . '.spawn');
}

/** Synchronous export download; returns the decoded file or null. */
function whiteMarketDownloadExport(string $url, string $cacheFile, int $timeout): ?array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => min(6, $timeout),
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
        CURLOPT_USERAGENT => 'CS2MarketTracker/1.0',
    ]);

    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($body !== false && $status >= 200 && $status < 300) {
        $decoded = json_decode((string)$body, true);
        if (is_array($decoded)) {
            // Atomic replace: a reader never sees a half-written 10 MB file.
            $tmp = $cacheFile . '.' . getmypid() . '.tmp';
            if (@file_put_contents($tmp, (string)json_encode($decoded), LOCK_EX) !== false && @rename($tmp, $cacheFile)) {
                @chmod($cacheFile, 0644);
            } else {
                @unlink($tmp);
            }
            return $decoded;
        }
    }

    if (is_file($cacheFile)) {
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        if (is_array($cached)) {
            return $cached;
        }
    }

    return null;
}

function whiteMarketRows(array $payload): array
{
    if (isset($payload['items']) && is_array($payload['items'])) {
        return array_values($payload['items']);
    }
    if (isset($payload['data']) && is_array($payload['data'])) {
        return array_values($payload['data']);
    }

    return array_values($payload);
}

function whiteMarketPrice(?array $row, float $usdToEur = 1.0): ?float
{
    if (!$row) {
        return null;
    }
    foreach (['min_price', 'lowest_price', 'cheapest_price', 'price'] as $key) {
        if (isset($row[$key]) && is_numeric($row[$key])) {
            $price = whiteMarketExportPriceToEur((float)$row[$key], $usdToEur);
            return $price !== null && $price > 0 ? $price : null;
        }
    }
    return null;
}

function whiteMarketExportListingCount(?array $row): int
{
    if (!$row) {
        return 0;
    }

    // Prefer the stock number shown on White.Market item cards.
    foreach ([
        'market_product_count',
        'similarQty',
        'similar_qty',
        'quantity',
        'qty',
        'count',
        'listings',
        'volume',
    ] as $key) {
        if (isset($row[$key]) && is_numeric($row[$key])) {
            $count = (int)$row[$key];
            if ($count > 0) {
                return $count;
            }
        }
    }

    return 0;
}

// ── 1. Try MySQL cache first (fast — populated by sync_market_prices.php) ────
// Skip rows older than this so deals don't keep June-stale quotes forever.
$mysqlMaxAgeHours = isset($payload['max_cache_age_hours']) && is_numeric($payload['max_cache_age_hours'])
    ? max(1, (float)$payload['max_cache_age_hours'])
    : 6.0;

$mysqlRows = [];
if (!$preferLive) {
try {
    $pdo = dbPdoConnection('db');
    if (dbTableExists($pdo, 'marketplace_price_cache')) {
        $placeholders = implode(',', array_fill(0, count($requested), '?'));
        $stmt = $pdo->prepare(
            "SELECT market_hash_name, price, listings, market_url, updated_at
             FROM marketplace_price_cache
             WHERE market_hash_name IN ({$placeholders}) AND marketplace = 'white_market'"
        );
        $stmt->execute($requested);
        $nowTs = time();
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $dbRow) {
            $updatedRaw = trim((string)($dbRow['updated_at'] ?? ''));
            $updatedTs = $updatedRaw !== '' ? strtotime($updatedRaw) : false;
            if ($updatedTs === false || ($nowTs - $updatedTs) > ($mysqlMaxAgeHours * 3600)) {
                continue; // stale — fall through to export
            }
            $mysqlRows[trim((string)$dbRow['market_hash_name'])] = $dbRow;
        }
    }
} catch (Throwable) {
    // DB unavailable — fall through to file cache
}
} else {
    try {
        $pdo = dbPdoConnection('db');
    } catch (Throwable) {
        $pdo = null;
    }
}

// ── 2. For any items not in MySQL, use file-cache / live export ───────────────

$stillNeeded = $preferLive
    ? $requested
    : array_values(array_filter($requested, static fn(string $n) => !isset($mysqlRows[$n])));

$lookup = [];
if ($stillNeeded) {
    // prefer_live no longer forces a re-download (see whiteMarketLoadExport);
    // only an explicit fresh / ignore_cache does.
    $export = ($cacheOnly && !$preferLive)
        ? (is_file($cacheFile) ? (json_decode((string)file_get_contents($cacheFile), true) ?: []) : [])
        : whiteMarketLoadExport($exportUrl, $cacheFile, $ignoreLiveCache ? 0 : $ttl, $timeout);
    foreach (whiteMarketRows($export) as $row) {
        if (!is_array($row)) {
            continue;
        }
        $name = trim((string)($row['market_hash_name'] ?? $row['name'] ?? ''));
        $price = whiteMarketPrice($row, $usdToEur);
        if ($name === '' || $price === null) {
            continue;
        }
        // Keep the cheapest phase/variant when export has duplicates (e.g. Doppler).
        if (isset($lookup[$name])) {
            $prev = whiteMarketPrice($lookup[$name], $usdToEur);
            if ($prev !== null && $prev <= $price) {
                continue;
            }
        }
        $lookup[$name] = $row;
    }

    // Write newly found items back to MySQL for next time
    if ($lookup && !empty($pdo) && pdoDriverName($pdo) === 'mysql') {
        try {
            $upsert = $pdo->prepare(<<<SQL
INSERT INTO marketplace_price_cache
    (market_hash_name, marketplace, price, listings, market_url)
VALUES
    (:name, 'white_market', :price, :listings, :url)
ON DUPLICATE KEY UPDATE
    price      = VALUES(price),
    listings   = VALUES(listings),
    market_url = VALUES(market_url),
    updated_at = CURRENT_TIMESTAMP
SQL);
            foreach ($stillNeeded as $sn) {
                $r = $lookup[$sn] ?? null;
                if (!$r) continue;
                $p = whiteMarketPrice($r, $usdToEur);
                if (!$p) continue;
                $exportCount = whiteMarketExportListingCount($r);
                $upsert->execute([
                    ':name'     => $sn,
                    ':price'    => $p,
                    ':listings' => $exportCount > 0 ? $exportCount : null,
                    ':url'      => (string)($r['market_product_link'] ?? '') ?: null,
                ]);
            }
        } catch (Throwable) {}
    }
}

// ── 3. Build response items ───────────────────────────────────────────────────

$itemsByName = [];
$exportUpdatedAt = is_file($cacheFile) ? date('c', (int)filemtime($cacheFile)) : date('c');

foreach ($requested as $name) {
    $item = null;

    if (isset($mysqlRows[$name])) {
        $dbr   = $mysqlRows[$name];
        $price = (float)$dbr['price'];
        if ($price > 0) {
            $count = max(0, (int)($dbr['listings'] ?? 0));
            $item = [
                'market_hash_name'       => $name,
                'current_price'          => $price,
                'current_price_display'  => '€' . number_format($price, 2, '.', ''),
                'listings'               => $count,
                'listings_display'       => $count > 0 ? number_format($count) : '—',
                'roi_pct'                => null,
                'roi_display'            => '—',
                'profit_display'         => '—',
                'baseline_price_display' => '—',
                'range_used'             => 'cache',
                'range_notice'           => '',
                'secondary_metric_label' => 'Listings',
                'secondary_metric_display' => $count > 0 ? (string)$count : '—',
                'market_url'             => (string)($dbr['market_url'] ?? '') ?: whiteMarketBuildItemUrl($name),
                'sparkline'              => [],
                'source'                 => 'white_market',
                'source_label'           => 'White.Market',
                'updated_at'             => (string)($dbr['updated_at'] ?? $exportUpdatedAt),
                'price_verified'         => true,
            ];
        }
    }

    if ($item === null) {
        $row   = $lookup[$name] ?? null;
        $price = whiteMarketPrice(is_array($row) ? $row : null, $usdToEur);
        if ($price !== null) {
            $count = whiteMarketExportListingCount(is_array($row) ? $row : null);
            $item = [
                'market_hash_name'       => $name,
                'current_price'          => $price,
                'current_price_display'  => '€' . number_format($price, 2, '.', ''),
                'listings'               => $count > 0 ? $count : 0,
                'listings_display'       => $count > 0 ? number_format($count) : '—',
                'roi_pct'                => null,
                'roi_display'            => '—',
                'profit_display'         => '—',
                'baseline_price_display' => '—',
                'range_used'             => 'export',
                'range_notice'           => '',
                'secondary_metric_label' => 'Float',
                'secondary_metric_display' => isset($row['cheapest_float']) && is_numeric($row['cheapest_float'])
                    ? number_format((float)$row['cheapest_float'], 4)
                    : '—',
                'market_url'             => (string)($row['market_product_link'] ?? '') ?: whiteMarketBuildItemUrl($name),
                'sparkline'              => [],
                'source'                 => 'white_market',
                'source_label'           => 'White.Market',
                'float_value'            => $row['cheapest_float'] ?? null,
                'inspect_link'           => (string)($row['inspect_link'] ?? ''),
                'updated_at'             => $exportUpdatedAt,
                'price_verified'         => true,
            ];
        }
    }

    if ($item !== null) {
        $itemsByName[$name] = $item;
    }
}

if ($allowLiveQuote) {
    $liveByName = whiteMarketFetchLiveQuotes(
        $requested,
        $cacheDir,
        $partnerToken,
        $usdToEur,
        $ignoreLiveCache
    );
    foreach ($requested as $name) {
        $live = $liveByName[$name] ?? null;
        if (!is_array($live) || empty($live['current_price'])) {
            continue;
        }

        $item = $itemsByName[$name] ?? null;
        $exportRow = $lookup[$name] ?? null;
        $exportCount = whiteMarketExportListingCount(is_array($exportRow) ? $exportRow : null);
        $liveListings = max(0, (int)($live['listings'] ?? 0));
        // Prefer the live card stock, then the bulk export. Never keep a stale
        // higher count from a previous quote or MySQL row.
        $bestListings = $liveListings > 0
            ? $liveListings
            : ($exportCount > 0 ? $exportCount : 1);
        $live['listings'] = $bestListings;
        $live['listings_display'] = number_format($bestListings);

        if ($item === null) {
            $item = array_merge([
                'market_hash_name'         => $name,
                'roi_pct'                  => null,
                'roi_display'              => '—',
                'profit_display'           => '—',
                'baseline_price_display'   => '—',
                'range_used'               => 'live',
                'range_notice'             => '',
                'secondary_metric_label'   => 'Listings',
                'secondary_metric_display' => (string)$bestListings,
                'sparkline'                => [],
                'float_value'              => null,
                'inspect_link'             => '',
            ], $live);
        } else {
            $item['current_price'] = (float)$live['current_price'];
            $item['current_price_display'] = (string)($live['current_price_display'] ?? ('€' . number_format((float)$live['current_price'], 2, '.', '')));
            $item['listings'] = $bestListings;
            $item['listings_display'] = number_format($bestListings);
            $item['secondary_metric_label'] = 'Listings';
            $item['secondary_metric_display'] = (string)$bestListings;
            $item['range_used'] = 'live';
            $item['price_verified'] = true;
            $item['_white_market_live'] = true;
            if (!empty($live['market_url'])) {
                $item['market_url'] = $live['market_url'];
            }
            $item['updated_at'] = (string)($live['updated_at'] ?? date('c'));
            $item['_white_market_similar_qty'] = $live['_white_market_similar_qty'] ?? null;
            $item['_white_market_total_count'] = $live['_white_market_total_count'] ?? null;
        }

        $itemsByName[$name] = $item;

        if (!empty($pdo) && pdoDriverName($pdo) === 'mysql') {
            try {
                $upsertLive = $pdo->prepare(<<<SQL
INSERT INTO marketplace_price_cache
    (market_hash_name, marketplace, price, listings, market_url)
VALUES
    (:name, 'white_market', :price, :listings, :url)
ON DUPLICATE KEY UPDATE
    price      = VALUES(price),
    listings   = VALUES(listings),
    market_url = VALUES(market_url),
    updated_at = CURRENT_TIMESTAMP
SQL);
                $upsertLive->execute([
                    ':name'     => $name,
                    ':price'    => (float)$item['current_price'],
                    ':listings' => $bestListings,
                    ':url'      => (string)($item['market_url'] ?? '') ?: null,
                ]);
            } catch (Throwable) {
            }
        }
    }
}

if ($allowLiveHistory && !$skipHistory) {
    foreach (array_keys($itemsByName) as $historyName) {
        $historyPoints = whiteMarketFetchListingHistory(
            $historyName,
            $cacheDir,
            $partnerToken,
            $usdToEur,
            $preferLive
        );
        if (count($historyPoints) >= 2) {
            $itemsByName[$historyName] = whiteMarketAttachHistoryToItem($itemsByName[$historyName], $historyPoints);
        }
        usleep(120000);
    }
}

respondJson([
    'success' => true,
    'source' => 'white_market',
    'items' => array_values($itemsByName),
    'updated_at' => date('c'),
]);
