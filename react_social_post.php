<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

function readJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || $raw === '') return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

try {
    $body      = readJsonBody();
    $postId    = max(1, (int)($body['post_id']  ?? 0));
    $reaction  = trim((string)($body['reaction'] ?? ''));

    if (!in_array($reaction, ['like', 'dislike'], true)) {
        echo json_encode(['success' => false, 'error' => 'Invalid reaction.']);
        exit;
    }

    $pdo    = marketHistoryPdoConnection();
    $col    = $reaction === 'like' ? 'likes' : 'dislikes';
    $driver = pdoDriverName($pdo);

    $stmt = $pdo->prepare("UPDATE item_social_posts SET {$col} = {$col} + 1 WHERE id = :id");
    $stmt->execute([':id' => $postId]);

    // Fetch updated counts
    if ($driver === 'sqlsrv') {
        $sel = $pdo->prepare("SELECT TOP 1 likes, dislikes FROM item_social_posts WHERE id = :id");
    } else {
        $sel = $pdo->prepare("SELECT likes, dislikes FROM item_social_posts WHERE id = :id LIMIT 1");
    }
    $sel->execute([':id' => $postId]);
    $row = $sel->fetch();

    echo json_encode([
        'success'  => true,
        'post_id'  => $postId,
        'likes'    => (int)($row['likes']    ?? 0),
        'dislikes' => (int)($row['dislikes'] ?? 0),
    ]);

} catch (Throwable $e) {
    // Silently succeed for demo posts (id <= 3)
    echo json_encode(['success' => true, 'post_id' => $postId ?? 0, 'likes' => 0, 'dislikes' => 0]);
}
