<?php
declare(strict_types=1);
/**
 * Populate roi_prices for non-Steam marketplaces so the Deals page reads the
 * cache instead of hitting provider APIs live on every request.
 *
 * Usage (CLI):
 *   c:/xampp/php/php.exe sync_provider_prices.php --source=skinport
 *   c:/xampp/php/php.exe sync_provider_prices.php --source=dmarket --skins-only --limit=500
 *
 * Options:
 *   --source=skinport|dmarket   Which marketplace to sync          (required)
 *   --skins-only                Only weapon skins (Deals is skins-led)
 *   --limit=N                   Max catalog items this run, 0=all   (default: 0)
 *   --offset=N                  Skip first N catalog items          (default: 0)
 *   --stale-hours=N             Skip items synced within N hours     (default: 24)
 *   --batch=N                   DMarket: items per pacing wave        (default: 20)
 *   --sleep=N                   DMarket: ms to sleep between waves     (default: 1500)
 *   --dry-run                   No DB writes
 *
 * Skinport is a single bulk /v1/items call (returns every item at once), so it
 * ignores --batch/--sleep and is cheap on rate limit. DMarket is per-title, so
 * it is paced and best run with --skins-only / --limit.
 */

require __DIR__ . '/app_bootstrap.php';
require __DIR__ . '/roi_prices_db.php';
require __DIR__ . '/dmarket_helpers.php';
require_once __DIR__ . '/lib/skinport_listing_stamps.php';

if (PHP_SAPI !== 'cli') {
    header('Content-Type: text/plain; charset=utf-8');
}
set_time_limit(0);

function provLog(string $msg): void
{
    echo '[' . date('H:i:s') . '] ' . $msg . PHP_EOL;
    if (PHP_SAPI !== 'cli') { @flush(); }
}

function provParseArgs(): array
{
    $o = getopt('', ['source:', 'skins-only', 'limit::', 'offset::', 'stale-hours::', 'batch::', 'sleep::', 'dry-run']);
    return [
        'source'      => strtolower(trim((string)($o['source'] ?? ''))),
        'skins_only'  => isset($o['skins-only']),
        'limit'       => max(0, (int)($o['limit']       ?? 0)),
        'offset'      => max(0, (int)($o['offset']      ?? 0)),
        'stale_hours' => max(0, (int)($o['stale-hours'] ?? 24)),
        'batch'       => max(1, (int)($o['batch']       ?? 20)),
        'sleep_ms'    => max(0, (int)($o['sleep']       ?? 1500)),
        'dry_run'     => isset($o['dry-run']),
    ];
}

function provResolvePython(): string
{
    $override = trim((string)getenv('PYTHON_BIN'));
    if ($override !== '') return $override;
    $localAppData = getenv('LOCALAPPDATA');
    if (is_string($localAppData) && $localAppData !== '') {
        $matches = glob($localAppData . DIRECTORY_SEPARATOR . 'Python' . DIRECTORY_SEPARATOR . 'pythoncore-*' . DIRECTORY_SEPARATOR . 'python.exe');
        if (is_array($matches) && $matches) { rsort($matches); return $matches[0]; }
        $bin = $localAppData . DIRECTORY_SEPARATOR . 'Python' . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'python.exe';
        if (is_file($bin)) return $bin;
    }
    return 'python';
}

// ── Catalog ────────────────────────────────────────────────────────────────
function provLoadCatalogItems(array $args): array
{
    $path = __DIR__ . '/assets/steam-market-cache/roi_catalog.json';
    if (!is_file($path)) { provLog('ERROR: roi_catalog.json not found.'); exit(1); }
    $payload = json_decode((string)file_get_contents($path), true);
    $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];

    if ($args['skins_only']) {
        $skins = ['rifles', 'pistols', 'smgs', 'heavy', 'shotguns', 'knives', 'gloves'];
        $items = array_values(array_filter($items, static function (array $it) use ($skins): bool {
            $sub = strtolower((string)($it['sub_filter'] ?? $it['category'] ?? ''));
            return in_array($sub, $skins, true);
        }));
    }
    if ($args['offset'] > 0) $items = array_slice($items, $args['offset']);
    if ($args['limit']  > 0) $items = array_slice($items, 0, $args['limit']);
    return $items;
}

function provLoadCatalogNames(array $args): array
{
    $names = [];
    foreach (provLoadCatalogItems($args) as $it) {
        $n = trim((string)($it['market_hash_name'] ?? ''));
        if ($n !== '') $names[$n] = true;
    }
    return array_keys($names);
}

/** API wear name -> catalog storage keys (base name + full name). */
function provCatalogAliasMap(array $catalogItems): array
{
    $map = [];
    foreach ($catalogItems as $it) {
        $base = trim((string)($it['market_hash_name'] ?? ''));
        if ($base === '') {
            continue;
        }
        $wear = trim((string)($it['selected_wear'] ?? 'Factory New')) ?: 'Factory New';
        $wearName = $base;
        if (!preg_match('/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/u', $base)) {
            $wearName = $base . ' (' . $wear . ')';
        }
        foreach (array_unique([$base, $wearName]) as $key) {
            $map[$wearName][$key] = true;
            if ($key === $wearName) {
                $map[$key][$key] = true;
            }
        }
    }
    foreach ($map as $apiName => $aliases) {
        $map[$apiName] = array_keys($aliases);
    }
    return $map;
}

// ── Skinport: bulk /v1/items + /v1/sales/history, median listing price
function provSyncSkinport(PDO $pdo, array $catalogItems, bool $dryRun): array
{
    $cfg = appConfig()['skinport'] ?? [];
    $clientId     = trim((string)($cfg['client_id']     ?? ''));
    $clientSecret = trim((string)($cfg['client_secret'] ?? ''));
    $authHeader   = ($clientId !== '' && $clientSecret !== '') ? base64_encode($clientId . ':' . $clientSecret) : '';
    // 1 = immediately tradable only, matches the price a buyer can actually pay
    // today. 0 includes trade-locked asks, which can look cheap but aren't buyable.
    $tradable = (int)($cfg['tradable'] ?? 1);
    $aliasMap = provCatalogAliasMap($catalogItems);

    $py = <<<'PY'
import json, sys, requests
auth = sys.argv[1] if len(sys.argv) > 1 else ''
tradable = sys.argv[2] if len(sys.argv) > 2 else '1'
headers = {'Accept': 'application/json', 'Accept-Encoding': 'br'}
if auth:
    headers['Authorization'] = 'Basic ' + auth
items = requests.get('https://api.skinport.com/v1/items',
    params={'app_id': 730, 'currency': 'EUR', 'tradable': int(tradable)},
    headers=headers, timeout=90)
items.raise_for_status()
hist = requests.get('https://api.skinport.com/v1/sales/history',
    params={'app_id': 730, 'currency': 'EUR'},
    headers=headers, timeout=90)
hist.raise_for_status()
hist_map = {r['market_hash_name']: r for r in hist.json() if isinstance(r, dict) and r.get('market_hash_name')}
out = []
for it in items.json():
    if not isinstance(it, dict):
        continue
    name = it.get('market_hash_name')
    h = hist_map.get(name) or {}
    out.append({
        'market_hash_name': name,
        'min_price': it.get('min_price'),
        'median_price': it.get('median_price'),
        'suggested_price': it.get('suggested_price'),
        'quantity': it.get('quantity'),
        'market_page': it.get('market_page') or '',
        'item_page': it.get('item_page') or '',
        'history': h,
    })
print(json.dumps(out))
PY;

    $cmd = sprintf('%s - %s %s', escapeshellarg(provResolvePython()), escapeshellarg($authHeader), escapeshellarg((string)$tradable));
    $pipes = [];
    $proc = proc_open($cmd, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    if (!is_resource($proc)) { provLog('ERROR: could not start python.'); return ['saved' => 0, 'failed' => 0]; }
    fwrite($pipes[0], $py);
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $exit = proc_close($proc);

    if ($exit !== 0 || $stdout === '') {
        provLog('ERROR: Skinport fetch failed (exit ' . $exit . '): ' . trim((string)$stderr));
        return ['saved' => 0, 'failed' => 0];
    }
    $rows = json_decode($stdout, true);
    if (!is_array($rows)) { provLog('ERROR: Skinport returned invalid JSON.'); return ['saved' => 0, 'failed' => 0]; }

    provLog('Skinport returned ' . count($rows) . ' items.');
    $saved = 0; $failed = 0; $noListing = 0;
    $now = time();

    foreach ($rows as $row) {
        $apiName = (string)($row['market_hash_name'] ?? '');
        if ($apiName === '') {
            continue;
        }

        $price = null;
        foreach (['min_price', 'suggested_price', 'mean_price', 'median_price'] as $k) {
            if (isset($row[$k]) && is_numeric($row[$k]) && (float)$row[$k] > 0) {
                $price = round((float)$row[$k], 2);
                break;
            }
        }
        if ($price === null) {
            $h24 = is_array($row['history']['last_24_hours'] ?? null) ? $row['history']['last_24_hours'] : [];
            foreach (['min', 'avg', 'median'] as $k) {
                if (isset($h24[$k]) && is_numeric($h24[$k]) && (float)$h24[$k] > 0) {
                    $price = round((float)$h24[$k], 2);
                    break;
                }
            }
        }
        if ($price === null) {
            $noListing++;
            continue;
        }

        $pts = [];
        $hist = is_array($row['history'] ?? null) ? $row['history'] : [];
        foreach ([['last_90_days', 90], ['last_30_days', 30], ['last_7_days', 7], ['last_24_hours', 1]] as [$bucket, $days]) {
            $bucketRow = is_array($hist[$bucket] ?? null) ? $hist[$bucket] : [];
            foreach (['median', 'avg', 'min'] as $k) {
                if (isset($bucketRow[$k]) && is_numeric($bucketRow[$k])) {
                    $pts[] = ['time' => $now - $days * 86400, 'price' => round((float)$bucketRow[$k], 4)];
                    break;
                }
            }
        }
        $pts[] = ['time' => $now, 'price' => $price];

        $storageKeys = array_unique(array_merge([$apiName], $aliasMap[$apiName] ?? []));
        if ($dryRun) {
            $saved += count($storageKeys);
            continue;
        }

        foreach ($storageKeys as $storeName) {
            try {
                roiPricesUpsert($pdo, [
                    'market_hash_name' => $storeName,
                    'source'           => 'skinport',
                    'current_price'    => $price,
                    'sell_orders'      => isset($row['quantity']) && is_numeric($row['quantity']) ? (int)$row['quantity'] : null,
                    'buy_orders'       => null,
                    'price_history'    => $pts,
                    'market_url'       => (string)($row['item_page'] ?: $row['market_page'] ?: ''),
                    'price_verified'   => true,
                ]);
                $saved++;
            } catch (Throwable $e) {
                $failed++;
                provLog("DB error for '{$storeName}': " . $e->getMessage());
            }
        }
    }
    if ($rows && !$dryRun) {
        $index = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $indexName = trim((string)($row['market_hash_name'] ?? ''));
            if ($indexName === '') {
                continue;
            }
            $index[$indexName] = $row;
        }
        if ($index) {
            $indexDir = __DIR__ . '/assets/skinport-cache';
            if (!is_dir($indexDir)) {
                mkdir($indexDir, 0755, true);
            }
            $indexPath = $indexDir . '/items_index.json';
            $previousMeta = skinportLoadItemsIndexMeta($indexPath);
            $index = skinportMergeListingStamps(
                $index,
                is_array($previousMeta['items'] ?? null) ? $previousMeta['items'] : []
            );
            file_put_contents($indexPath, (string)json_encode([
                'fetched_at' => time(),
                'listings_enriched_at' => (int)($previousMeta['listings_enriched_at'] ?? 0) ?: null,
                'items' => $index,
            ], JSON_UNESCAPED_UNICODE));
            provLog('Skinport items_index written: ' . count($index));
        }
    }

    provLog("Skinport: saved={$saved}, no-listing(skipped)={$noListing}, db-failed={$failed}");
    return ['saved' => $saved, 'failed' => $failed];
}

// ── DMarket: per-title via dmarket_helpers, paced ───────────────────────────
function provSyncDmarket(PDO $pdo, array $names, array $args): array
{
    $config = appConfig()['dmarket'] ?? [];
    if (trim((string)($config['public_key'] ?? '')) === '') {
        provLog('WARNING: no DMarket public_key configured — requests may be rejected.');
    }
    $batches = array_chunk($names, $args['batch']);
    $total = count($names); $done = 0; $saved = 0; $failed = 0; $noListing = 0;
    $start = microtime(true);

    foreach ($batches as $batch) {
        $quotes = dmarketFetchQuotes($batch, $config, [
            'prefer_live'       => true,
            'max_live_requests' => count($batch),
        ]);

        foreach ($batch as $name) {
            $done++;
            $q = $quotes[$name] ?? null;
            $price = is_array($q) ? ($q['current_price'] ?? null) : null;
            if (!is_numeric($price) || (float)$price <= 0) { $noListing++; continue; }
            if ($args['dry_run']) { $saved++; continue; }
            try {
                roiPricesUpsert($pdo, [
                    'market_hash_name' => $name,
                    'source'           => 'dmarket',
                    'current_price'    => round((float)$price, 2),
                    'sell_orders'      => isset($q['listings']) && is_numeric($q['listings']) ? (int)$q['listings'] : null,
                    'buy_orders'       => null,
                    'market_url'       => (string)($q['market_url'] ?? ''),
                ]);
                $saved++;
            } catch (Throwable $e) {
                $failed++;
                provLog("DB error for '{$name}': " . $e->getMessage());
            }
        }

        $elapsed = max(0.1, microtime(true) - $start);
        provLog(sprintf('DMarket progress: %d/%d | saved=%d no-listing=%d failed=%d | %.1fs',
            $done, $total, $saved, $noListing, $failed, $elapsed));
        if ($done < $total && $args['sleep_ms'] > 0) usleep($args['sleep_ms'] * 1000);
    }
    return ['saved' => $saved, 'failed' => $failed];
}

// ── Main ─────────────────────────────────────────────────────────────────────
$args = provParseArgs();
if (!in_array($args['source'], ['skinport', 'dmarket'], true)) {
    provLog('ERROR: --source must be skinport or dmarket.');
    exit(1);
}

provLog("Provider sync: source={$args['source']} skins_only=" . ($args['skins_only'] ? 'yes' : 'no'));
$catalogItems = provLoadCatalogItems($args);
$names = provLoadCatalogNames($args);
provLog('Catalog names in scope: ' . count($names));
if (!$catalogItems) { provLog('Nothing to sync.'); exit(0); }

$pdo = null;
if (!$args['dry_run']) {
    try {
        $pdo = marketDataPdoConnection();
        roiPricesEnsureTable($pdo);
        provLog('Connected. roi_prices ensured.');
    } catch (Throwable $e) {
        provLog('ERROR connecting to market DB: ' . $e->getMessage());
        exit(1);
    }

    // DMarket: incremental per-name skip. Skinport bulk-refreshes all listings.
    if ($args['source'] === 'dmarket' && $args['stale_hours'] > 0) {
        $fresh = roiPricesFreshNames($pdo, $args['source'], $args['stale_hours']);
        $before = count($names);
        $names = array_values(array_filter($names, static fn (string $n) => !isset($fresh[$n])));
        provLog('Fresh (skipped): ' . ($before - count($names)) . ' | to fetch: ' . count($names));
        if (!$names) { provLog('All fresh. Done.'); exit(0); }
    }
    if ($args['source'] === 'skinport' && $args['stale_hours'] > 0) {
        $freshStmt = $pdo->prepare(
            'SELECT COUNT(*) FROM roi_prices WHERE source = ? AND updated_at >= now() - (? * interval \'1 hour\')'
        );
        $freshStmt->execute(['skinport', $args['stale_hours']]);
        $freshCount = (int)$freshStmt->fetchColumn();
        if ($freshCount > 3000) {
            provLog("Skinport already has {$freshCount} fresh rows — skipping bulk sync.");
            exit(0);
        }
    }
}

$result = $args['source'] === 'skinport'
    ? provSyncSkinport($pdo, $catalogItems, $args['dry_run'])
    : provSyncDmarket($pdo, $names, $args);

provLog("Done — source={$args['source']} saved={$result['saved']} failed={$result['failed']}" . ($args['dry_run'] ? ' (dry-run)' : ''));
