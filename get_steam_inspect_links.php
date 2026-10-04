<?php
declare(strict_types=1);

require_once __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/inspect_link_helpers.php';
require_once __DIR__ . '/lib/craft_econ_lookup.php';

function loadTrackedItemName(mysqli $connection, int $itemId): string
{
    $statement = $connection->prepare('SELECT name FROM items WHERE id = ? LIMIT 1');
    $statement->bind_param('i', $itemId);
    $statement->execute();
    $row = $statement->get_result()->fetch_assoc();

    if (!isset($row['name'])) {
        throw new RuntimeException('Tracked item was not found.');
    }

    return trim((string)$row['name']);
}

try {
    $marketHashName = trim((string)($_GET['market_hash_name'] ?? ''));
    $baseNameParam = trim((string)($_GET['base_name'] ?? ''));
    $itemId = isset($_GET['item_id']) ? (int)$_GET['item_id'] : 0;

    $baseItemName = $baseNameParam;
    if ($baseItemName === '' && $marketHashName !== '') {
        [$baseItemName] = splitSteamWear($marketHashName);
    }

    if ($baseItemName === '' && $itemId > 0) {
        $connection = dbConnection();
        [$baseItemName] = splitSteamWear(loadTrackedItemName($connection, $itemId));
    }

    if ($baseItemName === '') {
        throw new RuntimeException('Provide base_name, market_hash_name, or item_id.');
    }

    $cacheKey = 'base_' . md5(strtolower($baseItemName));
    $cached = loadInspectLinkCache($cacheKey);
    if (is_array($cached['links'] ?? null) && $cached['links']) {
        respondJson($cached);
    }

    $links = resolveInspectLinksForBaseName($baseItemName);
    $payload = [
        'item_id' => $itemId,
        'item_name' => $baseItemName,
        'market_hash_name' => $marketHashName !== '' ? $marketHashName : $baseItemName,
        'links' => $links,
        'updated_at' => gmdate(DATE_ATOM),
    ];

    saveInspectLinkCache($cacheKey, $payload);
    respondJson($payload);
} catch (Throwable $exception) {
    respondJson(['error' => $exception->getMessage()], 500);
}
