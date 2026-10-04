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

function fetchOwnedPost(PDO $pdo, int $postId, string $steamId): ?array
{
    $driver = pdoDriverName($pdo);
    if ($driver === 'sqlsrv') {
        $stmt = $pdo->prepare(
            "SELECT TOP 1 * FROM item_social_posts WHERE id = :id AND steam_id = :steam_id"
        );
    } else {
        $stmt = $pdo->prepare(
            "SELECT * FROM item_social_posts WHERE id = :id AND steam_id = :steam_id LIMIT 1"
        );
    }
    $stmt->execute([':id' => $postId, ':steam_id' => $steamId]);
    $row = $stmt->fetch();
    return is_array($row) ? $row : null;
}

try {
    $session = socialRequireSteamSession();

    $body = socialRequestPayload();
    $action = trim((string)($body['action'] ?? ''));
    $postId = max(1, (int)($body['post_id'] ?? 0));

    if (!in_array($action, ['delete', 'update'], true)) {
        echo json_encode(['success' => false, 'error' => 'Invalid action.']);
        exit;
    }

    $pdo = marketHistoryPdoConnection();
    ensureSocialTable($pdo);
    $owned = fetchOwnedPost($pdo, $postId, $session['steam_id']);
    if (!$owned) {
        echo json_encode(['success' => false, 'error' => 'Post not found or you do not have permission.']);
        exit;
    }

    if ($action === 'delete') {
        if (socialCommentsTableExists($pdo)) {
            $delComments = $pdo->prepare("SELECT image_url FROM item_social_comments WHERE post_id = :post_id");
            $delComments->execute([':post_id' => $postId]);
            foreach ($delComments->fetchAll() as $commentRow) {
                socialDeleteStoredImage($commentRow['image_url'] ?? null);
            }
            $pdo->prepare("DELETE FROM item_social_comments WHERE post_id = :post_id")->execute([':post_id' => $postId]);
        }
        socialDeleteStoredImage($owned['image_url'] ?? null);
        $stmt = $pdo->prepare("DELETE FROM item_social_posts WHERE id = :id AND steam_id = :steam_id");
        $stmt->execute([':id' => $postId, ':steam_id' => $session['steam_id']]);
        echo json_encode(['success' => true, 'post_id' => $postId]);
        exit;
    }

    if (socialRateLimitBlocked($session['steam_id'], 'edit', 20, 600)) {
        http_response_code(429);
        echo json_encode(['success' => false, 'error' => 'Too many edits. Please wait a few minutes and try again.']);
        exit;
    }

    $postBody = trim((string)($body['body'] ?? ''));
    $sentiment = isset($body['sentiment']) && in_array($body['sentiment'], ['bullish', 'bearish'], true)
        ? $body['sentiment']
        : null;
    $targetPrice = isset($body['target_price']) && is_numeric($body['target_price'])
        ? round((float)$body['target_price'], 2)
        : null;

    if ($postBody === '') {
        echo json_encode(['success' => false, 'error' => 'Post body cannot be empty.']);
        exit;
    }

    if (mb_strlen($postBody) > 1000) {
        echo json_encode(['success' => false, 'error' => 'Post is too long (max 1000 characters).']);
        exit;
    }

    $existingImage = socialSanitizeImageUrl($owned['image_url'] ?? null);
    $storedPath = null;
    $storedMime = null;
    $nextImage = $existingImage;

    if (isset($_FILES['image']) && is_array($_FILES['image']) && (int)($_FILES['image']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
        $upload = socialAcceptUploadedImage($_FILES['image']);
        if (empty($upload['ok'])) {
            echo json_encode(['success' => false, 'error' => $upload['error'] ?? 'Could not upload that image.']);
            exit;
        }
        $storedPath = isset($upload['path']) ? (string)$upload['path'] : null;
        $storedMime = isset($upload['mime']) ? (string)$upload['mime'] : null;
        $nextImage = isset($upload['public_url']) ? socialSanitizeImageUrl($upload['public_url']) : $existingImage;
    }

    try {
        $moderation = socialModerateContent($postBody, $storedPath, $storedMime);
    } catch (Throwable $moderationError) {
        error_log('[manage_social_post] moderation threw: ' . $moderationError->getMessage());
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

    $hasImageCol = dbColumnExists($pdo, 'item_social_posts', 'image_url');
    if ($hasImageCol) {
        $stmt = $pdo->prepare(
            "UPDATE item_social_posts
             SET body = :body, sentiment = :sentiment, target_price = :target_price, image_url = :image_url
             WHERE id = :id AND steam_id = :steam_id"
        );
        $stmt->execute([
            ':body'         => mb_substr($postBody, 0, 1000),
            ':sentiment'    => $sentiment,
            ':target_price' => $targetPrice,
            ':image_url'    => $nextImage,
            ':id'           => $postId,
            ':steam_id'     => $session['steam_id'],
        ]);
    } else {
        $stmt = $pdo->prepare(
            "UPDATE item_social_posts
             SET body = :body, sentiment = :sentiment, target_price = :target_price
             WHERE id = :id AND steam_id = :steam_id"
        );
        $stmt->execute([
            ':body'         => mb_substr($postBody, 0, 1000),
            ':sentiment'    => $sentiment,
            ':target_price' => $targetPrice,
            ':id'           => $postId,
            ':steam_id'     => $session['steam_id'],
        ]);
    }

    if ($storedPath && $existingImage && $nextImage !== $existingImage) {
        socialDeleteStoredImage($existingImage);
    }

    $updated = fetchOwnedPost($pdo, $postId, $session['steam_id']);
    $formatted = $updated ? formatSocialPostRow($updated) : null;
    if ($formatted) {
        $commentsByPost = socialFetchCommentsForPosts($pdo, [$postId]);
        $formatted['comments'] = $commentsByPost[$postId] ?? [];
    }

    echo json_encode([
        'success' => true,
        'post' => $formatted,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    error_log('[manage_social_post] ' . $e->getMessage());
    echo json_encode(['success' => false, 'error' => 'Could not update this post. Please try again.']);
}
