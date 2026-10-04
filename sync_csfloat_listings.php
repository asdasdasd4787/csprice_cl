<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';

function ensureCsfloatSnapshotTable(mysqli $connection): void
{
    $connection->query(
        'CREATE TABLE IF NOT EXISTS csfloat_listing_snapshots (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            batch_id CHAR(32) NOT NULL,
            item_id INT NOT NULL,
            listing_id VARCHAR(32) NOT NULL,
            listing_type VARCHAR(20) NOT NULL,
            state VARCHAR(30) NOT NULL,
            market_hash_name VARCHAR(255) NOT NULL,
            item_name VARCHAR(255) DEFAULT NULL,
            wear VARCHAR(30) DEFAULT NULL,
            price_cents INT NOT NULL,
            price DECIMAL(10,2) NOT NULL,
            min_offer_price_cents INT DEFAULT NULL,
            float_value DECIMAL(12,10) DEFAULT NULL,
            seller_steam_id VARCHAR(32) DEFAULT NULL,
            seller_username VARCHAR(255) DEFAULT NULL,
            sticker_count INT DEFAULT 0,
            raw_json LONGTEXT NOT NULL,
            recorded_at DATETIME NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_item_recorded (item_id, recorded_at),
            INDEX idx_item_batch (item_id, batch_id),
            INDEX idx_listing_id (listing_id),
            INDEX idx_market_name (market_hash_name(191)),
            CONSTRAINT csfloat_listing_snapshots_ibfk_1 FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
}

function loadTrackedItem(mysqli $connection, int $itemId): array
{
    $statement = $connection->prepare('SELECT id, name FROM items WHERE id = ? LIMIT 1');
    $statement->bind_param('i', $itemId);
    $statement->execute();
    $result = $statement->get_result();
    $item = $result->fetch_assoc();

    if (!$item) {
        throw new RuntimeException('Tracked item was not found.');
    }

    return [
        'id' => (int)$item['id'],
        'name' => (string)$item['name'],
    ];
}

function fetchCsfloatWearListings(string $apiKey, string $marketName, string $fallbackWear, array $config): array
{
    $query = http_build_query([
        'market_hash_name' => $marketName,
        'limit' => (int)($config['limit'] ?? 50),
        'sort_by' => (string)($config['sort_by'] ?? 'lowest_price'),
        'type' => (string)($config['listing_type'] ?? 'buy_now'),
        'category' => (int)($config['category'] ?? 1),
    ], '', '&', PHP_QUERY_RFC3986);

    $url = rtrim((string)($config['base_url'] ?? 'https://csfloat.com'), '/') . '/api/v1/listings?' . $query;
    $response = httpJsonRequest($url, [
        'Accept: application/json',
        'Authorization: ' . $apiKey,
    ], (int)($config['timeout_seconds'] ?? 20));

    if ($response['status'] >= 400) {
        $message = $response['json']['message'] ?? ('status ' . $response['status']);
        throw new RuntimeException('CSFloat request failed for ' . $marketName . ': ' . $message);
    }

    if (!is_array($response['json'])) {
        throw new RuntimeException('CSFloat payload did not contain a listings array.');
    }

    $rows = [];
    foreach ($response['json'] as $listing) {
        if (!is_array($listing)) {
            continue;
        }

        $item = is_array($listing['item'] ?? null) ? $listing['item'] : [];
        $seller = is_array($listing['seller'] ?? null) ? $listing['seller'] : [];
        $priceCents = (int)($listing['price'] ?? 0);

        if ($priceCents <= 0 || empty($listing['id'])) {
            continue;
        }

        $wear = trim((string)($item['wear_name'] ?? $fallbackWear));
        $rawJson = json_encode($listing, JSON_UNESCAPED_SLASHES);

        $rows[] = [
            'listing_id' => (string)$listing['id'],
            'listing_type' => (string)($listing['type'] ?? 'buy_now'),
            'state' => (string)($listing['state'] ?? ''),
            'market_hash_name' => (string)($item['market_hash_name'] ?? $marketName),
            'item_name' => (string)($item['item_name'] ?? ''),
            'wear' => $wear,
            'price_cents' => $priceCents,
            'price' => round($priceCents / 100, 2),
            'min_offer_price_cents' => isset($listing['min_offer_price']) ? (int)$listing['min_offer_price'] : null,
            'float_value' => isset($item['float_value']) ? (float)$item['float_value'] : null,
            'seller_steam_id' => isset($seller['steam_id']) ? (string)$seller['steam_id'] : null,
            'seller_username' => isset($seller['username']) ? (string)$seller['username'] : null,
            'sticker_count' => is_array($item['stickers'] ?? null) ? count($item['stickers']) : 0,
            'raw_json' => $rawJson !== false ? $rawJson : '{}',
        ];
    }

    return $rows;
}

function insertCsfloatRows(mysqli $connection, int $itemId, string $batchId, string $recordedAt, array $rows): int
{
    if (!$rows) {
        return 0;
    }

    $statement = $connection->prepare(
        'INSERT INTO csfloat_listing_snapshots (
            batch_id,
            item_id,
            listing_id,
            listing_type,
            state,
            market_hash_name,
            item_name,
            wear,
            price_cents,
            price,
            min_offer_price_cents,
            float_value,
            seller_steam_id,
            seller_username,
            sticker_count,
            raw_json,
            recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    $inserted = 0;
    foreach ($rows as $row) {
        $listingId = (string)$row['listing_id'];
        $listingType = (string)$row['listing_type'];
        $state = (string)$row['state'];
        $marketHashName = (string)$row['market_hash_name'];
        $itemName = (string)$row['item_name'];
        $wear = (string)$row['wear'];
        $priceCents = (int)$row['price_cents'];
        $price = (float)$row['price'];
        $minOfferPriceCents = isset($row['min_offer_price_cents']) ? (int)$row['min_offer_price_cents'] : null;
        $floatValue = isset($row['float_value']) ? (float)$row['float_value'] : null;
        $sellerSteamId = $row['seller_steam_id'] !== null ? (string)$row['seller_steam_id'] : null;
        $sellerUsername = $row['seller_username'] !== null ? (string)$row['seller_username'] : null;
        $stickerCount = (int)$row['sticker_count'];
        $rawJson = (string)$row['raw_json'];

        $statement->bind_param(
            'sissssssidisissss',
            $batchId,
            $itemId,
            $listingId,
            $listingType,
            $state,
            $marketHashName,
            $itemName,
            $wear,
            $priceCents,
            $price,
            $minOfferPriceCents,
            $floatValue,
            $sellerSteamId,
            $sellerUsername,
            $stickerCount,
            $rawJson,
            $recordedAt
        );
        $statement->execute();
        $inserted++;
    }

    return $inserted;
}

$isCli = PHP_SAPI === 'cli';
$options = $isCli ? getopt('', ['item-id::']) : [];
$itemId = $isCli
    ? (isset($options['item-id']) ? (int)$options['item-id'] : 1)
    : (isset($_GET['item_id']) ? (int)$_GET['item_id'] : 1);

try {
    $config = appConfig();
    $csfloatConfig = $config['csfloat'] ?? [];
    $apiKey = trim((string)($csfloatConfig['api_key'] ?? ''));
    if ($apiKey === '') {
        throw new RuntimeException('CSFloat API key is missing.');
    }

    $connection = dbConnection();
    ensureCsfloatSnapshotTable($connection);
    $item = loadTrackedItem($connection, $itemId);
    $wears = $csfloatConfig['wears'] ?? [];
    $batchId = bin2hex(random_bytes(16));
    $recordedAt = date('Y-m-d H:i:s');
    $rows = [];

    foreach ($wears as $wear) {
        $marketName = sprintf('%s (%s)', $item['name'], $wear);
        $rows = array_merge($rows, fetchCsfloatWearListings($apiKey, $marketName, (string)$wear, $csfloatConfig));
    }

    $inserted = insertCsfloatRows($connection, $item['id'], $batchId, $recordedAt, $rows);

    respondJson([
        'success' => true,
        'item_id' => $item['id'],
        'item_name' => $item['name'],
        'recorded_at' => $recordedAt,
        'batch_id' => $batchId,
        'rows_inserted' => $inserted,
        'wears_queried' => count($wears),
    ]);
} catch (Throwable $exception) {
    respondJson([
        'success' => false,
        'error' => $exception->getMessage(),
    ], 500);
}
