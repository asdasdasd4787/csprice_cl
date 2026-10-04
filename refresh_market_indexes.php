<?php
declare(strict_types=1);

/**
 * Refresh listing/volume indexes used by every item's Market Distribution chart.
 *
 * Bulk indexes (one API call per marketplace, covers the whole catalog):
 *   Skinport, White.Market, CSFloat, Waxpeer, ShadowPay, Market.CSGO
 *
 * Per-item markets (optional, resumable, paced):
 *   --warm=haloskins   HaloSkins quote files
 *   --warm=dmarket     delegates to sync_provider_prices.php
 *   --warm=steam       Steam Market listing total_count (Found N results)
 *
 * Skinport: /v1/items is only prices + `quantity` (per-hash offer stack, e.g. 22).
 * After that pull, catalog `listings` (site "X items", e.g. 555–625) is stamped
 * via scripts/fetch-skinport-listings.js. Re-run the default command to refresh both.
 *
 * Usage:
 *   C:\xampp\php\php.exe refresh_market_indexes.php
 *   C:\xampp\php\php.exe refresh_market_indexes.php --listings-only
 *   C:\xampp\php\php.exe refresh_market_indexes.php --warm=haloskins --sleep-ms=450
 *   C:\xampp\php\php.exe refresh_market_indexes.php --warm=dmarket --stale-hours=12
 *   C:\xampp\php\php.exe refresh_market_indexes.php --warm=steam --sleep-ms=800 --stale-hours=12
 */

require __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/lib/skinport_listing_stamps.php';
require_once __DIR__ . '/waxpeer_helpers.php';
require_once __DIR__ . '/mannco_helpers.php';
require_once __DIR__ . '/shadowpay_helpers.php';
require_once __DIR__ . '/market_csgo_helpers.php';
require_once __DIR__ . '/haloskins_helpers.php';
require_once __DIR__ . '/dmarket_helpers.php';

set_time_limit(0);
ini_set('memory_limit', '1024M');

function rmiLog(string $msg): void
{
    echo '[' . date('H:i:s') . '] ' . $msg . PHP_EOL;
    @flush();
}

function rmiAgeHours(string $path): string
{
    if (!is_file($path)) {
        return 'MISSING';
    }
    return sprintf('%.2fh', (time() - (int)filemtime($path)) / 3600);
}

function rmiParseArgs(): array
{
    $o = getopt('', ['warm::', 'offset::', 'limit::', 'sleep-ms::', 'stale-hours::', 'skip-skinport', 'listings-only']);
    return [
        'warm' => strtolower(trim((string)($o['warm'] ?? ''))),
        'offset' => max(0, (int)($o['offset'] ?? 0)),
        'limit' => max(0, (int)($o['limit'] ?? 0)),
        'sleep_ms' => max(0, (int)($o['sleep-ms'] ?? 450)),
        'stale_hours' => max(0, (int)($o['stale-hours'] ?? 12)),
        'skip_skinport' => isset($o['skip-skinport']),
        'listings_only' => isset($o['listings-only']),
    ];
}

function rmiResolvePython(): string
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
        $bin = $localAppData . DIRECTORY_SEPARATOR . 'Python' . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'python.exe';
        if (is_file($bin)) {
            return $bin;
        }
    }
    return 'python';
}

function rmiCatalogNames(): array
{
    $path = __DIR__ . '/assets/steam-market-cache/roi_catalog.json';
    if (!is_file($path)) {
        return [];
    }
    $payload = json_decode((string)file_get_contents($path), true);
    $names = [];
    foreach ((array)($payload['items'] ?? []) as $item) {
        if (!is_array($item)) {
            continue;
        }
        $name = trim((string)($item['market_hash_name'] ?? ''));
        if ($name !== '') {
            $names[$name] = true;
        }
    }
    return array_keys($names);
}

function rmiHttpGetJson(string $url, array $headers = [], int $timeout = 90): ?array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_ENCODING => '',
        CURLOPT_HTTPHEADER => array_merge(['Accept: application/json'], $headers),
        CURLOPT_USERAGENT => 'CS2MarketTracker/1.0',
    ]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    if ($body === false || $status < 200 || $status >= 300) {
        rmiLog("HTTP {$status} {$url} {$error}");
        return null;
    }
    $decoded = json_decode((string)$body, true);
    return is_array($decoded) ? $decoded : null;
}

function rmiResolveNode(): string
{
    $candidates = [
        getenv('NODE_BIN') ?: '',
        'C:\\Users\\User\\AppData\\Local\\Programs\\cursor\\resources\\app\\resources\\helpers\\node.exe',
        'node',
    ];
    foreach ($candidates as $bin) {
        $bin = trim((string)$bin);
        if ($bin === '') {
            continue;
        }
        if ($bin === 'node' || is_file($bin)) {
            return $bin;
        }
    }
    return 'node';
}

function rmiRefreshSkinportIndex(): int
{
    $path = __DIR__ . '/assets/skinport-cache/items_index.json';
    $cfg = appConfig()['skinport'] ?? [];
    $clientId = trim((string)($cfg['client_id'] ?? ''));
    $clientSecret = trim((string)($cfg['client_secret'] ?? ''));
    $auth = ($clientId !== '' && $clientSecret !== '') ? base64_encode($clientId . ':' . $clientSecret) : '';
    $tradable = (int)($cfg['tradable'] ?? 0);
    $currency = strtoupper(trim((string)($cfg['currency'] ?? 'EUR'))) ?: 'EUR';

    $script = __DIR__ . '/scripts/fetch-skinport-index.js';
    $cmd = sprintf(
        '%s %s %s %s %s',
        escapeshellarg(rmiResolveNode()),
        escapeshellarg($script),
        escapeshellarg($auth),
        escapeshellarg((string)$tradable),
        escapeshellarg($currency)
    );
    $pipes = [];
    $proc = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    if (!is_resource($proc)) {
        rmiLog('Skinport: could not start Node');
        return 0;
    }
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $exit = proc_close($proc);
    if ($exit !== 0 || $stdout === '') {
        rmiLog('Skinport items_index FAILED: ' . trim((string)$stderr));
        return 0;
    }
    $decoded = json_decode((string)$stdout, true);
    $items = is_array($decoded['items'] ?? null) ? $decoded['items'] : [];
    if (!$items) {
        rmiLog('Skinport items_index empty');
        return 0;
    }
    $previousMeta = skinportLoadItemsIndexMeta($path);
    $items = skinportMergeListingStamps(
        $items,
        is_array($previousMeta['items'] ?? null) ? $previousMeta['items'] : []
    );
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    file_put_contents($path, (string)json_encode([
        'fetched_at' => time(),
        'tradable' => $tradable,
        'listings_enriched_at' => (int)($previousMeta['listings_enriched_at'] ?? 0) ?: null,
        'items' => $items,
    ], JSON_UNESCAPED_UNICODE));
    rmiLog('Skinport items_index count=' . count($items) . ' age=' . rmiAgeHours($path));
    rmiEnrichSkinportListingCounts($path);
    return count($items);
}

function rmiEnrichSkinportListingCounts(string $path): int
{
    $listingsScript = __DIR__ . '/scripts/fetch-skinport-listings.js';
    if (!is_file($listingsScript) || !is_file($path)) {
        rmiLog('Skinport catalog listings enrich skipped: missing script or index');
        return 0;
    }
    $enrichCmd = sprintf(
        '%s %s %s %s',
        escapeshellarg(rmiResolveNode()),
        escapeshellarg($listingsScript),
        escapeshellarg('--enrich-index=' . $path),
        escapeshellarg('--sleep-ms=4000')
    );
    $enrichPipes = [];
    $enrichProc = proc_open($enrichCmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $enrichPipes);
    if (!is_resource($enrichProc)) {
        rmiLog('Skinport catalog listings enrich skipped: could not start Node');
        return 0;
    }
    $enrichOut = stream_get_contents($enrichPipes[1]);
    $enrichErr = stream_get_contents($enrichPipes[2]);
    fclose($enrichPipes[1]);
    fclose($enrichPipes[2]);
    $enrichExit = proc_close($enrichProc);
    $enrichJson = json_decode((string)$enrichOut, true);
    if ($enrichExit === 0 && is_array($enrichJson)) {
        rmiLog(
            'Skinport catalog listings stamped=' . (int)($enrichJson['stamped'] ?? 0)
            . ' groups=' . (int)($enrichJson['groups'] ?? 0)
            . ' listing_counts=' . (int)($enrichJson['listing_counts'] ?? 0)
        );
        return (int)($enrichJson['stamped'] ?? 0);
    }
    rmiLog('Skinport catalog listings enrich skipped: ' . trim((string)$enrichErr));
    return 0;
}

function rmiRefreshWhiteMarketExport(): int
{
    $path = __DIR__ . '/assets/white-market-cache/prices_730.json';
    $cfg = appConfig()['white_market'] ?? [];
    $url = trim((string)($cfg['export_url'] ?? 'https://export.white.market/v1/prices/730.json'));
    $payload = rmiHttpGetJson($url, [], max(20, (int)($cfg['timeout_seconds'] ?? 40)));
    if (!is_array($payload)) {
        rmiLog('White.Market export FAILED — keeping previous file if present');
        return is_file($path) ? -1 : 0;
    }
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    file_put_contents($path, (string)json_encode($payload, JSON_UNESCAPED_UNICODE));
    $rows = is_array($payload['items'] ?? null)
        ? $payload['items']
        : (is_array($payload['data'] ?? null) ? $payload['data'] : $payload);
    $count = is_array($rows) ? count($rows) : 0;
    rmiLog('White.Market export rows=' . $count . ' age=' . rmiAgeHours($path));
    return $count;
}

function rmiRefreshCsfloatIndex(): int
{
    $path = __DIR__ . '/assets/csfloat-cache/_price_list_index.json';
    $ch = curl_init('https://csfloat.com/api/v1/listings/price-list');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 90,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
        CURLOPT_USERAGENT => 'CS2MarketTracker/1.0',
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($body === false || $status < 200 || $status >= 300) {
        rmiLog("CSFloat fetch FAILED status={$status}");
        return 0;
    }
    $rows = json_decode((string)$body, true);
    if (!is_array($rows)) {
        rmiLog('CSFloat invalid JSON');
        return 0;
    }
    $map = [];
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $name = trim((string)($row['market_hash_name'] ?? ''));
        if ($name !== '') {
            $map[$name] = $row;
        }
    }
    if (!$map) {
        return 0;
    }
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    file_put_contents($path, (string)json_encode([
        'fetched_at' => time(),
        'map' => $map,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    rmiLog('CSFloat indexed=' . count($map) . ' age=' . rmiAgeHours($path));
    return count($map);
}

function rmiWarmHaloskins(array $args): array
{
    $statePath = __DIR__ . '/assets/haloskins-cache/_warm_state.json';
    $names = rmiCatalogNames();
    $total = count($names);
    $state = is_file($statePath) ? (json_decode((string)file_get_contents($statePath), true) ?: []) : [];
    $offset = $args['offset'] > 0 ? $args['offset'] : max(0, (int)($state['offset'] ?? 0));
    if ($offset >= $total) {
        $offset = 0;
    }
    $slice = $args['limit'] > 0
        ? array_slice($names, $offset, $args['limit'])
        : array_slice($names, $offset);
    $cfg = haloskinsConfig();
    $ok = 0;
    $fail = 0;
    $done = 0;
    rmiLog("HaloSkins warm offset={$offset} remaining=" . count($slice) . " catalog={$total}");
    foreach ($slice as $name) {
        $done++;
        $quotes = haloskinsFetchQuotes([$name], $cfg, ['prefer_live' => true]);
        $quote = $quotes[$name] ?? null;
        $price = is_array($quote) ? ($quote['current_price'] ?? null) : null;
        if (is_numeric($price) && (float)$price > 0) {
            $ok++;
        } else {
            $fail++;
            $authErr = function_exists('haloskinsLastError') ? haloskinsLastError() : null;
            if (is_array($authErr) && (int)($authErr['code'] ?? 0) === 1003) {
                rmiLog(
                    'HaloSkins AUTH FAILED HTTP ' . (int)($authErr['http'] ?? 0)
                    . ' code=1003 ' . trim((string)($authErr['message'] ?? 'Login again'))
                    . ' — listing search needs a www.haloskins.com session access_token in'
                    . ' config.local.php haloskins.access_token (not the Open Platform Trading API key in api_key)'
                );
                break;
            }
        }
        if ($done % 25 === 0) {
            $next = $offset + $done;
            file_put_contents($statePath, (string)json_encode([
                'offset' => $next,
                'ok' => $ok,
                'fail' => $fail,
                'updated_at' => time(),
                'total' => $total,
            ], JSON_PRETTY_PRINT));
            rmiLog("HaloSkins progress {$next}/{$total} ok={$ok} fail={$fail}");
        }
        if ($args['sleep_ms'] > 0) {
            usleep($args['sleep_ms'] * 1000);
        }
    }
    $next = $offset + $done;
    file_put_contents($statePath, (string)json_encode([
        'offset' => $next >= $total ? 0 : $next,
        'ok' => $ok,
        'fail' => $fail,
        'updated_at' => time(),
        'total' => $total,
        'complete' => $next >= $total,
    ], JSON_PRETTY_PRINT));
    rmiLog("HaloSkins warm done ok={$ok} fail={$fail} next_offset=" . ($next >= $total ? 0 : $next));
    return ['ok' => $ok, 'fail' => $fail, 'offset' => $next, 'total' => $total];
}

function rmiWarmSteam(array $args): array
{
    require_once __DIR__ . '/get_roi_prices_cached.php';
    $indexPath = __DIR__ . '/assets/steam-market-cache/listing_counts.json';
    $statePath = __DIR__ . '/assets/steam-market-cache/_listing_warm_state.json';
    $names = rmiCatalogNames();
    $total = count($names);
    $state = is_file($statePath) ? (json_decode((string)file_get_contents($statePath), true) ?: []) : [];
    $index = is_file($indexPath) ? (json_decode((string)file_get_contents($indexPath), true) ?: []) : [];
    $map = is_array($index['map'] ?? null) ? $index['map'] : [];
    $offset = $args['offset'] > 0 ? $args['offset'] : max(0, (int)($state['offset'] ?? 0));
    if ($offset >= $total) {
        $offset = 0;
    }
    $slice = $args['limit'] > 0
        ? array_slice($names, $offset, $args['limit'])
        : array_slice($names, $offset);
    $staleSeconds = max(1, $args['stale_hours']) * 3600;
    $ok = 0;
    $fail = 0;
    $skipped = 0;
    $done = 0;
    $sleepMs = $args['sleep_ms'] > 0 ? $args['sleep_ms'] : 800;
    rmiLog("Steam listing total_count warm offset={$offset} remaining=" . count($slice) . " catalog={$total}");

    foreach ($slice as $name) {
        $done++;
        $existing = is_array($map[$name] ?? null) ? $map[$name] : [];
        $fetchedAt = (int)($existing['fetched_at'] ?? 0);
        if ($fetchedAt > 0 && (time() - $fetchedAt) < $staleSeconds && (int)($existing['listings'] ?? 0) > 0) {
            $skipped++;
        } else {
            $live = cachedLiveFetchSteamListingTotalCount($name);
            $count = is_array($live) ? (int)($live['count'] ?? 0) : 0;
            $source = is_array($live) ? (string)($live['source'] ?? 'steam_total_count') : '';
            if ($count > 0) {
                $map[$name] = [
                    'listings' => $count,
                    'total_count' => $count,
                    'listings_source' => $source,
                    'fetched_at' => time(),
                ];
                cachedPersistSteamListingCount($name, $count, $source);
                $ok++;
            } else {
                $fail++;
            }
            if ($sleepMs > 0) {
                usleep($sleepMs * 1000);
            }
        }
        if ($done % 25 === 0) {
            $next = $offset + $done;
            @mkdir(dirname($indexPath), 0755, true);
            file_put_contents($indexPath, (string)json_encode([
                'fetched_at' => time(),
                'map' => $map,
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            file_put_contents($statePath, (string)json_encode([
                'offset' => $next,
                'ok' => $ok,
                'fail' => $fail,
                'skipped' => $skipped,
                'updated_at' => time(),
                'total' => $total,
            ], JSON_PRETTY_PRINT));
            rmiLog("Steam listings progress {$next}/{$total} ok={$ok} fail={$fail} skipped={$skipped}");
        }
    }

    $next = $offset + $done;
    @mkdir(dirname($indexPath), 0755, true);
    file_put_contents($indexPath, (string)json_encode([
        'fetched_at' => time(),
        'map' => $map,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    file_put_contents($statePath, (string)json_encode([
        'offset' => $next >= $total ? 0 : $next,
        'ok' => $ok,
        'fail' => $fail,
        'skipped' => $skipped,
        'updated_at' => time(),
        'total' => $total,
        'complete' => $next >= $total,
    ], JSON_PRETTY_PRINT));
    rmiLog("Steam listings warm done ok={$ok} fail={$fail} skipped={$skipped} next_offset=" . ($next >= $total ? 0 : $next));
    return ['ok' => $ok, 'fail' => $fail, 'skipped' => $skipped, 'offset' => $next, 'total' => $total];
}

function rmiWarmDmarket(array $args): array
{
    $statePath = __DIR__ . '/assets/dmarket-cache/_warm_state.json';
    $names = rmiCatalogNames();
    $total = count($names);
    $state = is_file($statePath) ? (json_decode((string)file_get_contents($statePath), true) ?: []) : [];
    $offset = $args['offset'] > 0 ? $args['offset'] : max(0, (int)($state['offset'] ?? 0));
    if ($offset >= $total) {
        $offset = 0;
    }
    $slice = $args['limit'] > 0
        ? array_slice($names, $offset, $args['limit'])
        : array_slice($names, $offset);
    $cfg = is_array(appConfig()['dmarket'] ?? null) ? appConfig()['dmarket'] : [];
    $staleSeconds = max(1, $args['stale_hours']) * 3600;
    $ok = 0;
    $fail = 0;
    $skipped = 0;
    $done = 0;
    $batchSize = 10;
    $sleepMs = $args['sleep_ms'] > 0 ? $args['sleep_ms'] : 1500;
    rmiLog("DMarket warm offset={$offset} remaining=" . count($slice) . " catalog={$total}");

    $pending = [];
    $flush = static function () use (&$pending, &$ok, &$fail, $cfg): void {
        if (!$pending) {
            return;
        }
        $quotes = dmarketFetchQuotes($pending, $cfg, [
            'prefer_live' => true,
            'max_live_requests' => count($pending),
        ]);
        foreach ($pending as $name) {
            $quote = $quotes[$name] ?? null;
            $price = is_array($quote) ? ($quote['current_price'] ?? null) : null;
            if (is_numeric($price) && (float)$price > 0) {
                $ok++;
            } else {
                $fail++;
            }
        }
        $pending = [];
    };

    foreach ($slice as $name) {
        $done++;
        $cacheFile = __DIR__ . '/assets/dmarket-cache/' . md5($name) . '.json';
        if (is_file($cacheFile) && (time() - (int)filemtime($cacheFile)) < $staleSeconds) {
            $skipped++;
        } else {
            $pending[] = $name;
            if (count($pending) >= $batchSize) {
                $flush();
                if ($sleepMs > 0) {
                    usleep($sleepMs * 1000);
                }
            }
        }
        if ($done % 50 === 0) {
            $next = $offset + $done;
            file_put_contents($statePath, (string)json_encode([
                'offset' => $next,
                'ok' => $ok,
                'fail' => $fail,
                'skipped' => $skipped,
                'updated_at' => time(),
                'total' => $total,
            ], JSON_PRETTY_PRINT));
            rmiLog("DMarket progress {$next}/{$total} ok={$ok} fail={$fail} skipped={$skipped}");
        }
    }
    $flush();
    $next = $offset + $done;
    file_put_contents($statePath, (string)json_encode([
        'offset' => $next >= $total ? 0 : $next,
        'ok' => $ok,
        'fail' => $fail,
        'skipped' => $skipped,
        'updated_at' => time(),
        'total' => $total,
        'complete' => $next >= $total,
    ], JSON_PRETTY_PRINT));
    rmiLog("DMarket warm done ok={$ok} fail={$fail} skipped={$skipped} next_offset=" . ($next >= $total ? 0 : $next));
    return ['ok' => $ok, 'fail' => $fail, 'skipped' => $skipped, 'offset' => $next, 'total' => $total];
}

$args = rmiParseArgs();
$php = PHP_BINARY !== '' ? PHP_BINARY : 'C:\\xampp\\php\\php.exe';
$report = [
    'started_at' => date('c'),
    'markets' => [],
];

if ($args['warm'] === 'haloskins') {
    $report['haloskins'] = rmiWarmHaloskins($args);
    $report['finished_at'] = date('c');
    file_put_contents(__DIR__ . '/assets/roi-price-cache/refresh_market_indexes_report.json', (string)json_encode($report, JSON_PRETTY_PRINT));
    exit(0);
}

if ($args['warm'] === 'steam') {
    $report['steam'] = rmiWarmSteam($args);
    $report['finished_at'] = date('c');
    file_put_contents(__DIR__ . '/assets/roi-price-cache/refresh_market_indexes_report.json', (string)json_encode($report, JSON_PRETTY_PRINT));
    exit(0);
}

if ($args['warm'] === 'dmarket') {
    $report['dmarket'] = rmiWarmDmarket($args);
    $report['finished_at'] = date('c');
    file_put_contents(__DIR__ . '/assets/roi-price-cache/refresh_market_indexes_report.json', (string)json_encode($report, JSON_PRETTY_PRINT));
    exit(0);
}

if (!empty($args['listings_only'])) {
    rmiLog('=== Skinport catalog listings only ===');
    $report['markets']['skinport_listings'] = rmiEnrichSkinportListingCounts(
        __DIR__ . '/assets/skinport-cache/items_index.json'
    );
    $report['finished_at'] = date('c');
    file_put_contents(__DIR__ . '/assets/roi-price-cache/refresh_market_indexes_report.json', (string)json_encode($report, JSON_PRETTY_PRINT));
    exit(0);
}

$files = [
    'skinport' => __DIR__ . '/assets/skinport-cache/items_index.json',
    'white_market' => __DIR__ . '/assets/white-market-cache/prices_730.json',
    'csfloat' => __DIR__ . '/assets/csfloat-cache/_price_list_index.json',
    'waxpeer' => __DIR__ . '/assets/waxpeer-cache/prices_csgo.json',
    'mannco' => __DIR__ . '/assets/mannco-cache/prices_csgo.json',
    'shadowpay' => __DIR__ . '/assets/shadowpay-cache/prices_eur.json',
    'market_csgo' => __DIR__ . '/assets/market-csgo-cache/prices_eur.json',
];

rmiLog('=== Market Distribution index refresh ===');
foreach ($files as $label => $path) {
    rmiLog(sprintf('  before %-14s %s', $label, rmiAgeHours($path)));
}

if (!$args['skip_skinport']) {
    rmiLog('=== Skinport items_index ===');
    $report['markets']['skinport'] = rmiRefreshSkinportIndex();
}

rmiLog('=== White.Market export ===');
$report['markets']['white_market'] = rmiRefreshWhiteMarketExport();
if (is_file($files['white_market'])) {
    passthru(sprintf('"%s" "%s"', $php, __DIR__ . '/sync_market_prices.php'), $wmCode);
    $report['markets']['white_market_sync_exit'] = $wmCode;
    rmiLog('White.Market DB sync exit=' . $wmCode . ' (file age=' . rmiAgeHours($files['white_market']) . ')');
}

rmiLog('=== CSFloat price-list ===');
$report['markets']['csfloat'] = rmiRefreshCsfloatIndex();

foreach ([
    'waxpeer' => $files['waxpeer'],
    'shadowpay' => $files['shadowpay'],
    'market_csgo' => $files['market_csgo'],
] as $label => $path) {
    if (is_file($path)) {
        @unlink($path);
    }
}

rmiLog('=== Waxpeer ===');
$wp = waxpeerLoadPricesIndex(waxpeerConfig());
$report['markets']['waxpeer'] = count($wp);
rmiLog('Waxpeer count=' . count($wp) . ' age=' . rmiAgeHours($files['waxpeer']));

// Mannco.store rate-limits its bulk endpoint hard — do NOT delete-then-refetch like
// waxpeer/shadowpay/market_csgo above; just let the TTL cache in mannco_helpers.php
// decide, so a throttled refresh still falls back to the last good cache.
rmiLog('=== Mannco.store ===');
$mc = manncoLoadPricesIndex(manncoConfig());
$report['markets']['mannco'] = count($mc);
rmiLog('Mannco.store count=' . count($mc) . ' age=' . rmiAgeHours($files['mannco']));

rmiLog('=== ShadowPay ===');
$sp = shadowpayLoadPricesIndex(shadowpayConfig());
$report['markets']['shadowpay'] = count($sp);
rmiLog('ShadowPay count=' . count($sp) . ' age=' . rmiAgeHours($files['shadowpay']));

rmiLog('=== Market.CSGO ===');
$mc = marketCsgoLoadPricesIndex(marketCsgoConfig());
$report['markets']['market_csgo'] = count($mc);
rmiLog('Market.CSGO count=' . count($mc) . ' age=' . rmiAgeHours($files['market_csgo']));

rmiLog('=== Final ages ===');
foreach ($files as $label => $path) {
    rmiLog(sprintf('  after  %-14s %s', $label, rmiAgeHours($path)));
}

$report['finished_at'] = date('c');
$reportPath = __DIR__ . '/assets/roi-price-cache/refresh_market_indexes_report.json';
file_put_contents($reportPath, (string)json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
rmiLog('Report: ' . $reportPath);
rmiLog('Done. Optional next: php refresh_market_indexes.php --warm=haloskins');
rmiLog('                 php refresh_market_indexes.php --warm=dmarket');
rmiLog('                 php refresh_market_indexes.php --warm=steam');
