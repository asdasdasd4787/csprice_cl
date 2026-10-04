<?php
declare(strict_types=1);

/**
 * Serves an uploaded profile picture from the shared accounts database
 * (users.avatar_b64), so csprice.eu and tf2price.eu show the same one.
 *   avatar.php?u=<user id>&v=<picture hash>   (v only busts caches)
 */

require __DIR__ . '/app_bootstrap.php';

$userId = (int)($_GET['u'] ?? 0);
if ($userId <= 0) {
    http_response_code(404);
    exit;
}

try {
    $pdo = dbPdoConnection('accounts_db', 'db');
    if (!dbColumnExists($pdo, 'users', 'avatar_b64')) {
        http_response_code(404);
        exit;
    }
    $stmt = $pdo->prepare('SELECT avatar_b64 FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $encoded = (string)($stmt->fetchColumn() ?: '');
} catch (Throwable $exception) {
    http_response_code(503);
    exit;
}

$png = $encoded !== '' ? base64_decode($encoded, true) : false;
if (!is_string($png) || $png === '') {
    http_response_code(404);
    exit;
}

$etag = '"' . substr(sha1($png), 0, 16) . '"';
header('Content-Type: image/png');
header('Cache-Control: public, max-age=31536000, immutable');
header('ETag: ' . $etag);
if (trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
    http_response_code(304);
    exit;
}
header('Content-Length: ' . strlen($png));
echo $png;
