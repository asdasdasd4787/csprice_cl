<?php
declare(strict_types=1);
/**
 * One request for everything the item page paints first.
 *
 * On mount the page used to fire the Steam wear table, the main chart bundle,
 * the 1Y provider bundle and five per-wear bundles as eight separate calls,
 * each queueing for a PHP worker behind the rest of the page. This answers all
 * of them at once from the same caches those endpoints use, gzipped, so the
 * chart and the table can paint from a single round trip.
 *
 *   item_bootstrap.php?lookup_name=AK-47%20%7C%20Bloodsport&wear=Factory+New&range=ALL
 *
 * The payload is assembled by calling the existing endpoints internally (in
 * parallel, with the gate's admin key) and stored under
 * assets/item-bootstrap/ for 5 minutes; a stale copy (up to a day) is served
 * instantly and rebuilt behind the scenes, the same way the chart bundles are.
 * Pieces that fail are simply left out - the page then fetches those itself.
 */

require __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/market_chart_bundle_cache.php';

const ITEM_BOOTSTRAP_DIR = __DIR__ . '/assets/item-bootstrap';
const ITEM_BOOTSTRAP_FRESH_TTL = 300;
const ITEM_BOOTSTRAP_STALE_TTL = 86400;
const ITEM_BOOTSTRAP_WEARS = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];

header('Content-Type: application/json; charset=utf-8');
header('Vary: Accept-Encoding');

$lookupName = trim((string)($_GET['lookup_name'] ?? ''));
$wear = trim((string)($_GET['wear'] ?? ''));
$range = strtoupper(trim((string)($_GET['range'] ?? 'ALL'))) ?: 'ALL';
$origin = trim((string)($_GET['origin'] ?? ''));
$refresh = isset($_GET['refresh']) && (string)$_GET['refresh'] === '1';
if ($lookupName === '') {
    http_response_code(400);
    echo '{"success":false,"error":"lookup_name required"}';
    exit;
}
if (!in_array($wear, ITEM_BOOTSTRAP_WEARS, true)) {
    $wear = '';
}

function itemBootstrapEmit(string $gz, int $age): never
{
    $fresh = $age <= ITEM_BOOTSTRAP_FRESH_TTL;
    header('X-Bootstrap-Cache: ' . ($fresh ? 'hit' : 'stale'));
    header('X-Bootstrap-Cache-Age: ' . $age);
    header('Cache-Control: private, max-age=' . ($fresh ? max(30, ITEM_BOOTSTRAP_FRESH_TTL - $age) : 30));
    if (str_contains((string)($_SERVER['HTTP_ACCEPT_ENCODING'] ?? ''), 'gzip')) {
        header('Content-Encoding: gzip');
        header('Content-Length: ' . strlen($gz));
        echo $gz;
        exit;
    }
    $plain = gzdecode($gz);
    echo $plain === false ? '{"success":false}' : $plain;
    exit;
}

function itemBootstrapSelfBase(): string
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'
        || (int)($_SERVER['SERVER_PORT'] ?? 0) === 443;
    return ($https ? 'https' : 'http') . '://' . (string)($_SERVER['HTTP_HOST'] ?? 'localhost')
        . rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
}

/** Fetch several same-site endpoints at once; returns decoded JSON per key (missing on failure). */
function itemBootstrapFetchAll(array $urls, int $timeout = 45): array
{
    $headers = ['Accept: application/json', 'Accept-Encoding: gzip', 'User-Agent: csprice-item-bootstrap/1.0'];
    if (function_exists('cspriceGateConfig')) {
        $adminKey = trim((string)(cspriceGateConfig()['admin_key'] ?? ''));
        if ($adminKey !== '') {
            $headers[] = 'X-CSPrice-Admin: ' . $adminKey;
        }
    }
    $multi = curl_multi_init();
    $handles = [];
    foreach ($urls as $key => $url) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_ENCODING => '',
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_HTTPHEADER => $headers,
        ]);
        curl_multi_add_handle($multi, $ch);
        $handles[$key] = $ch;
    }
    do {
        $status = curl_multi_exec($multi, $running);
        if ($running) {
            curl_multi_select($multi, 0.5);
        }
    } while ($running && $status === CURLM_OK);

    $out = [];
    foreach ($handles as $key => $ch) {
        $body = curl_multi_getcontent($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_multi_remove_handle($multi, $ch);
        curl_close($ch);
        if ($code !== 200 || !is_string($body) || $body === '') {
            continue;
        }
        $decoded = json_decode($body, true);
        if (is_array($decoded)) {
            $out[$key] = $decoded;
        }
    }
    curl_multi_close($multi);
    return $out;
}

function itemBootstrapBuild(string $lookupName, string $wear, string $range, string $origin): array
{
    $base = itemBootstrapSelfBase();
    $urls = [];

    // Steam wear table, cache-only (the page's own first pass is the same call).
    $urls['wear_rows'] = $base . '/get_steam_wear_prices.php?lookup_name=' . rawurlencode($lookupName)
        . '&cache_only=1' . ($origin !== '' ? '&origin=' . rawurlencode($origin) : '');

    // Main chart (all sources, selected wear) and the 1Y provider bundle.
    $urls['bundle:all|' . $range . '|' . $wear] = $base . '/get_market_chart_bundle.php?' . http_build_query([
        'lookup_name' => $lookupName, 'wear' => $wear, 'range' => $range, 'source' => 'all', 'item_id' => '1', 'compact' => '1',
    ]);
    $urls['bundle:all|1Y|' . $wear] = $base . '/get_market_chart_bundle.php?' . http_build_query([
        'lookup_name' => $lookupName, 'range' => '1Y', 'wear' => $wear, 'source' => 'all', 'item_id' => '1', 'compact' => '1',
    ]);
    // The five wear lines of the Steam chart.
    if ($wear !== '') {
        foreach (ITEM_BOOTSTRAP_WEARS as $wearName) {
            $urls['bundle:steam|' . $range . '|' . $wearName] = $base . '/get_market_chart_bundle.php?' . http_build_query([
                'lookup_name' => $lookupName, 'display_name' => $lookupName, 'wear' => $wearName, 'range' => $range, 'source' => 'steam', 'compact' => '1',
            ]);
        }
    }

    $results = itemBootstrapFetchAll($urls);
    $bundles = [];
    foreach ($results as $key => $json) {
        if (str_starts_with((string)$key, 'bundle:') && !empty($json['success'])) {
            $bundles[substr((string)$key, 7)] = $json;
        }
    }

    return [
        'success' => true,
        'generated_at' => gmdate(DATE_ATOM),
        'lookup_name' => $lookupName,
        'wear' => $wear,
        'range' => $range,
        'wear_rows' => $results['wear_rows'] ?? null,
        'bundles' => $bundles,
    ];
}

// ── Cache ────────────────────────────────────────────────────────────────────
if (!is_dir(ITEM_BOOTSTRAP_DIR)) {
    @mkdir(ITEM_BOOTSTRAP_DIR, 0755, true);
}
$cacheKey = md5(mb_strtolower($lookupName) . '|' . $wear . '|' . $range . '|' . mb_strtolower($origin));
$cacheFile = ITEM_BOOTSTRAP_DIR . '/' . $cacheKey . '.json.gz';

if ($refresh) {
    @ignore_user_abort(true);
    @set_time_limit(120);
} elseif (is_file($cacheFile)) {
    $age = time() - (int)filemtime($cacheFile);
    if ($age <= ITEM_BOOTSTRAP_STALE_TTL) {
        $gz = (string)@file_get_contents($cacheFile);
        if ($gz !== '') {
            if ($age > ITEM_BOOTSTRAP_FRESH_TTL) {
                $selfUrl = itemBootstrapSelfBase() . '/item_bootstrap.php?' . http_build_query([
                    'lookup_name' => $lookupName, 'wear' => $wear, 'range' => $range, 'origin' => $origin, 'refresh' => '1',
                ]);
                cacheSpawnBackgroundRefresh($selfUrl, null, $cacheFile . '.refreshing');
            }
            itemBootstrapEmit($gz, $age);
        }
    }
}

@set_time_limit(90);
$payload = itemBootstrapBuild($lookupName, $wear, $range, $origin);
$json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$gz = $json !== false ? gzencode($json, 6) : false;
// Only a payload with the chart in it is worth keeping.
if ($gz !== false && $payload['bundles']) {
    $tmp = $cacheFile . '.' . getmypid() . '.tmp';
    if (@file_put_contents($tmp, $gz, LOCK_EX) !== false && @rename($tmp, $cacheFile)) {
        @chmod($cacheFile, 0644);
    } else {
        @unlink($tmp);
    }
}
@unlink($cacheFile . '.refreshing');
if ($refresh) {
    echo '{"ok":true}';
    exit;
}
if ($gz === false) {
    echo $json === false ? '{"success":false}' : $json;
    exit;
}
itemBootstrapEmit($gz, 0);
