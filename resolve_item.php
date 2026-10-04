<?php
declare(strict_types=1);

require_once __DIR__ . '/app_bootstrap.php';

try {
    $marketHashName = trim((string)($_GET['market_hash_name'] ?? ''));
    if ($marketHashName === '') {
        throw new RuntimeException('Missing market_hash_name.');
    }

    [$baseName, $wear] = splitSteamWear($marketHashName);
    $connection = dbConnection();

    $candidates = array_values(array_unique(array_filter([
        $marketHashName,
        $baseName,
    ], static fn(string $value): bool => trim($value) !== '')));

    $resolved = null;

    foreach ($candidates as $candidate) {
        $statement = $connection->prepare('SELECT id, name FROM items WHERE name = ? LIMIT 1');
        $statement->bind_param('s', $candidate);
        $statement->execute();
        $row = $statement->get_result()->fetch_assoc();
        $statement->close();

        if (is_array($row) && isset($row['id'])) {
            $resolved = $row;
            break;
        }
    }

    if ($resolved === null && $baseName !== '') {
        $like = $baseName . '%';
        if (str_starts_with($marketHashName, 'Sticker Slab |')) {
            $statement = $connection->prepare('SELECT id, name FROM items WHERE name LIKE ? AND name LIKE ? ORDER BY name ASC LIMIT 1');
            $slabPrefix = 'Sticker Slab |%';
            $statement->bind_param('ss', $like, $slabPrefix);
        } elseif (str_starts_with($marketHashName, 'Sticker |')) {
            $statement = $connection->prepare('SELECT id, name FROM items WHERE name LIKE ? AND name LIKE ? AND name NOT LIKE ? ORDER BY name ASC LIMIT 1');
            $stickerPrefix = 'Sticker |%';
            $excludeSlabPrefix = 'Sticker Slab |%';
            $statement->bind_param('sss', $like, $stickerPrefix, $excludeSlabPrefix);
        } else {
            $statement = $connection->prepare('SELECT id, name FROM items WHERE name LIKE ? ORDER BY name ASC LIMIT 1');
            $statement->bind_param('s', $like);
        }
        $statement->execute();
        $row = $statement->get_result()->fetch_assoc();
        $statement->close();

        if (is_array($row) && isset($row['id'])) {
            $resolved = $row;
        }
    }

    respondJson([
        'success' => $resolved !== null,
        'market_hash_name' => $marketHashName,
        'base_name' => $baseName,
        'wear' => $wear,
        'item_id' => $resolved !== null ? (int)$resolved['id'] : null,
        'name' => $resolved !== null ? (string)$resolved['name'] : null,
    ]);
} catch (Throwable $exception) {
    respondJson([
        'success' => false,
        'error' => $exception->getMessage(),
    ], 500);
}
