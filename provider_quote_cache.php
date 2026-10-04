<?php
/**
 * Response cache for the marketplace quote endpoints (get_csfloat_prices.php,
 * get_waxpeer_prices.php, ...). Each of them calls a third-party API live and
 * takes 10–15 s; the item page fires all of them at once, which also keeps
 * the PHP workers busy so everything else (the chart) queues behind them.
 *
 * Keyed by endpoint + the posted request (names + option flags):
 *   - younger than FRESH_TTL -> served as-is (ms)
 *   - younger than STALE_TTL -> served instantly, rebuilt in the background
 *                               once the response is flushed (PHP-FPM)
 *   - otherwise              -> built now, then stored
 * Only successful payloads with at least one item are stored.
 */
declare(strict_types=1);

const PROVIDER_QUOTE_CACHE_FRESH_TTL = 180;    // 3 minutes
const PROVIDER_QUOTE_CACHE_STALE_TTL = 21600;  // 6 hours
const PROVIDER_QUOTE_CACHE_DIR = __DIR__ . '/assets/chart-bundle-cache/quotes';

function providerQuoteCacheKey(string $source, string $rawBody): string
{
    $payload = json_decode($rawBody, true);
    if (!is_array($payload)) {
        $payload = ['raw' => $rawBody];
    }
    $names = [];
    foreach ((array)($payload['market_hash_names'] ?? []) as $name) {
        $name = trim((string)$name);
        if ($name !== '') {
            $names[] = $name;
        }
    }
    $names = array_values(array_unique($names));
    sort($names, SORT_STRING);
    unset($payload['market_hash_names']);
    ksort($payload);
    return md5($source . "\n" . json_encode($names) . "\n" . json_encode($payload));
}

function providerQuoteCacheEmit(string $gzip, bool $acceptsGzip): void
{
    header('Content-Type: application/json');
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

function providerQuoteCacheStore(string $json, string $file): bool
{
    $json = trim($json);
    if ($json === '' || $json[0] !== '{') {
        return false;
    }
    $decoded = json_decode($json, true);
    if (!is_array($decoded) || ($decoded['success'] ?? true) === false) {
        return false;
    }
    $items = $decoded['items'] ?? null;
    if (!is_array($items) || $items === []) {
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
 * Call right after reading php://input, before any output. Serves the cached
 * answer when one exists (exits when fresh); otherwise buffers this run's
 * output so it gets stored.
 */
function providerQuoteCacheStart(string $source, string $rawBody): void
{
    $payload = json_decode($rawBody, true);
    if (is_array($payload) && !empty($payload['nocache'])) {
        header('X-Quote-Cache: bypass');
        return;
    }
    if (!is_array($payload) || empty($payload['market_hash_names'])) {
        return; // error path, nothing worth caching
    }

    // The refresh flag is not part of the key: a background rebuild stores
    // under the same file the stale hit was served from.
    $keyBody = $payload;
    unset($keyBody['refresh']);
    $file = PROVIDER_QUOTE_CACHE_DIR . '/' . $source . '-' . providerQuoteCacheKey($source, (string)json_encode($keyBody)) . '.json.gz';
    $acceptsGzip = str_contains((string)($_SERVER['HTTP_ACCEPT_ENCODING'] ?? ''), 'gzip');

    // Background rebuild spawned by a stale hit (see market_chart_bundle_cache.php).
    if (!empty($payload['refresh'])) {
        @ignore_user_abort(true);
        @set_time_limit(180);
        header('X-Quote-Cache: refresh');
        ob_start(static function (string $buffer) use ($file): string {
            providerQuoteCacheStore($buffer, $file);
            @unlink($file . '.refreshing');
            return '';
        });
        return;
    }

    if (is_file($file)) {
        $age = time() - (int)filemtime($file);
        if ($age <= PROVIDER_QUOTE_CACHE_STALE_TTL) {
            $raw = (string)@file_get_contents($file);
            if ($raw !== '') {
                $fresh = $age <= PROVIDER_QUOTE_CACHE_FRESH_TTL;
                header('X-Quote-Cache: ' . ($fresh ? 'hit' : 'stale'));
                header('X-Quote-Cache-Age: ' . $age);
                header('Cache-Control: private, max-age=' . ($fresh ? max(30, PROVIDER_QUOTE_CACHE_FRESH_TTL - $age) : 30));
                providerQuoteCacheEmit($raw, $acceptsGzip);
                if (!$fresh) {
                    require_once __DIR__ . '/market_chart_bundle_cache.php';
                    $refreshPayload = $payload;
                    $refreshPayload['refresh'] = 1;
                    cacheSpawnBackgroundRefresh(cacheSelfUrl(), (string)json_encode($refreshPayload), $file . '.refreshing');
                }
                exit;
            }
        }
    }

    header('X-Quote-Cache: miss');

    @ignore_user_abort(true);

    ob_start(static function (string $buffer) use ($file): string {
        providerQuoteCacheStore($buffer, $file);
        return $buffer;
    });
}
