<?php
declare(strict_types=1);
/**
 * Sync Steam Market prices for every ROI catalog item into Supabase (roi_prices).
 *
 * Filter to weapon skins only with --skins-only (the Deals page is skins-led).
 *
 * Usage (CLI):
 *   c:/xampp/php/php.exe sync_roi_prices.php [options]
 *
 * Options:
 *   --batch=N          Concurrent cURL requests per wave   (default: 4)
 *   --sleep=N          Milliseconds to sleep between waves (default: 3000)
 *   --stale-hours=N    Re-fetch items older than N hours   (default: 24)
 *   --limit=N          Max items to process this run, 0=all (default: 0)
 *   --offset=N         Skip first N items in catalog       (default: 0)
 *   --dry-run          Print what would be fetched, no DB writes
 */

require __DIR__ . '/app_bootstrap.php';
require __DIR__ . '/roi_prices_db.php';

// ── CLI argument parsing ──────────────────────────────────────────────────────

function parseCliArgs(): array
{
    $opts = getopt('', ['batch::', 'sleep::', 'stale-hours::', 'limit::', 'offset::', 'dry-run', 'skins-only', 'with-stattrak', 'stattrak-only']);
    return [
        'batch'       => max(1, (int)($opts['batch']       ?? 4)),
        'sleep_ms'    => max(0, (int)($opts['sleep']       ?? 3000)),
        'stale_hours' => max(1, (int)($opts['stale-hours'] ?? 24)),
        'limit'       => max(0, (int)($opts['limit']       ?? 0)),
        'offset'      => max(0, (int)($opts['offset']      ?? 0)),
        'dry_run'     => isset($opts['dry-run']),
        'skins_only'  => isset($opts['skins-only']),
        'with_stattrak' => isset($opts['with-stattrak']),
        'stattrak_only' => isset($opts['stattrak-only']),
    ];
}

function cliLog(string $msg): void
{
    echo '[' . date('H:i:s') . '] ' . $msg . PHP_EOL;
}

// ── Steam scraping helpers ────────────────────────────────────────────────────

function syncSteamUrl(string $name): string
{
    return sprintf(
        'https://steamcommunity.com/market/priceoverview/?appid=730&currency=3&market_hash_name=%s',
        rawurlencode($name)
    );
}

function syncMultiFetch(array $urls, int $timeoutSeconds = 25): array
{
    $multi   = curl_multi_init();
    $handles = [];

    foreach ($urls as $key => $url) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Accept: application/json'],
            CURLOPT_TIMEOUT        => $timeoutSeconds,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ]);
        curl_multi_add_handle($multi, $ch);
        $handles[(int)$ch] = ['key' => (string)$key, 'handle' => $ch];
    }

    do {
        $status = curl_multi_exec($multi, $running);
        if ($running) {
            curl_multi_select($multi, 1.0);
        }
    } while ($running && $status === CURLM_OK);

    $responses = [];
    foreach ($handles as $entry) {
        $ch = $entry['handle'];
        $responses[$entry['key']] = [
            'status' => (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE),
            'body'   => (string)(curl_multi_getcontent($ch) ?? ''),
            'error'  => curl_error($ch),
        ];
        curl_multi_remove_handle($multi, $ch);
        curl_close($ch);
    }

    curl_multi_close($multi);
    return $responses;
}

function syncParseSnapshot(string $marketHashName, string $json): ?array
{
    $data = json_decode($json, true);
    if (!is_array($data) || empty($data['success'])) {
        return null;
    }

    $parsePrice = static function (string $s): ?float {
        $c = preg_replace('/[^\d.,]/', '', $s);
        if ($c === '' || $c === null) return null;
        if (preg_match('/,\d{2}$/', $c)) {
            $c = str_replace(['.', ','], ['', '.'], $c);
        } else {
            $c = str_replace(',', '', $c);
        }
        $f = (float)$c;
        return $f > 0 ? round($f, 2) : null;
    };

    // Prefer lowest_price ("Starting at") so Deals/ROI match the live Steam listing ask.
    $currentPrice = $parsePrice((string)($data['lowest_price'] ?? $data['median_price'] ?? ''));
    if ($currentPrice === null) {
        return null;
    }

    $volume = isset($data['volume'])
        ? (int)preg_replace('/[^\d]/', '', (string)$data['volume'])
        : null;

    return [
        'market_hash_name' => $marketHashName,
        'current_price'    => $currentPrice,
        'sell_orders'      => $volume,
        'buy_orders'       => null,
        'history'          => [],
    ];
}

// ── PostgreSQL (Supabase) helpers ───────────────────────────────────────────
// Ported from Azure SQL Server to PostgreSQL when the project moved to Supabase.
// marketDataPdoConnection() returns the Supabase pgsql pooler connection.

// Table schema, upsert and freshness helpers live in roi_prices_db.php so the
// Steam sync and the provider (Skinport/DMarket) sync share identical SQL.
function syncEnsureTable(PDO $pdo): void
{
    roiPricesEnsureTable($pdo);
}

function syncLoadSyncedNames(PDO $pdo, string $source, int $staleHours): array
{
    return roiPricesFreshNames($pdo, $source, $staleHours);
}

function syncUpsertRow(PDO $pdo, array $row): void
{
    roiPricesUpsert($pdo, $row);
}

// ── Main ──────────────────────────────────────────────────────────────────────

$args = parseCliArgs();

cliLog("Starting ROI price sync (batch={$args['batch']}, sleep={$args['sleep_ms']}ms, stale={$args['stale_hours']}h)");

// Load catalog
$catalogPath = __DIR__ . '/assets/steam-market-cache/roi_catalog.json';
if (!is_file($catalogPath)) {
    cliLog('ERROR: roi_catalog.json not found. Run sync_roi_catalog.php first.');
    exit(1);
}

$catalogPayload = json_decode((string)file_get_contents($catalogPath), true);
$allItems       = is_array($catalogPayload['items'] ?? null) ? $catalogPayload['items'] : [];

if (!$allItems) {
    cliLog('ERROR: Catalog is empty.');
    exit(1);
}

cliLog('Catalog loaded: ' . count($allItems) . ' total items');

// Optionally restrict to weapon skins (the Deals page is skins-led).
if ($args['skins_only']) {
    $skinFilters = ['rifles', 'pistols', 'smgs', 'heavy', 'shotguns', 'knives', 'gloves'];
    $allItems = array_values(array_filter($allItems, static function (array $it) use ($skinFilters): bool {
        $sub = strtolower((string)($it['sub_filter'] ?? $it['category'] ?? ''));
        return in_array($sub, $skinFilters, true);
    }));
    cliLog('Skins-only filter applied: ' . count($allItems) . ' weapon-skin items');
}

// Optionally add (or restrict to) StatTrak™ variants. Steam StatTrak names are
// "StatTrak™ <name> (<wear>)". Not every skin has a StatTrak version; those just
// return no listing and are skipped.
if ($args['with_stattrak'] || $args['stattrak_only']) {
    $stPrefix = "StatTrak\xE2\x84\xA2 ";
    $expanded = [];
    foreach ($allItems as $it) {
        $name = (string)($it['market_hash_name'] ?? '');
        if ($name === '' || str_starts_with($name, $stPrefix)) { continue; }
        if (!$args['stattrak_only']) {
            $expanded[] = $it;
        }
        $stItem = $it;
        $stItem['market_hash_name'] = $stPrefix . $name;
        $expanded[] = $stItem;
    }
    $allItems = array_values($expanded);
    cliLog('StatTrak expansion (' . ($args['stattrak_only'] ? 'only' : 'with') . '): now ' . count($allItems) . ' names');
}

// Apply offset / limit
if ($args['offset'] > 0) {
    $allItems = array_slice($allItems, $args['offset']);
    cliLog("Offset applied: skipping first {$args['offset']} items");
}

if ($args['limit'] > 0) {
    $allItems = array_slice($allItems, 0, $args['limit']);
    cliLog("Limit applied: processing up to {$args['limit']} items");
}

// Connect to Azure SQL
if ($args['dry_run']) {
    cliLog('[DRY RUN] Skipping DB connection');
    $pdo = null;
} else {
    cliLog('Connecting to Supabase…');
    try {
        $pdo = marketDataPdoConnection();
        syncEnsureTable($pdo);
        cliLog('Connected. Table roi_prices ensured.');
    } catch (Throwable $e) {
        cliLog('ERROR connecting to Supabase: ' . $e->getMessage());
        exit(1);
    }
}

// Find already-synced items
$syncedNames = [];
if ($pdo !== null) {
    $syncedNames = syncLoadSyncedNames($pdo, 'steam', $args['stale_hours']);
    cliLog('Already synced (fresh): ' . count($syncedNames) . ' items — will skip');
}

// Build work list
$pending = array_values(array_filter(
    $allItems,
    static fn (array $item): bool => !isset($syncedNames[(string)($item['market_hash_name'] ?? '')])
));

cliLog('Items to fetch: ' . count($pending));

if (!$pending) {
    cliLog('Nothing to sync. All items are fresh.');
    exit(0);
}

if ($args['dry_run']) {
    cliLog('[DRY RUN] First 10 items that would be fetched:');
    foreach (array_slice($pending, 0, 10) as $item) {
        cliLog('  ' . $item['market_hash_name']);
    }
    exit(0);
}

// Process in batches
$batches   = array_chunk($pending, $args['batch']);
$total     = count($pending);
$done      = 0;
$saved     = 0;
$failed    = 0;
$startTime = microtime(true);

foreach ($batches as $batchIndex => $batch) {
    $urls = [];
    foreach ($batch as $item) {
        $urls[$item['market_hash_name']] = syncSteamUrl($item['market_hash_name']);
    }

    $responses = syncMultiFetch($urls);

    foreach ($responses as $name => $response) {
        $done++;
        $httpStatus = $response['status'] ?? 0;

        if ($httpStatus === 429) {
            cliLog("RATE LIMITED on '{$name}' — sleeping 30s then retrying batch");
            usleep(30_000_000);
            // Re-fetch this single item
            $retry = syncMultiFetch([$name => syncSteamUrl($name)]);
            $response = $retry[$name] ?? $response;
            $httpStatus = $response['status'] ?? 0;
        }

        if ($httpStatus >= 400 || !empty($response['error'])) {
            $failed++;
            continue;
        }

        $snapshot = syncParseSnapshot($name, (string)$response['body']);
        if ($snapshot === null) {
            $failed++;
            continue;
        }

        $snapshot['source'] = 'steam';
        $snapshot['steam_price_source'] = 'priceoverview';
        $snapshot['price_verified'] = true;

        try {
            syncUpsertRow($pdo, $snapshot);
            // Keep the on-disk ROI file cache warm for the Deals page cache-first path.
            $cacheDir = __DIR__ . '/assets/roi-price-cache';
            if (!is_dir($cacheDir)) {
                @mkdir($cacheDir, 0775, true);
            }
            $cachePath = $cacheDir . '/steam_' . md5($name) . '.json';
            $cachePayload = $snapshot;
            $cachePayload['fetched_at'] = time();
            $cachePayload['updated_at'] = gmdate('c');
            @file_put_contents($cachePath, json_encode($cachePayload, JSON_UNESCAPED_SLASHES));
            $saved++;
        } catch (Throwable $e) {
            cliLog("DB error for '{$name}': " . $e->getMessage());
            $failed++;
        }
    }

    $elapsed = round(microtime(true) - $startTime, 1);
    $rate    = $done > 0 ? round($done / $elapsed, 1) : 0;
    $eta     = $rate > 0 ? round(($total - $done) / $rate) : 0;

    cliLog(sprintf(
        'Progress: %d/%d (%.1f%%) | saved=%d failed=%d | %.1f items/s | ETA ~%ds',
        $done, $total, ($done / $total) * 100,
        $saved, $failed, $rate, $eta
    ));

    if ($done < $total && $args['sleep_ms'] > 0) {
        usleep($args['sleep_ms'] * 1000);
    }
}

$elapsed = round(microtime(true) - $startTime, 1);
cliLog("Done in {$elapsed}s — saved={$saved} failed={$failed} total={$done}");
