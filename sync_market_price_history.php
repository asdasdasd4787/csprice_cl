<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';

const HISTORY_SYNC_INTERVAL_HOURS = 12;

function resolvePythonExecutableForSync(): string
{
    $override = trim((string)getenv('PYTHON_BIN'));
    if ($override !== '') {
        return $override;
    }

    $localAppData = getenv('LOCALAPPDATA');
    if (is_string($localAppData) && $localAppData !== '') {
        $matches = glob($localAppData . DIRECTORY_SEPARATOR . 'Python' . DIRECTORY_SEPARATOR . 'pythoncore-*' . DIRECTORY_SEPARATOR . 'python.exe');
        if (is_array($matches) && $matches) {
            rsort($matches);
            return $matches[0];
        }

        $binPython = $localAppData . DIRECTORY_SEPARATOR . 'Python' . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'python.exe';
        if (is_file($binPython)) {
            return $binPython;
        }
    }

    return 'python';
}

function supportedWearNames(): array
{
    $configured = appConfig()['skinport']['wears'] ?? [];
    if (is_array($configured) && $configured) {
        return array_values(array_filter(array_map(static fn (mixed $value): string => trim((string)$value), $configured)));
    }

    return [
        'Factory New',
        'Minimal Wear',
        'Field-Tested',
        'Well-Worn',
        'Battle-Scarred',
    ];
}

function ensureItemsTableForHistory(PDO $connection): void
{
    if (dbTableExists($connection, 'items')) {
        return;
    }

    $driver = pdoDriverName($connection);
    if ($driver === 'sqlsrv') {
        $connection->exec(
            "CREATE TABLE items (
                id INT IDENTITY(1,1) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                weapon VARCHAR(100) NULL,
                skin VARCHAR(100) NULL,
                rarity VARCHAR(50) NOT NULL DEFAULT 'Consumer Grade',
                image_url VARCHAR(500) NULL,
                created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            )"
        );
        $connection->exec('CREATE INDEX idx_items_name ON items (name)');
        return;
    }

    $connection->exec(
        "CREATE TABLE IF NOT EXISTS items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            weapon VARCHAR(100) DEFAULT NULL,
            skin VARCHAR(100) DEFAULT NULL,
            rarity VARCHAR(50) DEFAULT 'Consumer Grade',
            image_url VARCHAR(500) DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_items_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
}

function ensurePriceHistoryTableForSync(PDO $connection): void
{
    if (!dbTableExists($connection, 'price_history')) {
        $driver = pdoDriverName($connection);
        if ($driver === 'sqlsrv') {
            $connection->exec(
                "CREATE TABLE price_history (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    item_id INT NOT NULL,
                    price DECIMAL(10,2) NOT NULL,
                    volume INT NOT NULL DEFAULT 0,
                    source VARCHAR(50) NOT NULL DEFAULT 'Steam',
                    wear VARCHAR(30) NOT NULL DEFAULT 'Factory New',
                    recorded_at DATETIME2 NOT NULL,
                    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
                )"
            );
            $connection->exec('CREATE INDEX idx_price_history_item ON price_history (item_id)');
            $connection->exec('CREATE INDEX idx_price_history_recorded ON price_history (recorded_at)');
            $connection->exec('CREATE INDEX idx_price_history_source ON price_history (source)');
            $connection->exec('CREATE INDEX idx_price_history_wear ON price_history (wear)');
        } else {
            $connection->exec(
                "CREATE TABLE IF NOT EXISTS price_history (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    item_id INT NOT NULL,
                    price DECIMAL(10,2) NOT NULL,
                    volume INT NOT NULL DEFAULT 0,
                    source VARCHAR(50) NOT NULL DEFAULT 'Steam',
                    wear VARCHAR(30) NOT NULL DEFAULT 'Factory New',
                    recorded_at DATETIME NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_price_history_item (item_id),
                    INDEX idx_price_history_recorded (recorded_at),
                    INDEX idx_price_history_source (source),
                    INDEX idx_price_history_wear (wear)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );
        }
    }

    if (!dbColumnExists($connection, 'price_history', 'source')) {
        $connection->exec(pdoDriverName($connection) === 'sqlsrv'
            ? "ALTER TABLE price_history ADD source VARCHAR(50) NOT NULL DEFAULT 'Steam'"
            : "ALTER TABLE price_history ADD COLUMN source VARCHAR(50) NOT NULL DEFAULT 'Steam'");
    }

    if (!dbColumnExists($connection, 'price_history', 'wear')) {
        $connection->exec(pdoDriverName($connection) === 'sqlsrv'
            ? "ALTER TABLE price_history ADD wear VARCHAR(30) NOT NULL DEFAULT 'Factory New'"
            : "ALTER TABLE price_history ADD COLUMN wear VARCHAR(30) NOT NULL DEFAULT 'Factory New'");
    }
}

function ensureProviderHistoryTableForSync(PDO $connection): void
{
    if (!dbTableExists($connection, 'provider_price_history')) {
        $driver = pdoDriverName($connection);
        if ($driver === 'sqlsrv') {
            $connection->exec(
                "CREATE TABLE provider_price_history (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    item_id INT NOT NULL,
                    provider VARCHAR(80) NOT NULL,
                    wear VARCHAR(30) NULL,
                    price DECIMAL(10,2) NOT NULL,
                    recorded_at DATETIME2 NOT NULL,
                    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
                )"
            );
            $connection->exec('CREATE INDEX idx_provider_price_item ON provider_price_history (item_id, provider)');
            $connection->exec('CREATE INDEX idx_provider_price_recorded ON provider_price_history (recorded_at)');
        } elseif ($driver === 'pgsql') {
            $connection->exec(
                "CREATE TABLE IF NOT EXISTS provider_price_history (
                    id BIGSERIAL PRIMARY KEY,
                    item_id BIGINT NOT NULL,
                    provider VARCHAR(80) NOT NULL,
                    wear VARCHAR(30) DEFAULT NULL,
                    price DECIMAL(10,2) NOT NULL,
                    recorded_at TIMESTAMPTZ NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )"
            );
            $connection->exec('CREATE INDEX IF NOT EXISTS idx_provider_price_item ON provider_price_history (item_id, provider)');
            $connection->exec('CREATE INDEX IF NOT EXISTS idx_provider_price_recorded ON provider_price_history (recorded_at)');
        } else {
            $connection->exec(
                "CREATE TABLE IF NOT EXISTS provider_price_history (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    item_id INT NOT NULL,
                    provider VARCHAR(80) NOT NULL,
                    wear VARCHAR(30) DEFAULT NULL,
                    price DECIMAL(10,2) NOT NULL,
                    recorded_at DATETIME NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_provider_price_item (item_id, provider),
                    INDEX idx_provider_price_recorded (recorded_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );
        }
    }

    if (!dbColumnExists($connection, 'provider_price_history', 'wear')) {
        $connection->exec(pdoDriverName($connection) === 'sqlsrv'
            ? "ALTER TABLE provider_price_history ADD wear VARCHAR(30) NULL"
            : "ALTER TABLE provider_price_history ADD COLUMN wear VARCHAR(30) DEFAULT NULL");
    }
}

function ensureSteamLatestTableForSync(PDO $connection): void
{
    if (dbTableExists($connection, 'steam_analyst_prices')) {
        return;
    }

    $driver = pdoDriverName($connection);
    if ($driver === 'sqlsrv') {
        $connection->exec(
            "CREATE TABLE steam_analyst_prices (
                id INT IDENTITY(1,1) PRIMARY KEY,
                item_id INT NOT NULL,
                wear VARCHAR(30) NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                volume INT NOT NULL DEFAULT 0,
                market_name VARCHAR(255) NULL,
                recorded_at DATETIME2 NOT NULL,
                created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            )"
        );
        $connection->exec('CREATE UNIQUE INDEX uniq_item_wear ON steam_analyst_prices (item_id, wear)');
        $connection->exec('CREATE INDEX idx_steam_latest_recorded ON steam_analyst_prices (item_id, recorded_at)');
        return;
    }

    $connection->exec(
        "CREATE TABLE IF NOT EXISTS steam_analyst_prices (
            id INT AUTO_INCREMENT PRIMARY KEY,
            item_id INT NOT NULL,
            wear VARCHAR(30) NOT NULL,
            price DECIMAL(10,2) NOT NULL,
            volume INT NOT NULL DEFAULT 0,
            market_name VARCHAR(255) DEFAULT NULL,
            recorded_at DATETIME NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_item_wear (item_id, wear),
            INDEX idx_steam_latest_recorded (item_id, recorded_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
}

function ensureHistorySchema(PDO $connection): void
{
    ensureItemsTableForHistory($connection);
    ensurePriceHistoryTableForSync($connection);
    ensureProviderHistoryTableForSync($connection);
    ensureSteamLatestTableForSync($connection);
}

function splitTrackedName(string $name): array
{
    $parts = array_map('trim', explode('|', $name, 2));
    return [
        $parts[0] ?? $name,
        $parts[1] ?? '',
    ];
}

function loadRequestedPrimaryItem(int $itemId, string $lookupName = ''): array
{
    if ($itemId > 0) {
        $item = loadPrimaryItemById($itemId);
        if (is_array($item) && !empty($item['name'])) {
            return $item;
        }
    }

    $lookupName = trim($lookupName);
    if ($lookupName === '') {
        throw new RuntimeException('Tracked item could not be resolved.');
    }

    $connection = dbPdoConnection('db');
    $statement = $connection->prepare('SELECT * FROM items WHERE name = :name ORDER BY id ASC');
    $statement->execute([':name' => $lookupName]);
    $row = $statement->fetch();
    if (is_array($row)) {
        return $row;
    }

    [$baseName] = splitSteamWear($lookupName);
    $statement->execute([':name' => $baseName]);
    $row = $statement->fetch();
    if (is_array($row)) {
        return $row;
    }

    [$weapon, $skin] = splitTrackedName($baseName);
    return [
        'id' => 0,
        'name' => $baseName,
        'weapon' => $weapon,
        'skin' => $skin,
        'rarity' => 'Unknown',
        'image_url' => null,
    ];
}

function ensureHistoryItem(PDO $connection, array $primaryItem): array
{
    $name = trim((string)($primaryItem['name'] ?? ''));
    if ($name === '') {
        throw new RuntimeException('Tracked item is missing a name.');
    }

    $select = $connection->prepare('SELECT * FROM items WHERE name = :name ORDER BY id ASC');
    $select->execute([':name' => $name]);
    $existing = $select->fetch();
    if (is_array($existing)) {
        return $existing;
    }

    [$weapon, $skin] = splitTrackedName($name);
    $statement = $connection->prepare(
        'INSERT INTO items (name, weapon, skin, rarity, image_url)
         VALUES (:name, :weapon, :skin, :rarity, :image_url)'
    );
    $statement->execute([
        ':name' => $name,
        ':weapon' => trim((string)($primaryItem['weapon'] ?? $weapon)) ?: null,
        ':skin' => trim((string)($primaryItem['skin'] ?? $skin)) ?: null,
        ':rarity' => trim((string)($primaryItem['rarity'] ?? 'Unknown')) ?: 'Unknown',
        ':image_url' => trim((string)($primaryItem['image_url'] ?? '')) ?: null,
    ]);

    $select->execute([':name' => $name]);
    $inserted = $select->fetch();
    if (!is_array($inserted)) {
        throw new RuntimeException('Could not create market-history item row.');
    }

    return $inserted;
}

function priceHistoryExists(PDO $connection, int $itemId, string $source, string $wear, string $recordedAt): bool
{
    $statement = $connection->prepare(
        'SELECT COUNT(*) FROM price_history WHERE item_id = :item_id AND source = :source AND wear = :wear AND recorded_at = :recorded_at'
    );
    $statement->execute([
        ':item_id' => $itemId,
        ':source' => $source,
        ':wear' => $wear,
        ':recorded_at' => $recordedAt,
    ]);

    return (int)$statement->fetchColumn() > 0;
}

function latestHistoryRecordedAt(PDO $connection, int $itemId, string $source, string $wear): ?string
{
    $statement = $connection->prepare(
        'SELECT recorded_at
         FROM price_history
         WHERE item_id = :item_id AND source = :source AND wear = :wear
         ORDER BY recorded_at DESC'
    );
    $statement->execute([
        ':item_id' => $itemId,
        ':source' => $source,
        ':wear' => $wear,
    ]);

    $value = $statement->fetchColumn();
    return $value !== false ? (string)$value : null;
}

function canInsertCurrentSnapshot(PDO $connection, int $itemId, string $source, string $wear, string $recordedAt): bool
{
    return !priceHistoryExists($connection, $itemId, $source, $wear, $recordedAt);
}

function insertPriceHistoryPoint(PDO $connection, int $itemId, string $source, string $wear, float $price, int $volume, string $recordedAt): bool
{
    if (priceHistoryExists($connection, $itemId, $source, $wear, $recordedAt)) {
        return false;
    }

    $statement = $connection->prepare(
        'INSERT INTO price_history (item_id, price, volume, source, wear, recorded_at)
         VALUES (:item_id, :price, :volume, :source, :wear, :recorded_at)'
    );
    $statement->execute([
        ':item_id' => $itemId,
        ':price' => round($price, 2),
        ':volume' => max(0, $volume),
        ':source' => $source,
        ':wear' => $wear,
        ':recorded_at' => $recordedAt,
    ]);

    return true;
}

function upsertProviderSnapshot(PDO $connection, int $itemId, string $provider, string $wear, float $price, string $recordedAt): void
{
    $statement = $connection->prepare(
        'SELECT recorded_at
         FROM provider_price_history
         WHERE item_id = :item_id AND provider = :provider AND wear = :wear
         ORDER BY recorded_at DESC'
    );
    $statement->execute([
        ':item_id' => $itemId,
        ':provider' => $provider,
        ':wear' => $wear,
    ]);

    $latestRecordedAt = $statement->fetchColumn();
    if ($latestRecordedAt !== false) {
        $latestTimestamp = strtotime((string)$latestRecordedAt . ' UTC');
        $currentTimestamp = strtotime($recordedAt . ' UTC');
        if ($latestTimestamp !== false && $currentTimestamp !== false && ($currentTimestamp - $latestTimestamp) < (HISTORY_SYNC_INTERVAL_HOURS * 3600) - 900) {
            return;
        }
    }

    $insert = $connection->prepare(
        'INSERT INTO provider_price_history (item_id, provider, wear, price, recorded_at)
         VALUES (:item_id, :provider, :wear, :price, :recorded_at)'
    );
    $insert->execute([
        ':item_id' => $itemId,
        ':provider' => $provider,
        ':wear' => $wear,
        ':price' => round($price, 2),
        ':recorded_at' => $recordedAt,
    ]);
}

function replaceSteamLatestRows(PDO $connection, int $itemId, array $rows, string $recordedAt): void
{
    $delete = $connection->prepare('DELETE FROM steam_analyst_prices WHERE item_id = :item_id');
    $delete->execute([':item_id' => $itemId]);

    $insert = $connection->prepare(
        'INSERT INTO steam_analyst_prices (item_id, wear, price, volume, market_name, recorded_at)
         VALUES (:item_id, :wear, :price, :volume, :market_name, :recorded_at)'
    );

    foreach ($rows as $row) {
        $insert->execute([
            ':item_id' => $itemId,
            ':wear' => $row['wear'],
            ':price' => round((float)$row['price'], 2),
            ':volume' => (int)$row['volume'],
            ':market_name' => $row['market_hash_name'],
            ':recorded_at' => $recordedAt,
        ]);
    }
}

function buildWearMarketHashName(string $baseName, string $wear): string
{
    return sprintf('%s (%s)', $baseName, $wear);
}

function steamListingUrl(string $marketHashName): string
{
    return sprintf('https://steamcommunity.com/market/listings/730/%s', rawurlencode($marketHashName));
}

function fetchSteamOverviewRow(string $marketHashName): ?array
{
    $url = sprintf(
        'https://steamcommunity.com/market/priceoverview/?appid=730&currency=3&market_hash_name=%s',
        rawurlencode($marketHashName)
    );
    $response = httpJsonRequest($url, ['Accept: application/json'], 20);
    $payload = $response['json'];
    if (!is_array($payload) || empty($payload['success'])) {
        return null;
    }

    $price = priceToFloat($payload['lowest_price'] ?? $payload['median_price'] ?? null);
    if ($price === null) {
        return null;
    }

    $volume = (int)preg_replace('/[^0-9]/', '', (string)($payload['volume'] ?? '0'));

    return [
        'market_hash_name' => $marketHashName,
        'price' => $price,
        'volume' => $volume,
    ];
}

function fetchSteamHistorySnapshot(string $marketHashName): ?array
{
    $response = httpTextRequest(steamListingUrl($marketHashName), ['Accept: text/html,*/*;q=0.8'], 25);
    if (($response['status'] ?? 500) >= 400) {
        return null;
    }

    $html = stripslashes(stripslashes((string)($response['body'] ?? '')));
    if ($html === '') {
        return null;
    }

    preg_match_all('/"time":(\d+),"price_median":([0-9.]+),"purchases":(\d+)/', $html, $matches, PREG_SET_ORDER);
    $history = [];
    $seenTimes = [];

    foreach ($matches as $match) {
        $timestamp = (int)$match[1];
        if (isset($seenTimes[$timestamp])) {
            continue;
        }

        $seenTimes[$timestamp] = true;
        $history[] = [
            'recorded_at' => gmdate('Y-m-d H:i:s', $timestamp),
            'price' => round((float)$match[2], 4),
            'volume' => (int)$match[3],
        ];
    }

    usort($history, static fn (array $left, array $right): int => strcmp($left['recorded_at'], $right['recorded_at']));

    preg_match('/"amtMinSellOrder":([0-9]+)/', $html, $sellPriceMatch);
    preg_match('/"cSellOrders":([0-9]+)/', $html, $sellOrdersMatch);
    $currentPrice = isset($sellPriceMatch[1]) ? round(((int)$sellPriceMatch[1]) / 100, 2) : null;
    $sellOrders = isset($sellOrdersMatch[1]) ? (int)$sellOrdersMatch[1] : 0;

    if (!$history && $currentPrice === null) {
        return null;
    }

    return [
        'history' => $history,
        'current_price' => $currentPrice,
        'sell_orders' => $sellOrders,
    ];
}

function scaleSteamHistoryToWearPrice(array $history, ?float $historyAnchorPrice, ?float $targetCurrentPrice): array
{
    if (!$history || $historyAnchorPrice === null || $historyAnchorPrice <= 0 || $targetCurrentPrice === null || $targetCurrentPrice <= 0) {
        return $history;
    }

    $ratio = $targetCurrentPrice / $historyAnchorPrice;
    return array_map(static function (array $point) use ($ratio): array {
        return [
            'recorded_at' => $point['recorded_at'],
            'price' => round((float)$point['price'] * $ratio, 4),
            'volume' => (int)($point['volume'] ?? 0),
        ];
    }, $history);
}

function fetchSkinportItemsByMarketName(array $marketHashNames): array
{
    if (!$marketHashNames) {
        return [];
    }

    $pythonScript = <<<'PY'
import base64
import json
import sys
import requests

names = json.loads(base64.b64decode(sys.argv[1]).decode('utf-8'))
headers = {'Accept-Encoding': 'br', 'Accept': 'application/json'}

response = requests.get(
    'https://api.skinport.com/v1/items',
    params={
        'app_id': 730,
        'currency': 'EUR',
        'tradable': 1,
    },
    headers=headers,
    timeout=60,
)
response.raise_for_status()
rows = response.json()
wanted = set(names)
filtered = {
    row.get('market_hash_name'): row
    for row in rows
    if isinstance(row, dict) and row.get('market_hash_name') in wanted
}
print(json.dumps(filtered))
PY;

    $command = sprintf(
        '%s - %s',
        escapeshellarg(resolvePythonExecutableForSync()),
        escapeshellarg(base64_encode(json_encode(array_values($marketHashNames), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)))
    );

    $descriptorSpec = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $process = proc_open($command, $descriptorSpec, $pipes);
    if (!is_resource($process)) {
        throw new RuntimeException('Could not start Python for Skinport sync.');
    }

    fwrite($pipes[0], $pythonScript);
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[2]);
    $exitCode = proc_close($process);

    if ($exitCode !== 0) {
        throw new RuntimeException('Skinport sync failed: ' . trim($stderr ?: $stdout));
    }

    $decoded = json_decode((string)$stdout, true);
    return is_array($decoded) ? $decoded : [];
}

function pickSkinportCheapestPrice(array $row): ?float
{
    foreach (['min_price', 'median_price', 'mean_price', 'suggested_price'] as $key) {
        if (isset($row[$key]) && is_numeric($row[$key])) {
            return round((float)$row[$key], 2);
        }
    }

    return null;
}

function fetchCsfloatLowestListing(string $apiKey, string $marketHashName, string $wear): ?array
{
    $config = appConfig()['csfloat'] ?? [];
    $query = http_build_query([
        'market_hash_name' => $marketHashName,
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

    if ($response['status'] >= 400 || !is_array($response['json'])) {
        return null;
    }

    $rows = array_values(array_filter($response['json'], static fn (mixed $row): bool => is_array($row) && (int)($row['price'] ?? 0) > 0));
    if (!$rows) {
        return null;
    }

    usort($rows, static fn (array $left, array $right): int => ((int)$left['price']) <=> ((int)$right['price']));
    $lowest = $rows[0];
    $priceCents = (int)($lowest['price'] ?? 0);
    if ($priceCents <= 0) {
        return null;
    }

    return [
        'wear' => $wear,
        'market_hash_name' => $marketHashName,
        'price' => round($priceCents / 100, 2),
        'volume' => count($rows),
    ];
}

$isCli = PHP_SAPI === 'cli';
$options = $isCli ? getopt('', ['item-id::', 'lookup-name::']) : [];
$requestedItemId = $isCli
    ? (isset($options['item-id']) ? (int)$options['item-id'] : 1)
    : (isset($_GET['item_id']) ? (int)$_GET['item_id'] : 1);
$lookupName = $isCli
    ? trim((string)($options['lookup-name'] ?? ''))
    : trim((string)($_GET['lookup_name'] ?? ''));

try {
    $connection = marketHistoryPdoConnection();
    ensureHistorySchema($connection);

    $primaryItem = loadRequestedPrimaryItem($requestedItemId, $lookupName);
    $historyItem = ensureHistoryItem($connection, $primaryItem);
    $historyItemId = (int)$historyItem['id'];
    $itemName = trim((string)$historyItem['name']);
    $wears = supportedWearNames();
    $recordedAt = dbNowUtc();

    $summary = [
        'target_driver' => pdoDriverName($connection),
        'target_database' => pdoDriverName($connection) === 'sqlsrv' ? 'market_data_db_or_fallback' : 'db_fallback',
        'item_id' => $historyItemId,
        'item_name' => $itemName,
        'recorded_at' => $recordedAt,
        'sources' => [],
        'skipped_sources' => [],
    ];

    $steamLatestRows = [];
    $steamInserted = 0;

    foreach ($wears as $wear) {
        $marketHashName = buildWearMarketHashName($itemName, $wear);
        $snapshot = fetchSteamHistorySnapshot($marketHashName);
        $overview = fetchSteamOverviewRow($marketHashName);
        $currentPrice = $overview['price'] ?? ($snapshot['current_price'] ?? null);
        $currentVolume = isset($overview['volume']) ? (int)$overview['volume'] : (int)($snapshot['sell_orders'] ?? 0);

        if (is_array($snapshot)) {
            $historyAnchorPrice = isset($snapshot['current_price']) && $snapshot['current_price'] !== null
                ? round((float)$snapshot['current_price'], 2)
                : (count($snapshot['history'] ?? []) ? round((float)($snapshot['history'][count($snapshot['history']) - 1]['price'] ?? 0), 2) : null);
            $scaledHistory = scaleSteamHistoryToWearPrice($snapshot['history'] ?? [], $historyAnchorPrice, $currentPrice);

            foreach ($scaledHistory as $point) {
                if (!isset($point['price'], $point['recorded_at'])) {
                    continue;
                }

                if (insertPriceHistoryPoint(
                    $connection,
                    $historyItemId,
                    'Steam',
                    $wear,
                    (float)$point['price'],
                    (int)($point['volume'] ?? 0),
                    (string)$point['recorded_at']
                )) {
                    $steamInserted++;
                }
            }
        }

        if ($currentPrice !== null) {
            if (canInsertCurrentSnapshot($connection, $historyItemId, 'Steam', $wear, $recordedAt)) {
                if (insertPriceHistoryPoint($connection, $historyItemId, 'Steam', $wear, $currentPrice, $currentVolume, $recordedAt)) {
                    $steamInserted++;
                }
                upsertProviderSnapshot($connection, $historyItemId, 'Steam', $wear, $currentPrice, $recordedAt);
            }

            $steamLatestRows[] = [
                'wear' => $wear,
                'price' => $currentPrice,
                'volume' => $currentVolume,
                'market_hash_name' => $marketHashName,
            ];
        }
    }

    if ($steamLatestRows) {
        replaceSteamLatestRows($connection, $historyItemId, $steamLatestRows, $recordedAt);
    }

    $summary['sources']['steam'] = [
        'rows_inserted' => $steamInserted,
        'latest_rows' => count($steamLatestRows),
    ];

    $skinportWantedNames = array_map(static fn (string $wear): string => buildWearMarketHashName($itemName, $wear), $wears);
    $skinportRows = fetchSkinportItemsByMarketName($skinportWantedNames);
    $skinportInserted = 0;

    foreach ($skinportRows as $marketHashName => $row) {
        if (!is_array($row)) {
            continue;
        }

        [, $wear] = splitSteamWear((string)$marketHashName);
        if ($wear === '') {
            continue;
        }

        $price = pickSkinportCheapestPrice($row);
        if ($price === null) {
            continue;
        }

        $volume = (int)($row['quantity'] ?? 0);
        if (canInsertCurrentSnapshot($connection, $historyItemId, 'Skinport', $wear, $recordedAt)) {
            if (insertPriceHistoryPoint($connection, $historyItemId, 'Skinport', $wear, $price, $volume, $recordedAt)) {
                $skinportInserted++;
            }
            upsertProviderSnapshot($connection, $historyItemId, 'Skinport', $wear, $price, $recordedAt);
        }
    }

    $summary['sources']['skinport'] = [
        'rows_inserted' => $skinportInserted,
        'matched_wears' => count($skinportRows),
    ];

    $csfloatApiKey = trim((string)(appConfig()['csfloat']['api_key'] ?? ''));
    if ($csfloatApiKey === '') {
        $summary['skipped_sources'][] = 'CSFloat (missing API key)';
    } else {
        $csfloatInserted = 0;
        foreach ($wears as $wear) {
            $marketHashName = buildWearMarketHashName($itemName, $wear);
            $listing = fetchCsfloatLowestListing($csfloatApiKey, $marketHashName, $wear);
            if ($listing === null) {
                continue;
            }

            if (canInsertCurrentSnapshot($connection, $historyItemId, 'CSFloat', $wear, $recordedAt)) {
                if (insertPriceHistoryPoint(
                    $connection,
                    $historyItemId,
                    'CSFloat',
                    $wear,
                    (float)$listing['price'],
                    (int)$listing['volume'],
                    $recordedAt
                )) {
                    $csfloatInserted++;
                }
                upsertProviderSnapshot($connection, $historyItemId, 'CSFloat', $wear, (float)$listing['price'], $recordedAt);
            }
        }

        $summary['sources']['csfloat'] = [
            'rows_inserted' => $csfloatInserted,
        ];
    }

    respondJson([
        'success' => true,
        ...$summary,
    ]);
} catch (Throwable $exception) {
    respondJson([
        'success' => false,
        'error' => $exception->getMessage(),
    ], 500);
}
