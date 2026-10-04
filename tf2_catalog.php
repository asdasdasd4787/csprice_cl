<?php
/**
 * Serves the TF2 catalog (assets/data/tf2/catalog.json, built by
 * scripts/tf2_import.php) gzipped. ~173k items: 18 MB as JSON, ~1.4 MB
 * gzipped. Short cache: the Steam pass keeps refreshing the file for hours.
 */
declare(strict_types=1);

$json = __DIR__ . '/assets/data/tf2/catalog.json';
$gz = $json . '.gz';
if (!is_file($json)) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo '{"success":false,"error":"TF2 catalog missing"}';
    exit;
}

$acceptsGzip = str_contains(strtolower((string)($_SERVER['HTTP_ACCEPT_ENCODING'] ?? '')), 'gzip');
$useGz = $acceptsGzip && is_file($gz) && filemtime($gz) >= filemtime($json) - 5;
$path = $useGz ? $gz : $json;
$etag = '"' . md5((string)filemtime($path) . filesize($path) . ($useGz ? 'gz' : 'raw')) . '"';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=1800');
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
if (function_exists('ini_set')) {
    @ini_set('zlib.output_compression', '0');
}
readfile($path);
