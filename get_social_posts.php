<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/social_helpers.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache');

function socialTableExists(PDO $pdo): bool
{
    try {
        return dbTableExists($pdo, 'item_social_posts');
    } catch (Throwable) {
        try {
            $driver = pdoDriverName($pdo);
            if ($driver === 'sqlsrv') {
                $stmt = $pdo->query("SELECT TOP 1 1 FROM item_social_posts");
            } else {
                $stmt = $pdo->query("SELECT 1 FROM item_social_posts LIMIT 1");
            }
            return $stmt !== false;
        } catch (Throwable) {
            return false;
        }
    }
}

try {
    $itemId = socialResolveItemId([
        'item_id' => $_GET['item_id'] ?? 1,
        'item_name' => $_GET['item_name'] ?? '',
    ]);
    $limit = min(50, max(1, (int)($_GET['limit'] ?? 20)));
    $offset = max(0, (int)($_GET['offset'] ?? 0));

    $pdo = null;
    $rows = [];

    try {
        $pdo = marketHistoryPdoConnection();
    } catch (Throwable) {
    }

    if ($pdo) {
        try {
            ensureSocialTable($pdo);
        } catch (Throwable) {
        }
    }

    if ($pdo && socialTableExists($pdo)) {
        $driver = pdoDriverName($pdo);
        if ($driver === 'sqlsrv') {
            $stmt = $pdo->prepare(
                "SELECT * FROM item_social_posts
                 WHERE item_id = :item_id
                 ORDER BY created_at DESC
                 OFFSET :offset ROWS FETCH NEXT :lim ROWS ONLY"
            );
        } else {
            $stmt = $pdo->prepare(
                "SELECT * FROM item_social_posts
                 WHERE item_id = :item_id
                 ORDER BY created_at DESC
                 LIMIT :lim OFFSET :offset"
            );
        }
        $stmt->bindValue(':item_id', $itemId, PDO::PARAM_INT);
        $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $dbRows = $stmt->fetchAll();

        $postIds = [];
        foreach ($dbRows as $row) {
            $postIds[] = (int)($row['id'] ?? 0);
        }
        $commentsByPost = socialFetchCommentsForPosts($pdo, $postIds);

        foreach ($dbRows as $row) {
            $formatted = formatSocialPostRow($row);
            $formatted['comments'] = $commentsByPost[$formatted['id']] ?? [];
            $rows[] = $formatted;
        }
    }

    echo json_encode([
        'success' => true,
        'item_id' => $itemId,
        'posts'   => $rows,
        'total'   => count($rows),
        'has_db'  => $pdo !== null && socialTableExists($pdo),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    $itemId = socialResolveItemId([
        'item_id' => $_GET['item_id'] ?? 1,
        'item_name' => $_GET['item_name'] ?? '',
    ]);
    echo json_encode([
        'success' => true,
        'item_id' => $itemId,
        'posts'   => [],
        'total'   => 0,
        'has_db'  => false,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
