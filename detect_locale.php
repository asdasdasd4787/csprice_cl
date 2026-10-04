<?php
/**
 * Resolves the visitor's country from their IP so the AI chat can offer to
 * switch language after their first prompt. The site itself always starts in
 * English — this only ever feeds a suggestion the visitor can decline.
 *
 * Returns {ok, country, source}. `country` is null whenever we cannot tell
 * (loopback/LAN address, lookup disabled, provider down); the frontend then
 * falls back to the browser locale and time zone.
 */
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';

const LOCALE_CACHE_FILE = __DIR__ . '/logs/geoip_cache.json';
const LOCALE_CACHE_TTL = 86400;   // 24h per IP
const LOCALE_CACHE_MAX = 5000;    // trim the file before it grows unbounded
const LOCALE_LOOKUP_TIMEOUT = 2;  // never make the visitor wait on this

jsonHeaders();

/**
 * The connecting address. Proxy headers are honoured only when the request
 * actually arrives from a proxy we trust, so a visitor cannot spoof a country
 * by sending their own X-Forwarded-For.
 */
function localeClientIp(): string
{
    $remote = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
    $trusted = array_filter(array_map('trim', explode(',', (string)(getenv('CSPRICE_TRUSTED_PROXIES') ?: ''))));
    if ($remote !== '' && $trusted && in_array($remote, $trusted, true)) {
        $forwarded = trim((string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''));
        if ($forwarded !== '') {
            $first = trim(explode(',', $forwarded)[0]);
            if (filter_var($first, FILTER_VALIDATE_IP)) {
                return $first;
            }
        }
    }
    return $remote;
}

function localeIsPublicIp(string $ip): bool
{
    if ($ip === '' || !filter_var($ip, FILTER_VALIDATE_IP)) {
        return false;
    }
    return (bool)filter_var(
        $ip,
        FILTER_VALIDATE_IP,
        FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
    );
}

/**
 * @return array<string, array{country: string, at: int}>
 */
function localeCacheRead(): array
{
    if (!is_file(LOCALE_CACHE_FILE)) {
        return [];
    }
    $raw = @file_get_contents(LOCALE_CACHE_FILE);
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function localeCacheWrite(array $cache): void
{
    if (count($cache) > LOCALE_CACHE_MAX) {
        uasort($cache, static fn(array $a, array $b): int => (int)($b['at'] ?? 0) <=> (int)($a['at'] ?? 0));
        $cache = array_slice($cache, 0, LOCALE_CACHE_MAX, true);
    }
    $dir = dirname(LOCALE_CACHE_FILE);
    if (!is_dir($dir)) {
        @mkdir($dir, 0777, true);
    }
    @file_put_contents(LOCALE_CACHE_FILE, json_encode($cache), LOCK_EX);
}

/**
 * Two-letter country code, or '' when the provider cannot say.
 * Only the IP goes out, and only to resolve a country.
 */
function localeLookupCountry(string $ip): string
{
    $url = 'http://ip-api.com/json/' . rawurlencode($ip) . '?fields=status,countryCode';
    $ch = curl_init($url);
    if ($ch === false) {
        return '';
    }
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => LOCALE_LOOKUP_TIMEOUT,
        CURLOPT_CONNECTTIMEOUT => LOCALE_LOOKUP_TIMEOUT,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_USERAGENT => 'CSPRICE/1.0 (+locale-suggestion)',
    ]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if (!is_string($body) || $status < 200 || $status >= 300) {
        return '';
    }
    $data = json_decode($body, true);
    if (!is_array($data) || ($data['status'] ?? '') !== 'success') {
        return '';
    }
    $code = strtoupper(trim((string)($data['countryCode'] ?? '')));
    return preg_match('/^[A-Z]{2}$/', $code) ? $code : '';
}

$ip = localeClientIp();

if (!localeIsPublicIp($ip)) {
    // Loopback or LAN (local dev, or a reverse proxy without the env var set).
    respondJson(['ok' => true, 'country' => null, 'source' => 'local']);
}

$key = hash('sha256', $ip);
$cache = localeCacheRead();
$hit = $cache[$key] ?? null;
if (is_array($hit) && (time() - (int)($hit['at'] ?? 0)) < LOCALE_CACHE_TTL) {
    $cached = (string)($hit['country'] ?? '');
    respondJson([
        'ok' => true,
        'country' => $cached !== '' ? $cached : null,
        'source' => 'cache',
    ]);
}

$country = localeLookupCountry($ip);
$cache[$key] = ['country' => $country, 'at' => time()];
localeCacheWrite($cache);

respondJson([
    'ok' => true,
    'country' => $country !== '' ? $country : null,
    'source' => $country !== '' ? 'lookup' : 'unresolved',
]);
