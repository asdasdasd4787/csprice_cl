<?php
declare(strict_types=1);

/**
 * Shared Giphy API helpers. Key stays server-side (config.local.php / env).
 */

function giphyApiKey(): string
{
    $cfg = appConfig();
    return trim((string)($cfg['giphy']['api_key'] ?? ''));
}

function giphyRating(): string
{
    $cfg = appConfig();
    $rating = strtolower(trim((string)($cfg['giphy']['rating'] ?? 'pg-13')));
    $allowed = ['g', 'pg', 'pg-13', 'r'];
    return in_array($rating, $allowed, true) ? $rating : 'pg-13';
}

/**
 * @return array{ok:bool, status?:int, error?:string, data?:array}
 */
function giphyHttpGet(string $path, array $query): array
{
    $apiKey = giphyApiKey();
    if ($apiKey === '') {
        return ['ok' => false, 'status' => 503, 'error' => 'Giphy is not configured.'];
    }

    $query['api_key'] = $apiKey;
    if (!isset($query['rating'])) {
        $query['rating'] = giphyRating();
    }

    $url = 'https://api.giphy.com/v1/' . ltrim($path, '/') . '?' . http_build_query($query);
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'status' => 500, 'error' => 'cURL is required for Giphy.'];
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($body === false || $body === '') {
        return ['ok' => false, 'status' => 500, 'error' => $err !== '' ? $err : 'Giphy request failed.'];
    }

    $decoded = json_decode($body, true);
    if (!is_array($decoded)) {
        return ['ok' => false, 'status' => 500, 'error' => 'Invalid Giphy response.'];
    }

    if ($status < 200 || $status >= 300) {
        $msg = trim((string)($decoded['meta']['msg'] ?? 'Giphy request failed.'));
        // Never relay a 502: the csprice.eu front proxy drops those responses.
        return ['ok' => false, 'status' => ($status >= 400 && $status !== 502) ? $status : 500, 'error' => $msg !== '' ? $msg : 'Giphy request failed.'];
    }

    return ['ok' => true, 'status' => $status, 'data' => $decoded];
}

function giphyPickImageUrl(array $images, string ...$keys): string
{
    foreach ($keys as $key) {
        $url = trim((string)($images[$key]['url'] ?? ''));
        if ($url !== '' && preg_match('#^https://#i', $url)) {
            return $url;
        }
    }
    return '';
}

/**
 * Normalize a Giphy gif object into a compact client payload.
 *
 * @return array{id:string,title:string,preview:string,url:string,width:int,height:int}|null
 */
function giphyNormalizeGif(mixed $row): ?array
{
    if (!is_array($row)) {
        return null;
    }
    $id = trim((string)($row['id'] ?? ''));
    if ($id === '') {
        return null;
    }
    $images = is_array($row['images'] ?? null) ? $row['images'] : [];
    $url = giphyPickImageUrl(
        $images,
        'fixed_height',
        'downsized',
        'downsized_medium',
        'original'
    );
    $preview = giphyPickImageUrl(
        $images,
        'fixed_height_small',
        'preview_gif',
        'fixed_width_small',
        'fixed_height',
        'downsized_small'
    );
    if ($url === '') {
        return null;
    }
    if ($preview === '') {
        $preview = $url;
    }
    $fixed = is_array($images['fixed_height'] ?? null) ? $images['fixed_height'] : [];
    return [
        'id' => $id,
        'title' => trim((string)($row['title'] ?? '')),
        'preview' => $preview,
        'url' => $url,
        'width' => max(0, (int)($fixed['width'] ?? 0)),
        'height' => max(0, (int)($fixed['height'] ?? 0)),
    ];
}

/**
 * @return list<array{id:string,title:string,preview:string,url:string,width:int,height:int}>
 */
function giphyNormalizeList(mixed $data): array
{
    if (!is_array($data)) {
        return [];
    }
    $out = [];
    foreach ($data as $row) {
        $gif = giphyNormalizeGif($row);
        if ($gif !== null) {
            $out[] = $gif;
        }
    }
    return $out;
}

function giphyIsAllowedMediaUrl(string $url): bool
{
    $url = trim($url);
    if ($url === '' || strlen($url) > 2048) {
        return false;
    }
    $parts = parse_url($url);
    if (!is_array($parts)) {
        return false;
    }
    if (strtolower((string)($parts['scheme'] ?? '')) !== 'https') {
        return false;
    }
    $host = strtolower((string)($parts['host'] ?? ''));
    if ($host === 'i.giphy.com' || $host === 'media.giphy.com') {
        return true;
    }
    // media0.giphy.com … mediaN.giphy.com
    return (bool)preg_match('#^media\d+\.giphy\.com$#', $host);
}
