<?php
declare(strict_types=1);

$rawUrl = trim((string)($_GET['url'] ?? ''));
if ($rawUrl === '' || !filter_var($rawUrl, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Bad request';
    exit;
}

$parts = parse_url($rawUrl);
$scheme = strtolower((string)($parts['scheme'] ?? ''));
$host = strtolower((string)($parts['host'] ?? ''));

$allowedHosts = [
    'community.steamstatic.com',
    'community.akamai.steamstatic.com',
    'steamcommunity-a.akamaihd.net',
    'cdn.steamstatic.com',
    'steamcdn-a.akamaihd.net',
    'csroi.com',
    'cdn.csroi.com',
];

if ($scheme !== 'https' || !in_array($host, $allowedHosts, true)) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Forbidden';
    exit;
}

$cacheDir = __DIR__ . '/assets/steam-market-cache/craft-proxy';
$cacheKey = sha1($rawUrl);
$cachePath = $cacheDir . '/' . $cacheKey . '.bin';
$metaPath = $cacheDir . '/' . $cacheKey . '.json';

if (is_file($cachePath) && is_file($metaPath)) {
    $meta = json_decode((string)file_get_contents($metaPath), true);
    $contentType = trim((string)($meta['content_type'] ?? 'image/png'));
    header('Content-Type: ' . ($contentType !== '' ? $contentType : 'image/png'));
    header('Cache-Control: public, max-age=86400');
    header('Access-Control-Allow-Origin: *');
    readfile($cachePath);
    exit;
}

if (!function_exists('curl_init')) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'cURL unavailable';
    exit;
}

$curl = curl_init($rawUrl);
curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT => 20,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0 Safari/537.36',
    CURLOPT_HTTPHEADER => [
        'Accept: image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    ],
]);

$body = curl_exec($curl);
$status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$contentType = trim(explode(';', (string)curl_getinfo($curl, CURLINFO_CONTENT_TYPE))[0]);
curl_close($curl);

if ($body === false || $status >= 400 || $body === '') {
    // 500 rather than 502: the csprice.eu front proxy drops 502 responses.
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Image fetch failed';
    exit;
}

if ($contentType === '' || !str_starts_with($contentType, 'image/')) {
    $contentType = 'image/png';
}

if (!is_dir($cacheDir) && !mkdir($cacheDir, 0777, true) && !is_dir($cacheDir)) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Cache unavailable';
    exit;
}

file_put_contents($cachePath, $body);
file_put_contents($metaPath, json_encode(['content_type' => $contentType], JSON_UNESCAPED_SLASHES));

header('Content-Type: ' . $contentType);
header('Cache-Control: public, max-age=86400');
header('Access-Control-Allow-Origin: *');
echo $body;
