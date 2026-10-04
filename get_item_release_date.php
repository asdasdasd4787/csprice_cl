<?php
declare(strict_types=1);

/**
 * Resolve item release dates from CSGOSKINS.GG (scraped + cached).
 * GET ?market_hash_name=Atlanta%202017%20Legends%20(Holo-Foil)
 */

require_once __DIR__ . '/app_bootstrap.php';

const RELEASE_DATE_CACHE_TTL = 2592000; // 30 days
const RELEASE_DATE_NEGATIVE_TTL = 86400; // 1 day for misses

function releaseDateCacheDir(): string
{
    $dir = __DIR__ . '/assets/cache/release-dates';
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    return $dir;
}

function releaseDateCachePath(string $cacheKey): string
{
    return releaseDateCacheDir() . DIRECTORY_SEPARATOR . $cacheKey . '.json';
}

function releaseDateCacheLoad(string $cacheKey, int $ttl): ?array
{
    $path = releaseDateCachePath($cacheKey);
    if (!is_file($path)) {
        return null;
    }
    $mtime = @filemtime($path);
    if ($mtime === false || $mtime < time() - $ttl) {
        return null;
    }
    $decoded = json_decode((string)@file_get_contents($path), true);
    return is_array($decoded) ? $decoded : null;
}

function releaseDateCacheSave(string $cacheKey, array $payload): void
{
    $path = releaseDateCachePath($cacheKey);
    @file_put_contents($path, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

function releaseDateStripPrefixes(string $name): string
{
    $name = trim($name);
    $name = preg_replace('/^★\s*/u', '', $name) ?? $name;
    $name = preg_replace('/^StatTrak™\s+/u', '', $name) ?? $name;
    $name = preg_replace('/^StatTrak\s+/iu', '', $name) ?? $name;
    $name = preg_replace('/^Souvenir\s+/iu', '', $name) ?? $name;
    return trim($name);
}

function releaseDateStripWear(string $name): string
{
    return trim((string)preg_replace(
        '/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/iu',
        '',
        $name
    ));
}

function releaseDateSlugify(string $name): string
{
    $value = releaseDateStripWear(releaseDateStripPrefixes($name));
    $value = str_replace(['|', '/', '\\', '_'], ' ', $value);
    $value = str_replace(['™', '★'], '', $value);
    $value = mb_strtolower($value, 'UTF-8');
    // Keep letters, numbers, spaces, hyphens; drop other punctuation (incl. parentheses).
    $value = preg_replace('/[^a-z0-9\s\-]+/u', '', $value) ?? $value;
    $value = preg_replace('/[\s\-]+/', '-', $value) ?? $value;
    return trim($value, '-');
}

function releaseDateSlugCandidates(string $marketHashName): array
{
    $raw = trim($marketHashName);
    $base = releaseDateStripWear(releaseDateStripPrefixes($raw));
    $candidates = [];
    foreach ([$base, $raw, releaseDateStripPrefixes($raw)] as $name) {
        $slug = releaseDateSlugify($name);
        if ($slug !== '') {
            $candidates[] = $slug;
        }
    }
    return array_values(array_unique($candidates));
}

function releaseDateParseCalendarLabel(string $raw): ?DateTimeImmutable
{
    $normalized = trim(preg_replace('/(\d{1,2})(st|nd|rd|th)/i', '$1', $raw) ?? $raw);
    $normalized = preg_replace('/,/', '', $normalized) ?? $normalized;
    $normalized = preg_replace('/\s+/', ' ', $normalized) ?? $normalized;
    $dt = DateTimeImmutable::createFromFormat('!F j Y', $normalized, new DateTimeZone('UTC'));
    if ($dt instanceof DateTimeImmutable) {
        return $dt;
    }
    $ts = strtotime($normalized . ' UTC');
    if ($ts === false) {
        return null;
    }
    return (new DateTimeImmutable('@' . $ts))->setTimezone(new DateTimeZone('UTC'));
}

function releaseDateFormatDisplay(?string $isoOrLabel): string
{
    $raw = trim((string)$isoOrLabel);
    if ($raw === '') {
        return '';
    }

    // Already human: "January 12th, 2017"
    if (preg_match('/^[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}$/', $raw)) {
        $dt = releaseDateParseCalendarLabel($raw);
        if ($dt instanceof DateTimeImmutable) {
            $day = (int)$dt->format('j');
            $suffix = 'th';
            if ($day % 100 < 11 || $day % 100 > 13) {
                $suffix = match ($day % 10) {
                    1 => 'st',
                    2 => 'nd',
                    3 => 'rd',
                    default => 'th',
                };
            }
            return $dt->format('F') . ' ' . $day . $suffix . ', ' . $dt->format('Y');
        }
        return preg_replace('/\s+/', ' ', str_replace(',', ', ', $raw)) ?? $raw;
    }

    $dt = releaseDateParseCalendarLabel($raw);
    if (!($dt instanceof DateTimeImmutable)) {
        $ts = strtotime($raw);
        if ($ts === false) {
            return $raw;
        }
        $dt = (new DateTimeImmutable('@' . $ts))->setTimezone(new DateTimeZone('UTC'));
    }

    $day = (int)$dt->format('j');
    $suffix = 'th';
    if ($day % 100 < 11 || $day % 100 > 13) {
        $suffix = match ($day % 10) {
            1 => 'st',
            2 => 'nd',
            3 => 'rd',
            default => 'th',
        };
    }

    return $dt->format('F') . ' ' . $day . $suffix . ', ' . $dt->format('Y');
}

function releaseDateParseFromHtml(string $html): ?array
{
    $decoded = html_entity_decode($html, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $plain = stripcslashes($decoded);

    $patterns = [
        // Summary field: Released ... January 12th, 2017
        '/Released\s*(?:<\/[^>]+>\s*<[^>]+>)*\s*([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/iu',
        // History blurb
        '/(?:first introduced|introduced to CS2|was first introduced)[^.]{0,80}?on\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/iu',
        // JSON fields
        '/"released_at"\s*:\s*"([^"]+)"/iu',
        '/"releasedAt"\s*:\s*"([^"]+)"/iu',
        '/"release_date"\s*:\s*"([^"]+)"/iu',
    ];

    foreach ([$html, $decoded, $plain] as $haystack) {
        foreach ($patterns as $pattern) {
            if (!preg_match($pattern, $haystack, $match)) {
                continue;
            }
            $raw = trim((string)($match[1] ?? ''));
            if ($raw === '') {
                continue;
            }
            $display = releaseDateFormatDisplay($raw);
            $iso = null;
            $dt = releaseDateParseCalendarLabel($raw);
            if ($dt instanceof DateTimeImmutable) {
                $iso = $dt->format('Y-m-d');
            }
            if ($display !== '') {
                return [
                    'released' => $iso,
                    'released_display' => $display,
                    'source' => 'csgoskins',
                ];
            }
        }
    }

    return null;
}

function releaseDateFetchHtml(string $slug): ?string
{
    $baseUrl = rtrim((string)(appConfig()['csgoskins']['base_url'] ?? 'https://csgoskins.gg'), '/');
    $url = $baseUrl . '/items/' . rawurlencode($slug);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 4,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        CURLOPT_HTTPHEADER => [
            'Accept: text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
            'Accept-Language: en-US,en;q=0.9',
        ],
    ]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($body === false || $status >= 400 || $body === '') {
        return null;
    }
    if (stripos((string)$body, 'too many requests') !== false) {
        return null;
    }
    return (string)$body;
}

function releaseDateFetchFromApi(string $marketHashName): ?array
{
    $apiKey = trim((string)(appConfig()['csgoskins']['api_key'] ?? ''));
    if ($apiKey === '') {
        $fromEnv = getenv('CSGOSKINS_API_KEY');
        $apiKey = is_string($fromEnv) ? trim($fromEnv) : '';
    }
    if ($apiKey === '') {
        return null;
    }

    $baseUrl = rtrim((string)(appConfig()['csgoskins']['base_url'] ?? 'https://csgoskins.gg'), '/');
    // Search first page filtered by exact market hash when possible; fallback: page 1 scan is too heavy.
    // Use advanced endpoint by name query if documented — otherwise skip.
    $url = $baseUrl . '/api/v1/basic-item-details?limit=1&search=' . rawurlencode($marketHashName);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 25,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $apiKey,
            'Accept: application/json',
        ],
    ]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($body === false || $status >= 400) {
        return null;
    }

    $payload = json_decode((string)$body, true);
    $rows = is_array($payload['data'] ?? null) ? $payload['data'] : [];
    $target = mb_strtolower(releaseDateStripWear(releaseDateStripPrefixes($marketHashName)), 'UTF-8');
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $name = trim((string)($row['market_hash_name'] ?? $row['name'] ?? ''));
        $nameKey = mb_strtolower(releaseDateStripWear(releaseDateStripPrefixes($name)), 'UTF-8');
        if ($nameKey !== $target && $nameKey !== '' && strpos($nameKey, $target) === false && strpos($target, $nameKey) === false) {
            continue;
        }
        $released = trim((string)($row['released_at'] ?? $row['released'] ?? $row['release_date'] ?? ''));
        if ($released === '') {
            continue;
        }
        return [
            'released' => preg_match('/^\d{4}-\d{2}-\d{2}/', $released) ? substr($released, 0, 10) : null,
            'released_display' => releaseDateFormatDisplay($released),
            'source' => 'csgoskins_api',
        ];
    }

    return null;
}

function releaseDateResolve(string $marketHashName): array
{
    $marketHashName = trim($marketHashName);
    $cacheKey = md5(mb_strtolower(releaseDateStripWear(releaseDateStripPrefixes($marketHashName)), 'UTF-8'));

    $cached = releaseDateCacheLoad($cacheKey, RELEASE_DATE_CACHE_TTL);
    if (is_array($cached) && !empty($cached['released_display'])) {
        return $cached;
    }
    $negative = releaseDateCacheLoad($cacheKey . '_miss', RELEASE_DATE_NEGATIVE_TTL);
    if (is_array($negative) && ($negative['miss'] ?? false)) {
        return [
            'market_hash_name' => $marketHashName,
            'released' => null,
            'released_display' => null,
            'source' => 'cache_miss',
        ];
    }

    $fromApi = releaseDateFetchFromApi($marketHashName);
    if ($fromApi !== null && !empty($fromApi['released_display'])) {
        $payload = array_merge([
            'market_hash_name' => $marketHashName,
            'slug' => releaseDateSlugify($marketHashName),
            'updated_at' => gmdate(DATE_ATOM),
        ], $fromApi);
        releaseDateCacheSave($cacheKey, $payload);
        return $payload;
    }

    foreach (releaseDateSlugCandidates($marketHashName) as $slug) {
        $html = releaseDateFetchHtml($slug);
        if ($html === null) {
            continue;
        }
        $parsed = releaseDateParseFromHtml($html);
        if ($parsed === null || empty($parsed['released_display'])) {
            continue;
        }
        $payload = array_merge([
            'market_hash_name' => $marketHashName,
            'slug' => $slug,
            'updated_at' => gmdate(DATE_ATOM),
        ], $parsed);
        releaseDateCacheSave($cacheKey, $payload);
        return $payload;
    }

    releaseDateCacheSave($cacheKey . '_miss', [
        'miss' => true,
        'market_hash_name' => $marketHashName,
        'updated_at' => gmdate(DATE_ATOM),
    ]);

    return [
        'market_hash_name' => $marketHashName,
        'released' => null,
        'released_display' => null,
        'source' => 'not_found',
    ];
}

try {
    $marketHashName = trim((string)($_GET['market_hash_name'] ?? $_GET['lookup_name'] ?? ''));
    if ($marketHashName === '') {
        throw new RuntimeException('market_hash_name is required.');
    }

    respondJson(releaseDateResolve($marketHashName));
} catch (Throwable $exception) {
    respondJson(['error' => $exception->getMessage()], 500);
}
