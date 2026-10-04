<?php
/**
 * Compressed, long-cached delivery for the site's own JavaScript.
 *
 * The host serves react/*.js as-is: no gzip (index.css comes back gzipped,
 * the bundles do not) and Cache-Control: max-age=30, so every visit pulls
 * ~2 MB of uncompressed script and every page after 30 s revalidates it.
 * .htaccess is inert on csprice.eu, so the only place that can fix headers
 * is PHP. Pages reference the files as
 *
 *     static.php/react/item-page.build.js?v=20260926-oled-home-4
 *
 * and this script streams the same bytes, gzipped, with an ETag and a
 * one-year immutable lifetime (the ?v= stamp already changes on every
 * rebuild, which is what makes "immutable" safe). Gzipped copies live under
 * assets/static-gz/, keyed by the file's mtime and size, so a rebuilt bundle
 * gets a fresh copy on its first request and the old one is removed.
 *
 * Only react/*.js is served; nothing else on disk is reachable through here.
 */
declare(strict_types=1);

const STATIC_GZ_DIR = __DIR__ . '/assets/static-gz';

function staticRequestedPath(): string
{
    $path = (string)($_SERVER['PATH_INFO'] ?? '');
    if ($path === '') {
        // Some FastCGI setups leave PATH_INFO empty; the URI still carries it.
        $uri = (string)($_SERVER['REQUEST_URI'] ?? '');
        if (preg_match('~/static\.php(/[^?]*)~', $uri, $m)) {
            $path = rawurldecode($m[1]);
        }
    }
    return $path;
}

function staticFail(int $code): never
{
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo $code === 404 ? 'Not found' : 'Bad request';
    exit;
}

$path = staticRequestedPath();
if (!preg_match('~^/react/([A-Za-z0-9._-]+\.js)$~', $path, $m)) {
    staticFail(404);
}
$name = $m[1];
if (str_contains($name, '..')) {
    staticFail(400);
}
$file = __DIR__ . '/react/' . $name;
$real = realpath($file);
if ($real === false || !is_file($real) || !str_starts_with($real, realpath(__DIR__ . '/react') . DIRECTORY_SEPARATOR)) {
    staticFail(404);
}

$mtime = (int)filemtime($real);
$size = (int)filesize($real);
$etag = '"' . md5($name . '|' . $mtime . '|' . $size) . '"';
$versioned = trim((string)($_GET['v'] ?? '')) !== '';

header('Content-Type: application/javascript; charset=utf-8');
header('ETag: ' . $etag);
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mtime) . ' GMT');
header('Vary: Accept-Encoding');
header('X-Content-Type-Options: nosniff');
// A stamped URL never changes content, so the browser may keep it for a year
// without asking. An unstamped one is a developer convenience: short lifetime.
header('Cache-Control: ' . ($versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300'));

$ifNoneMatch = trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? ''));
if ($ifNoneMatch !== '' && str_contains($ifNoneMatch, $etag)) {
    http_response_code(304);
    exit;
}

$acceptsGzip = str_contains((string)($_SERVER['HTTP_ACCEPT_ENCODING'] ?? ''), 'gzip');
if ($acceptsGzip && function_exists('gzencode')) {
    $stem = preg_replace('/[^A-Za-z0-9._-]/', '_', $name);
    $gzFile = STATIC_GZ_DIR . '/' . $stem . '.' . $mtime . '-' . $size . '.gz';
    if (!is_file($gzFile)) {
        if (!is_dir(STATIC_GZ_DIR)) {
            @mkdir(STATIC_GZ_DIR, 0755, true);
        }
        $raw = (string)file_get_contents($real);
        $gz = gzencode($raw, 9);
        if ($gz !== false) {
            $tmp = $gzFile . '.' . getmypid() . '.tmp';
            if (@file_put_contents($tmp, $gz, LOCK_EX) !== false && @rename($tmp, $gzFile)) {
                @chmod($gzFile, 0644);
                // Older copies of this bundle are dead weight once a new one exists.
                foreach (glob(STATIC_GZ_DIR . '/' . $stem . '.*.gz') ?: [] as $old) {
                    if ($old !== $gzFile) {
                        @unlink($old);
                    }
                }
            } else {
                @unlink($tmp);
            }
        }
        if ($gz !== false) {
            header('Content-Encoding: gzip');
            header('Content-Length: ' . strlen($gz));
            echo $gz;
            exit;
        }
        // gzencode failed: fall through to the plain file.
    } else {
        header('Content-Encoding: gzip');
        header('Content-Length: ' . (string)filesize($gzFile));
        readfile($gzFile);
        exit;
    }
}

header('Content-Length: ' . $size);
readfile($real);
