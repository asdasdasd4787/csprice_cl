<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/giphy_helpers.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$limit = min(48, max(1, (int)($_GET['limit'] ?? 24)));
$offset = max(0, (int)($_GET['offset'] ?? 0));

$result = giphyHttpGet('gifs/trending', [
    'limit' => $limit,
    'offset' => $offset,
]);

if (empty($result['ok'])) {
    http_response_code((int)($result['status'] ?? 500));
    echo json_encode([
        'success' => false,
        'error' => $result['error'] ?? 'Could not load trending GIFs.',
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$data = $result['data'] ?? [];
$gifs = giphyNormalizeList($data['data'] ?? []);

echo json_encode([
    'success' => true,
    'gifs' => $gifs,
    'pagination' => is_array($data['pagination'] ?? null) ? $data['pagination'] : null,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
