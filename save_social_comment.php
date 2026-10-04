<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/steam_auth_helpers.php';
require_once __DIR__ . '/social_helpers.php';
require_once __DIR__ . '/social_moderation.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

try {
    $session = socialRequireSteamSession();

    if (socialRateLimitBlocked($session['steam_id'], 'comment', 20, 600)) {
        http_response_code(429);
        echo json_encode(['success' => false, 'error' => 'Too many comments. Please wait a few minutes and try again.']);
        exit;
    }

    $body = socialRequestPayload();
    $action = trim((string)($body['action'] ?? 'create'));
    $postId = max(1, (int)($body['post_id'] ?? 0));
    $commentId = max(0, (int)($body['comment_id'] ?? 0));

    $pdo = marketHistoryPdoConnection();
    ensureSocialTable($pdo);

    if ($action === 'delete') {
        if ($commentId < 1) {
            echo json_encode(['success' => false, 'error' => 'Comment not found or you do not have permission.']);
            exit;
        }
        $driver = pdoDriverName($pdo);
        if ($driver === 'sqlsrv') {
            $stmt = $pdo->prepare(
                "SELECT TOP 1 * FROM item_social_comments WHERE id = :id AND steam_id = :steam_id"
            );
        } else {
            $stmt = $pdo->prepare(
                "SELECT * FROM item_social_comments WHERE id = :id AND steam_id = :steam_id LIMIT 1"
            );
        }
        $stmt->execute([':id' => $commentId, ':steam_id' => $session['steam_id']]);
        $owned = $stmt->fetch();
        if (!is_array($owned)) {
            echo json_encode(['success' => false, 'error' => 'Comment not found or you do not have permission.']);
            exit;
        }
        socialDeleteStoredImage($owned['image_url'] ?? null);
        $pdo->prepare("DELETE FROM item_social_comments WHERE id = :id AND steam_id = :steam_id")
            ->execute([':id' => $commentId, ':steam_id' => $session['steam_id']]);
        echo json_encode(['success' => true, 'comment_id' => $commentId, 'post_id' => (int)($owned['post_id'] ?? 0)]);
        exit;
    }

    $commentBody = trim((string)($body['body'] ?? ''));
    if ($commentBody === '') {
        echo json_encode(['success' => false, 'error' => 'Comment cannot be empty.']);
        exit;
    }
    if (mb_strlen($commentBody) > 1000) {
        echo json_encode(['success' => false, 'error' => 'Comment is too long (max 1000 characters).']);
        exit;
    }

    $driver = pdoDriverName($pdo);
    if ($driver === 'sqlsrv') {
        $postStmt = $pdo->prepare("SELECT TOP 1 id, item_id FROM item_social_posts WHERE id = :id");
    } else {
        $postStmt = $pdo->prepare("SELECT id, item_id FROM item_social_posts WHERE id = :id LIMIT 1");
    }
    $postStmt->execute([':id' => $postId]);
    $post = $postStmt->fetch();
    if (!is_array($post)) {
        echo json_encode(['success' => false, 'error' => 'Post not found.']);
        exit;
    }

    $upload = ['ok' => true];
    if (isset($_FILES['image']) && is_array($_FILES['image'])) {
        $upload = socialAcceptUploadedImage($_FILES['image']);
        if (empty($upload['ok'])) {
            echo json_encode(['success' => false, 'error' => $upload['error'] ?? 'Could not upload that image.']);
            exit;
        }
    }

    $storedPath = isset($upload['path']) ? (string)$upload['path'] : null;
    $storedUrl = isset($upload['public_url']) ? socialSanitizeImageUrl($upload['public_url']) : null;
    $storedMime = isset($upload['mime']) ? (string)$upload['mime'] : null;

    try {
        $moderation = socialModerateContent($commentBody, $storedPath, $storedMime);
    } catch (Throwable $moderationError) {
        error_log('[save_social_comment] moderation threw: ' . $moderationError->getMessage());
        $moderation = [
            'allowed' => true,
            'csam' => false,
            'source' => 'moderation_exception',
            'reason' => 'allow',
        ];
    }
    if (empty($moderation['allowed'])) {
        if ($storedPath) {
            @unlink($storedPath);
        }
        echo json_encode([
            'success' => false,
            'error' => socialClientErrorForModeration($moderation),
            'blocked' => true,
        ]);
        exit;
    }

    if ($session['avatar_url'] === '') {
        $session['avatar_url'] = socialAvatarUrl($session['author']);
    }

    $itemId = (int)($post['item_id'] ?? 0);
    $hasImageCol = dbColumnExists($pdo, 'item_social_comments', 'image_url');

    $columns = ['post_id', 'item_id', 'steam_id', 'author', 'avatar_url', 'body'];
    $params = [
        ':post_id'    => $postId,
        ':item_id'    => $itemId,
        ':steam_id'   => $session['steam_id'],
        ':author'     => mb_substr($session['author'], 0, 128),
        ':avatar_url' => mb_substr($session['avatar_url'], 0, 512),
        ':body'       => mb_substr($commentBody, 0, 1000),
    ];
    if ($hasImageCol) {
        $columns[] = 'image_url';
        $params[':image_url'] = $storedUrl;
    }

    $stmt = socialPrepareInsert($pdo, 'item_social_comments', $columns);
    $stmt->execute($params);
    $inserted = socialFetchInsertResult($pdo, $stmt);
    $newId = $inserted['id'];
    $createdAt = $inserted['created_at'];

    echo json_encode([
        'success' => true,
        'comment' => [
            'id'         => $newId,
            'post_id'    => $postId,
            'item_id'    => $itemId,
            'steam_id'   => $session['steam_id'],
            'author'     => $session['author'],
            'avatar_url' => $session['avatar_url'],
            'body'       => $commentBody,
            'image_url'  => $storedUrl,
            'created_at' => $createdAt,
        ],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    error_log('[save_social_comment] ' . $e->getMessage());
    echo json_encode(['success' => false, 'error' => 'Could not publish this comment. Please try again.']);
}
