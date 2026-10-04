<?php
/**
 * Serves the item catalog compressed and cacheable.
 *
 * The hosting's web server hands assets/steam-market-cache/roi_catalog.json
 * (28 MB) to browsers uncompressed and with a 30-second cache, so every
 * catalog / market / deals visit on a cold cache downloaded 28 MB. This
 * endpoint streams the pre-gzipped copy built by scripts/build_catalog_gz.php
 * (~4 MB) with long cache headers; the ?v= tag in the URL busts it.
 */
declare(strict_types=1);

$json = __DIR__ . '/assets/steam-market-cache/roi_catalog.json';
$gz = $json . '.gz';
if (!is_file($json)) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo '{"success":false,"error":"catalog missing"}';
    exit;
}

$acceptsGzip = str_contains(strtolower((string)($_SERVER['HTTP_ACCEPT_ENCODING'] ?? '')), 'gzip');
$useGz = $acceptsGzip && is_file($gz) && filemtime($gz) >= filemtime($json);
$path = $useGz ? $gz : $json;
$etag = '"' . md5((string)filemtime($path) . filesize($path) . ($useGz ? 'gz' : 'raw')) . '"';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=21600');
header('Vary: Accept-Encoding');
header('ETag: ' . $etag);
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', filemtime($json)) . ' GMT');
header('X-Content-Type-Options: nosniff');

if (trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
    http_response_code(304);
    exit;
}

if ($useGz) {
    header('Content-Encoding: gzip');
}
header('Content-Length: ' . filesize($path));
// Never let PHP's own output compression double-encode the stream.
if (function_exists('ini_set')) {
    @ini_set('zlib.output_compression', '0');
}
readfile($path);
