<?php
/**
 * Response cache for get_market_chart_bundle.php.
 *
 * Building one bundle means a dozen provider caches plus several remote
 * database round-trips: 7–25 s per request, 2 MB for the full range. The
 * item page fires two of them on every load, so the chart was the thing
 * visitors waited for.
 *
 * Every successful bundle is stored gzipped under assets/chart-bundle-cache/
 * keyed by the request parameters:
 *   - younger than FRESH_TTL  -> served as-is (a few ms)
 *   - younger than STALE_TTL  -> served instantly, then rebuilt in the
 *                                background after the response is flushed
 *                                (fastcgi_finish_request), so the next
 *                                visitor gets a fresh copy
 *   - older / missing         -> built now, then stored
 * Error and empty (fallback) payloads are never cached.
 */
declare(strict_types=1);

const MARKET_CHART_CACHE_FRESH_TTL = 900;     // 15 minutes
const MARKET_CHART_CACHE_STALE_TTL = 172800;  // 48 hours
const MARKET_CHART_CACHE_DIR = __DIR__ . '/assets/chart-bundle-cache';

function marketChartBundleCacheKey(array $query): string
{
    $parts = [];
    foreach (['lookup_name', 'wear', 'range', 'source', 'item_id', 'since'] as $key) {
        $parts[$key] = mb_strtolower(trim((string)($query[$key] ?? '')));
    }
    // The compact form is its own file, derived from the full one on first use.
    if (marketChartBundleCompactRequested($query)) {
        $parts['compact'] = '1';
    }
    if ($parts['range'] === '' || $parts['range'] === 'max') {
        $parts['range'] = 'all';
    }
    if ($parts['source'] === '') {
        $parts['source'] = 'steam';
    }
    if ($parts['item_id'] === '' || $parts['item_id'] === '0') {
        $parts['item_id'] = '1';
    }
    return md5((string)json_encode($parts));
}

function marketChartBundleCachePath(array $query): string
{
    return MARKET_CHART_CACHE_DIR . '/' . marketChartBundleCacheKey($query) . '.json.gz';
}

/* ---------------------------------------------------------------------------
   Compact form (?compact=1).

   A full bundle is ~2 MB of JSON because every point is an object -
   {"date":"2021-02-22","price":62.05,"volume":60,"synthetic":true} - and a
   single-source request still carries all twelve providers. The item page
   asks for the compact form instead:

     - each series' points become rows under `pts`, with the key order in
       `pk`:  {"pk":["date","price","volume"],"pts":[[18680,62.05,60],...]}
     - a plain YYYY-MM-DD date is sent as days since 1970-01-01 (an integer);
       any other date string is passed through unchanged
     - when one source was requested (source != all), the other providers
       keep their label / current price / snapshot but their `points` are
       left out - the page reads only the requested series from such a
       response, and re-requests when a provider tab is opened

   Values are untouched: react/item-page.tsx (expandCompactChartBundle) puts
   the objects back, so the chart sees exactly what it did before. The rows
   are only built when every point in a series has the same keys; a series
   that does not stays in object form.
   ------------------------------------------------------------------------ */
function marketChartBundleCompactRequested(array $query): bool
{
    return !empty($query['compact']);
}

function marketChartBundleDayNumber(string $date): int|string
{
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $m)) {
        return $date;
    }
    $ts = gmmktime(0, 0, 0, (int)$m[2], (int)$m[3], (int)$m[1]);
    return $ts === false ? $date : intdiv($ts, 86400);
}

function marketChartBundleCompactJson(string $json, array $query): string
{
    $decoded = json_decode($json, true);
    if (!is_array($decoded) || ($decoded['success'] ?? false) !== true || !is_array($decoded['series'] ?? null)) {
        return $json;
    }
    $source = mb_strtolower(trim((string)($query['source'] ?? '')));
    if ($source === '') {
        $source = 'steam';
    }
    foreach ($decoded['series'] as $id => &$entry) {
        if (!is_array($entry) || !is_array($entry['points'] ?? null)) {
            continue;
        }
        if ($source !== 'all' && (string)$id !== $source) {
            $entry['points'] = [];
            $entry['points_omitted'] = true;
            continue;
        }
        $keys = null;
        foreach ($entry['points'] as $point) {
            if (!is_array($point)) {
                $keys = null;
                break;
            }
            $pointKeys = array_keys($point);
            if ($keys === null) {
                $keys = $pointKeys;
            } elseif ($pointKeys !== $keys) {
                $keys = null;
                break;
            }
        }
        if ($keys === null) {
            continue;
        }
        $rows = [];
        foreach ($entry['points'] as $point) {
            $row = [];
            foreach ($keys as $key) {
                $value = $point[$key];
                if ($key === 'date' && is_string($value)) {
                    $value = marketChartBundleDayNumber($value);
                }
                $row[] = $value;
            }
            $rows[] = $row;
        }
        unset($entry['points']);
        $entry['pk'] = $keys;
        $entry['pts'] = $rows;
    }
    unset($entry);
    $decoded['compact'] = 1;
    $encoded = json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return $encoded === false ? $json : $encoded;
}

function marketChartBundleEmit(string $gzip, bool $acceptsGzip): void
{
    header('Vary: Accept-Encoding');
    if ($acceptsGzip) {
        header('Content-Encoding: gzip');
        header('Content-Length: ' . strlen($gzip));
        echo $gzip;
        return;
    }
    $plain = gzdecode($gzip);
    if ($plain === false) {
        $plain = '{"success":false,"error":"cache read failed"}';
    }
    header('Content-Length: ' . strlen($plain));
    echo $plain;
}

/**
 * Kick off a rebuild without making anyone wait for it. csprice.eu runs PHP
 * as plain FastCGI behind a buffering proxy: there is no
 * fastcgi_finish_request(), and the proxy holds a response until the script
 * ends, so "keep computing after flushing" still blocks the visitor. Instead
 * the server sends itself the same request with refresh=1 and hangs up after
 * 300 ms; that request keeps running (ignore_user_abort) and stores the new
 * copy. A lock file keeps concurrent stale hits from spawning duplicates.
 */
function cacheSpawnBackgroundRefresh(string $url, ?string $postBody, string $lockFile): void
{
    if (!function_exists('curl_init')) {
        return;
    }
    if (is_file($lockFile) && (time() - (int)filemtime($lockFile)) < 120) {
        return;
    }
    $dir = dirname($lockFile);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    @touch($lockFile);

    // The self-request has no device cookie, so the access gate
    // (access_gate.php, auto-prepended on csprice.eu) would answer 403 and
    // nothing would ever be rebuilt - stale bundles sat at 20 hours old.
    // The gate also opens for its admin key, which lives on this server.
    $headers = [];
    if (function_exists('cspriceGateConfig')) {
        $adminKey = trim((string)(cspriceGateConfig()['admin_key'] ?? ''));
        if ($adminKey !== '') {
            $headers[] = 'X-CSPrice-Admin: ' . $adminKey;
        }
    }

    $curl = curl_init($url);
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT_MS => 300,
        CURLOPT_CONNECTTIMEOUT_MS => 300,
        CURLOPT_NOSIGNAL => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_USERAGENT => 'csprice-cache-refresh/1.0',
    ];
    if ($postBody !== null) {
        $options[CURLOPT_POST] = true;
        $options[CURLOPT_POSTFIELDS] = $postBody;
        $headers[] = 'Content-Type: application/json';
    }
    if ($headers) {
        $options[CURLOPT_HTTPHEADER] = $headers;
    }
    curl_setopt_array($curl, $options);
    @curl_exec($curl);
    curl_close($curl);
}

function cacheSelfUrl(): string
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'
        || (int)($_SERVER['SERVER_PORT'] ?? 0) === 443;
    return ($https ? 'https' : 'http') . '://' . (string)($_SERVER['HTTP_HOST'] ?? 'localhost') . (string)($_SERVER['REQUEST_URI'] ?? '/');
}

/**
 * Store one built payload. Only complete, successful bundles with real
 * points are worth keeping; the synthetic fallback is not.
 */
function marketChartBundleCacheStore(string $json, string $file): bool
{
    $json = trim($json);
    if ($json === '' || $json[0] !== '{') {
        return false;
    }
    $decoded = json_decode($json, true);
    if (!is_array($decoded) || ($decoded['success'] ?? false) !== true) {
        return false;
    }
    $hasPoints = false;
    foreach ((array)($decoded['series'] ?? []) as $series) {
        if (is_array($series) && (int)($series['point_count'] ?? 0) > 0) {
            $hasPoints = true;
            break;
        }
    }
    if (!$hasPoints) {
        return false;
    }
    $gz = gzencode($json, 6);
    if ($gz === false) {
        return false;
    }
    $dir = dirname($file);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $tmp = $file . '.' . getmypid() . '.tmp';
    if (@file_put_contents($tmp, $gz, LOCK_EX) === false) {
        return false;
    }
    @chmod($tmp, 0644);
    if (!@rename($tmp, $file)) {
        @unlink($tmp);
        return false;
    }
    return true;
}

/**
 * Call before any output. Serves a cached bundle when one exists (and exits
 * if it is fresh); otherwise installs an output buffer that stores whatever
 * the endpoint prints.
 */
function marketChartBundleCacheStart(array $query): void
{
    if (!empty($query['nocache'])) {
        header('X-Chart-Cache: bypass');
        return;
    }

    $file = marketChartBundleCachePath($query);
    $compact = marketChartBundleCompactRequested($query);
    $acceptsGzip = str_contains((string)($_SERVER['HTTP_ACCEPT_ENCODING'] ?? ''), 'gzip');

    // Background rebuild spawned by a stale hit: skip the cache read, build,
    // store, print nothing useful (nobody is listening).
    if (!empty($query['refresh'])) {
        @ignore_user_abort(true);
        @set_time_limit(180);
        header('X-Chart-Cache: refresh');
        ob_start(static function (string $buffer) use ($file, $compact, $query): string {
            if ($compact) {
                $buffer = marketChartBundleCompactJson($buffer, $query);
            }
            marketChartBundleCacheStore($buffer, $file);
            @unlink($file . '.refreshing');
            return '';
        });
        return;
    }

    if (is_file($file) && (time() - (int)filemtime($file)) <= MARKET_CHART_CACHE_STALE_TTL) {
        marketChartBundleServeFile($file, $acceptsGzip);
    }

    // Compact asked for but not stored yet: derive it from the full copy when
    // one is on disk, instead of rebuilding from the providers (7-25 s).
    if ($compact) {
        $fullQuery = $query;
        unset($fullQuery['compact']);
        $fullFile = marketChartBundleCachePath($fullQuery);
        if (is_file($fullFile) && (time() - (int)filemtime($fullFile)) <= MARKET_CHART_CACHE_STALE_TTL) {
            $fullJson = @gzdecode((string)@file_get_contents($fullFile));
            if (is_string($fullJson) && $fullJson !== '') {
                if (marketChartBundleCacheStore(marketChartBundleCompactJson($fullJson, $query), $file)) {
                    // Same age as the copy it came from, so it goes stale together.
                    @touch($file, (int)filemtime($fullFile));
                    marketChartBundleServeFile($file, $acceptsGzip);
                }
            }
        }
    }

    header('X-Chart-Cache: miss');
    header('Cache-Control: public, max-age=300');

    @ignore_user_abort(true);
    @set_time_limit(180);

    ob_start(static function (string $buffer) use ($file, $compact, $query): string {
        if ($compact) {
            $buffer = marketChartBundleCompactJson($buffer, $query);
        }
        marketChartBundleCacheStore($buffer, $file);
        return $buffer;
    });
}

/**
 * Emit a stored bundle and exit. A stale one is still served instantly; a
 * detached self-request then rebuilds it for the next visitor.
 */
function marketChartBundleServeFile(string $file, bool $acceptsGzip): void
{
    $raw = (string)@file_get_contents($file);
    if ($raw === '') {
        return;
    }
    $age = time() - (int)filemtime($file);
    $fresh = $age <= MARKET_CHART_CACHE_FRESH_TTL;
    header('X-Chart-Cache: ' . ($fresh ? 'hit' : 'stale'));
    header('X-Chart-Cache-Age: ' . $age);
    header('Cache-Control: public, max-age=' . ($fresh ? max(60, MARKET_CHART_CACHE_FRESH_TTL - $age) : 60));
    marketChartBundleEmit($raw, $acceptsGzip);
    if (!$fresh) {
        $selfUrl = cacheSelfUrl();
        $selfUrl .= (str_contains($selfUrl, '?') ? '&' : '?') . 'refresh=1';
        cacheSpawnBackgroundRefresh($selfUrl, null, $file . '.refreshing');
    }
    exit;
}
