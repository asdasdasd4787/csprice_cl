<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';

function ensureSteamAnalystTable(mysqli $connection): void
{
    $connection->query(
        'CREATE TABLE IF NOT EXISTS steam_analyst_prices (
            id INT AUTO_INCREMENT PRIMARY KEY,
            item_id INT NOT NULL,
            wear VARCHAR(30) NOT NULL,
            price DECIMAL(10,2) NOT NULL,
            volume INT DEFAULT 0,
            market_name VARCHAR(255) DEFAULT NULL,
            recorded_at DATETIME NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_item_wear (item_id, wear),
            INDEX idx_item_recorded (item_id, recorded_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
}

function loadItem(mysqli $connection, int $itemId): array
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

function fetchSteamWearPrice(string $apiKey, string $marketName, int $timeoutSeconds): array
{
    $url = sprintf(
        '%s/v1/prices?market_name=%s',
        rtrim((string)(appConfig()['steamanalyst']['base_url'] ?? ''), '/'),
        rawurlencode($marketName)
    );

    $response = httpJsonRequest($url, [
        'Accept: application/json',
        'Authorization: Bearer ' . $apiKey,
    ], $timeoutSeconds);

    if ($response['status'] >= 400) {
        throw new RuntimeException('SteamAnalyst request failed with status ' . $response['status'] . '.');
    }

    $payload = $response['json'];
    $data = $payload['data'] ?? null;
    if (!is_array($data)) {
        throw new RuntimeException('SteamAnalyst payload did not contain a data object.');
    }

    $resolvedName = trim((string)($data['market_name'] ?? $marketName));
    $price = priceToFloat($data['price'] ?? null);
    if ($price === null) {
        throw new RuntimeException('SteamAnalyst payload did not contain a valid price.');
    }

    [, $wear] = splitSteamWear($resolvedName);
    if ($wear === '') {
        throw new RuntimeException('Could not determine wear from SteamAnalyst market name.');
    }

    return [
        'market_name' => $resolvedName,
        'wear' => $wear,
        'price' => $price,
        'volume' => (int)($data['volume'] ?? 0),
    ];
}

function upsertSteamRows(mysqli $connection, int $itemId, array $rows, string $recordedAt): void
{
    $statement = $connection->prepare(
        'INSERT INTO steam_analyst_prices (item_id, wear, price, volume, market_name, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            price = VALUES(price),
            volume = VALUES(volume),
            market_name = VALUES(market_name),
            recorded_at = VALUES(recorded_at)'
    );

    foreach ($rows as $row) {
        $wear = (string)$row['wear'];
        $price = (float)$row['price'];
        $volume = (int)$row['volume'];
        $marketName = (string)$row['market_name'];
        $statement->bind_param('isdiss', $itemId, $wear, $price, $volume, $marketName, $recordedAt);
        $statement->execute();
    }
}

$isCli = PHP_SAPI === 'cli';
$options = $isCli ? getopt('', ['item-id::']) : [];
$itemId = $isCli
    ? (isset($options['item-id']) ? (int)$options['item-id'] : 1)
    : (isset($_GET['item_id']) ? (int)$_GET['item_id'] : 1);

try {
    $config = appConfig();
    $apiKey = trim((string)($config['steamanalyst']['api_key'] ?? ''));
    if ($apiKey === '') {
        throw new RuntimeException('SteamAnalyst API key is missing.');
    }

    $timeoutSeconds = (int)($config['steamanalyst']['timeout_seconds'] ?? 20);
    $connection = dbConnection();
    ensureSteamAnalystTable($connection);
    $item = loadItem($connection, $itemId);

    $rows = [];
    foreach (($config['steamanalyst']['wears'] ?? []) as $wear) {
        $rows[] = fetchSteamWearPrice(
            $apiKey,
            sprintf('%s (%s)', $item['name'], $wear),
            $timeoutSeconds
        );
    }

    $recordedAt = date('Y-m-d H:i:s');
    upsertSteamRows($connection, $item['id'], $rows, $recordedAt);

    respondJson([
        'success' => true,
        'item_id' => $item['id'],
        'item_name' => $item['name'],
        'recorded_at' => $recordedAt,
        'rows' => $rows,
    ]);
} catch (Throwable $exception) {
    respondJson([
        'success' => false,
        'error' => $exception->getMessage(),
    ], 500);
}
