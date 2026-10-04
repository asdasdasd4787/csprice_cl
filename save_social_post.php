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

    if (socialRateLimitBlocked($session['steam_id'], 'publish', 10, 600)) {
        http_response_code(429);
        echo json_encode(['success' => false, 'error' => 'Too many posts. Please wait a few minutes and try again.']);
        exit;
    }

    $body = socialRequestPayload();
    $itemId = socialResolveItemId($body);
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

    $upload = ['ok' => true];
    if (isset($_FILES['image']) && is_array($_FILES['image'])) {
        $upload = socialAcceptUploadedImage($_FILES['image']);
        if (empty($upload['ok'])) {
            echo json_encode(['success' => false, 'error' => $upload['error'] ?? 'Could not upload that image.']);
            exit;
        }
    } elseif (!empty($body['giphy_url'])) {
        $upload = socialAcceptGiphyUrl((string)$body['giphy_url']);
        if (empty($upload['ok'])) {
            echo json_encode(['success' => false, 'error' => $upload['error'] ?? 'Could not attach that GIF.']);
            exit;
        }
    }

    $storedPath = isset($upload['path']) ? (string)$upload['path'] : null;
    $storedUrl = isset($upload['public_url']) ? socialSanitizeImageUrl($upload['public_url']) : null;
    $storedMime = isset($upload['mime']) ? (string)$upload['mime'] : null;

    try {
        $moderation = socialModerateContent($postBody, $storedPath, $storedMime);
    } catch (Throwable $moderationError) {
        error_log('[save_social_post] moderation threw: ' . $moderationError->getMessage());
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

    $pdo = marketHistoryPdoConnection();
    ensureSocialTable($pdo);

    $hasImageCol = dbColumnExists($pdo, 'item_social_posts', 'image_url');
    $imageUrl = $hasImageCol ? $storedUrl : null;

    $columns = ['item_id', 'steam_id', 'author', 'avatar_url', 'sentiment', 'target_price', 'body'];
    $params = [
        ':item_id'      => $itemId,
        ':steam_id'     => $session['steam_id'],
        ':author'       => mb_substr($session['author'], 0, 128),
        ':avatar_url'   => mb_substr($session['avatar_url'], 0, 512),
        ':sentiment'    => $sentiment,
        ':target_price' => $targetPrice,
        ':body'         => mb_substr($postBody, 0, 1000),
    ];
    if ($hasImageCol) {
        $columns[] = 'image_url';
        $params[':image_url'] = $imageUrl;
    }

    $stmt = socialPrepareInsert($pdo, 'item_social_posts', $columns);
    $stmt->execute($params);
    $inserted = socialFetchInsertResult($pdo, $stmt);
    $newId = $inserted['id'];
    $createdAt = $inserted['created_at'];

    echo json_encode([
        'success' => true,
        'post' => [
            'id'           => $newId,
            'item_id'      => $itemId,
            'steam_id'     => $session['steam_id'],
            'author'       => $session['author'],
            'avatar_url'   => $session['avatar_url'],
            'sentiment'    => $sentiment,
            'target_price' => $targetPrice,
            'body'         => $postBody,
            'image_url'    => $imageUrl,
            'likes'        => 0,
            'dislikes'     => 0,
            'created_at'   => $createdAt,
            'comments'     => [],
        ],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    error_log('[save_social_post] ' . $e->getMessage());
    echo json_encode(['success' => false, 'error' => 'Could not publish this post. Please try again.']);
}
