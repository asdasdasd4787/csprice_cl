<?php
/**
 * Browser-side error log.
 *
 * POST (JSON): { message, stack, url, page, extra } -> appended to
 * logs/client_errors.log so a crash that only happens in a visitor's browser
 * (different browser, extensions, device) can still be diagnosed.
 *
 * GET ?token=csprice-preflight&tail=50 -> last N lines as text/plain.
 */
declare(strict_types=1);

$logDir = __DIR__ . '/logs';
$logFile = $logDir . '/client_errors.log';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    if (($_GET['token'] ?? '') !== 'csprice-preflight') {
        http_response_code(404);
        exit;
    }
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    if (!is_file($logFile)) {
        echo "(no client errors logged yet)\n";
        exit;
    }
    $tail = max(1, min(500, (int)($_GET['tail'] ?? 50)));
    $lines = file($logFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    echo implode("\n", array_slice($lines, -$tail)), "\n";
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    exit;
}

$raw = (string)file_get_contents('php://input');
if (strlen($raw) > 64 * 1024) {
    $raw = substr($raw, 0, 64 * 1024);
}
$payload = json_decode($raw, true);
if (!is_array($payload)) {
    $payload = ['message' => 'invalid payload'];
}

$clean = static function ($value, int $limit): string {
    $text = trim((string)$value);
    $text = preg_replace('/[\r\n]+/', ' | ', $text) ?? $text;
    return mb_substr($text, 0, $limit);
};

$entry = [
    'time' => gmdate('Y-m-d H:i:s'),
    'page' => $clean($payload['page'] ?? '', 120),
    'url' => $clean($payload['url'] ?? ($_SERVER['HTTP_REFERER'] ?? ''), 400),
    'message' => $clean($payload['message'] ?? '', 600),
    'stack' => $clean($payload['stack'] ?? '', 2500),
    'extra' => $clean(is_string($payload['extra'] ?? null) ? $payload['extra'] : json_encode($payload['extra'] ?? null), 600),
    'ua' => $clean($_SERVER['HTTP_USER_AGENT'] ?? '', 300),
];

$line = json_encode($entry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

if (!is_dir($logDir)) {
    @mkdir($logDir, 0755, true);
}
$written = false;
if (is_dir($logDir) && is_writable($logDir)) {
    $written = @file_put_contents($logFile, $line . "\n", FILE_APPEND | LOCK_EX) !== false;
    @chmod($logFile, 0644);
}
if (!$written) {
    error_log('[client-error] ' . $line);
}

header('Content-Type: application/json');
header('Cache-Control: no-store');
echo json_encode(['success' => true, 'stored' => $written]);
