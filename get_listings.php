<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';

function tableHasColumn(mysqli $connection, string $table, string $column): bool
{
    $tableName = str_replace('`', '``', $table);
    $columnName = $connection->real_escape_string($column);
    $result = $connection->query("SHOW COLUMNS FROM `{$tableName}` LIKE '{$columnName}'");
    return $result instanceof mysqli_result && $result->num_rows > 0;
}

function wearSortSql(): string
{
    return "FIELD(wear, 'Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred')";
}

function supportedWears(): array
{
    return ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
}

function cacheFilePath(string $name): string
{
    $normalized = preg_replace('/[^a-z0-9_.-]+/i', '_', strtolower($name)) ?: 'cache.json';
    return rtrim(sys_get_temp_dir(), '\\/') . DIRECTORY_SEPARATOR . 'csgo_price_tracker_' . $normalized;
}

function loadCachedArray(string $name, int $ttlSeconds): ?array
{
    $path = cacheFilePath($name);
    if (!is_file($path)) {
        return null;
    }

    $modifiedAt = @filemtime($path);
    if ($modifiedAt === false || $modifiedAt < time() - $ttlSeconds) {
        return null;
    }

    $decoded = json_decode((string)@file_get_contents($path), true);
    return is_array($decoded) ? $decoded : null;
}

function saveCachedArray(string $name, array $payload): void
{
    @file_put_contents(cacheFilePath($name), json_encode($payload));
}

function marketplaceRequestHeaders(): array
{
    return [
        'Accept: application/json, text/plain, */*',
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    ];
}

function fetchMarketplaceIdIndex(): array
{
    static $items = null;

    if ($items !== null) {
        return $items;
    }

    $cachedPayload = loadCachedArray('marketplace_ids.json', 86400);
    if (is_array($cachedPayload['items'] ?? null)) {
        $items = $cachedPayload['items'];
        return $items;
    }

    try {
        $response = httpJsonRequest(
            'https://raw.githubusercontent.com/ModestSerhat/cs2-marketplace-ids/main/cs2_marketplaceids.json',
            marketplaceRequestHeaders(),
            30
        );
        $payload = is_array($response['json']) ? $response['json'] : [];
        if (is_array($payload['items'] ?? null)) {
            $items = $payload['items'];
            saveCachedArray('marketplace_ids.json', $payload);
            return $items;
        }
    } catch (Throwable) {
        // Fall through to an empty payload if the remote lookup is unavailable.
    }

    $items = [];
    return $items;
}

function fetchEuroReferenceRates(): array
{
    static $rates = null;

    if ($rates !== null) {
        return $rates;
    }

    $cachedPayload = loadCachedArray('ecb_rates.json', 43200);
    if (is_array($cachedPayload['rates'] ?? null)) {
        $rates = $cachedPayload['rates'];
        return $rates;
    }

    try {
        $response = httpTextRequest(
            'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
            marketplaceRequestHeaders(),
            20
        );
        $xml = @simplexml_load_string($response['body']);
        if ($xml === false) {
            throw new RuntimeException('Unable to parse ECB reference rates feed.');
        }

        $parsedRates = ['EUR' => 1.0];
        $nodes = $xml->xpath('//*[@currency]');
        if (is_array($nodes)) {
            foreach ($nodes as $node) {
                $currency = strtoupper(trim((string)$node['currency']));
                $rate = (float)$node['rate'];
                if ($currency !== '' && $rate > 0) {
                    $parsedRates[$currency] = $rate;
                }
            }
        }

        if (count($parsedRates) > 1) {
            $rates = $parsedRates;
            saveCachedArray('ecb_rates.json', [
                'fetched_at' => gmdate(DATE_ATOM),
                'rates' => $rates,
            ]);
            return $rates;
        }
    } catch (Throwable) {
        // Fall back to last-known static references if the live ECB feed is unreachable.
    }

    $rates = [
        'EUR' => 1.0,
        'USD' => 1.1702,
        'CNY' => 7.9910,
    ];
    return $rates;
}

function convertPriceToEur(?float $amount, string $currency): ?float
{
    if ($amount === null) {
        return null;
    }

    $code = strtoupper(trim($currency));
    if ($code === '' || $code === 'EUR') {
        return round($amount, 2);
    }

    $rates = fetchEuroReferenceRates();
    $rate = (float)($rates[$code] ?? 0);
    if ($rate <= 0) {
        return round($amount, 2);
    }

    return round($amount / $rate, 2);
}

function fetchItemName(mysqli $connection, int $itemId): ?string
{
    $statement = $connection->prepare('SELECT name FROM items WHERE id = ? LIMIT 1');
    $statement->bind_param('i', $itemId);
    $statement->execute();
    $row = $statement->get_result()->fetch_assoc();

    return isset($row['name']) ? trim((string)$row['name']) : null;
}

function buildItemLookupKeys(string $itemName): array
{
    $trimmed = trim($itemName);
    if ($trimmed === '') {
        return [];
    }

    $keys = [$trimmed];
    [$baseName, $wear] = splitSteamWear($trimmed);
    if ($wear !== '') {
        $keys[] = $baseName;
    } else {
        foreach (supportedWears() as $supportedWear) {
            $keys[] = sprintf('%s (%s)', $trimmed, $supportedWear);
        }
    }

    return array_values(array_unique($keys));
}

function resolveMarketplaceLookupRows(string $itemName): array
{
    $items = fetchMarketplaceIdIndex();
    if (!$items) {
        return [];
    }

    $lookup = [];
    foreach (buildItemLookupKeys($itemName) as $lookupKey) {
        if (!is_array($items[$lookupKey] ?? null)) {
            continue;
        }

        [$baseName, $wear] = splitSteamWear($lookupKey);
        $slot = $wear !== '' ? $wear : '__base';
        $lookup[$slot] = [
            'key' => $lookupKey,
            'base_name' => $baseName,
            'wear' => $wear,
            'ids' => $items[$lookupKey],
        ];
    }

    return $lookup;
}

function fetchMappedMarketOrderSnapshot(
    int $goodsId,
    string $sellUrl,
    string $buyUrl,
    callable $priceNormalizer
): ?array {
    $sellResponse = httpJsonRequest($sellUrl, marketplaceRequestHeaders(), 20);
    if ($sellResponse['status'] >= 400 || ($sellResponse['json']['code'] ?? null) !== 'OK') {
        return null;
    }

    $sellData = is_array($sellResponse['json']['data'] ?? null) ? $sellResponse['json']['data'] : [];
    $sellItems = is_array($sellData['items'] ?? null) ? $sellData['items'] : [];
    $goodsInfos = is_array($sellData['goods_infos'] ?? null) ? $sellData['goods_infos'] : [];
    $goodsInfo = is_array($goodsInfos[(string)$goodsId] ?? null)
        ? $goodsInfos[(string)$goodsId]
        : (is_array(reset($goodsInfos)) ? reset($goodsInfos) : []);

    $bestSell = $priceNormalizer($sellItems[0]['price'] ?? ($goodsInfo['sell_min_price'] ?? null));
    $totalStock = (int)($sellData['total_count'] ?? 0);

    $bestBuy = null;
    try {
        $buyResponse = httpJsonRequest($buyUrl, marketplaceRequestHeaders(), 20);
        if (($buyResponse['json']['code'] ?? null) === 'OK') {
            $buyData = is_array($buyResponse['json']['data'] ?? null) ? $buyResponse['json']['data'] : [];
            $buyItems = is_array($buyData['items'] ?? null) ? $buyData['items'] : [];
            $bestBuy = $priceNormalizer($buyItems[0]['price'] ?? null);
        }
    } catch (Throwable) {
        $bestBuy = null;
    }

    if ($bestSell === null) {
        return null;
    }

    return [
        'best_price' => $bestSell,
        'best_buy' => $bestBuy,
        'stock' => $totalStock,
    ];
}

function fetchMappedMarketplacePayload(
    mysqli $connection,
    int $itemId,
    string $marketplace,
    string $idField,
    callable $sellUrlBuilder,
    callable $buyUrlBuilder,
    callable $priceNormalizer,
    float $feePct
): ?array {
    $cacheKey = sprintf('remote_listing_%s_item_%d.json', preg_replace('/[^a-z0-9_.-]+/i', '_', strtolower($marketplace)), $itemId);
    $cachedPayload = loadCachedArray($cacheKey, 900);
    if (is_array($cachedPayload['wears'] ?? null) && $cachedPayload['wears']) {
        return $cachedPayload;
    }

    $itemName = fetchItemName($connection, $itemId);
    if ($itemName === null || $itemName === '') {
        return null;
    }

    $lookupRows = resolveMarketplaceLookupRows($itemName);
    if (!$lookupRows) {
        return null;
    }

    $wearRows = [];
    $bestPrices = [];
    $totalStock = 0;

    foreach (supportedWears() as $wear) {
        $row = $lookupRows[$wear] ?? null;
        if (!is_array($row['ids'] ?? null)) {
            continue;
        }

        $goodsId = (int)($row['ids'][$idField] ?? 0);
        if ($goodsId <= 0) {
            continue;
        }

        try {
            $snapshot = fetchMappedMarketOrderSnapshot(
                $goodsId,
                $sellUrlBuilder($goodsId),
                $buyUrlBuilder($goodsId),
                $priceNormalizer
            );
        } catch (Throwable) {
            $snapshot = null;
        }

        if ($snapshot === null) {
            continue;
        }

        $wearRows[] = [
            'wear' => $wear,
            'best_price' => $snapshot['best_price'],
            'stock' => (int)$snapshot['stock'],
        ];
        $bestPrices[] = (float)$snapshot['best_price'];
        $totalStock += (int)$snapshot['stock'];
    }

    if (!$wearRows && is_array($lookupRows['__base']['ids'] ?? null)) {
        $goodsId = (int)($lookupRows['__base']['ids'][$idField] ?? 0);
        if ($goodsId > 0) {
            try {
                $snapshot = fetchMappedMarketOrderSnapshot(
                    $goodsId,
                    $sellUrlBuilder($goodsId),
                    $buyUrlBuilder($goodsId),
                    $priceNormalizer
                );
            } catch (Throwable) {
                $snapshot = null;
            }

            if ($snapshot !== null) {
                $wearRows[] = [
                    'wear' => 'Standard',
                    'best_price' => $snapshot['best_price'],
                    'stock' => (int)$snapshot['stock'],
                ];
                $bestPrices[] = (float)$snapshot['best_price'];
                $totalStock += (int)$snapshot['stock'];
            }
        }
    }

    if (!$wearRows) {
        return null;
    }

    $primaryWearRow = null;
    foreach ($wearRows as $wearRow) {
        if (($wearRow['wear'] ?? '') === 'Factory New') {
            $primaryWearRow = $wearRow;
            break;
        }
    }
    if ($primaryWearRow === null) {
        $primaryWearRow = $wearRows[0];
    }

    $bestPrice = round((float)$primaryWearRow['best_price'], 2);
    $avgPrice = round(array_sum($bestPrices) / count($bestPrices), 2);

    $payload = [
        'marketplace' => $marketplace,
        'best_price' => $bestPrice,
        'avg_price' => $avgPrice,
        'total_stock' => $totalStock,
        'fee_pct' => $feePct,
        'is_best' => false,
        'trend_pct' => 0.0,
        'wears' => $wearRows,
        'updated_at' => gmdate(DATE_ATOM),
        'source' => 'live',
    ];

    saveCachedArray($cacheKey, $payload);
    return $payload;
}

function fetchBuff163Payload(mysqli $connection, int $itemId, string $marketplace): ?array
{
    return fetchMappedMarketplacePayload(
        $connection,
        $itemId,
        $marketplace,
        'buff163_goods_id',
        static fn (int $goodsId): string => sprintf(
            'https://buff.163.com/api/market/goods/sell_order?game=csgo&goods_id=%d&page_num=1',
            $goodsId
        ),
        static fn (int $goodsId): string => sprintf(
            'https://buff.163.com/api/market/goods/buy_order?game=csgo&goods_id=%d&page_num=1',
            $goodsId
        ),
        static fn (mixed $value): ?float => convertPriceToEur(priceToFloat($value), 'CNY'),
        2.0
    );
}

function fetchBuffMarketPayload(mysqli $connection, int $itemId, string $marketplace): ?array
{
    return fetchMappedMarketplacePayload(
        $connection,
        $itemId,
        $marketplace,
        'buffmarket_goods_id',
        static fn (int $goodsId): string => sprintf(
            'https://api.buff.market/api/market/goods/sell_order?game=csgo&goods_id=%d&page_num=1',
            $goodsId
        ),
        static fn (int $goodsId): string => sprintf(
            'https://api.buff.market/api/market/goods/buy_order?game=csgo&goods_id=%d&page_num=1',
            $goodsId
        ),
        static fn (mixed $value): ?float => convertPriceToEur(priceToFloat($value), 'USD'),
        2.5
    );
}

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

function ensureSkinportSnapshotTable(mysqli $connection): void
{
    $connection->query(
        'CREATE TABLE IF NOT EXISTS skinport_item_snapshots (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            batch_id CHAR(32) NOT NULL,
            item_id INT NOT NULL,
            market_hash_name VARCHAR(255) NOT NULL,
            wear VARCHAR(30) NOT NULL,
            currency VARCHAR(10) NOT NULL,
            suggested_price DECIMAL(10,2) DEFAULT NULL,
            min_price DECIMAL(10,2) DEFAULT NULL,
            max_price DECIMAL(10,2) DEFAULT NULL,
            mean_price DECIMAL(10,2) DEFAULT NULL,
            median_price DECIMAL(10,2) DEFAULT NULL,
            quantity INT NOT NULL DEFAULT 0,
            item_page VARCHAR(255) DEFAULT NULL,
            market_page VARCHAR(255) DEFAULT NULL,
            created_at_epoch BIGINT DEFAULT NULL,
            updated_at_epoch BIGINT DEFAULT NULL,
            raw_json LONGTEXT NOT NULL,
            recorded_at DATETIME NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_item_recorded (item_id, recorded_at),
            INDEX idx_item_batch (item_id, batch_id),
            INDEX idx_market_hash_name (market_hash_name(191)),
            CONSTRAINT skinport_item_snapshots_ibfk_1 FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
}

function fetchCsfloatPayload(mysqli $connection, int $itemId, string $marketplace): ?array
{
    ensureCsfloatSnapshotTable($connection);

    $latestBatchStatement = $connection->prepare(
        'SELECT batch_id, recorded_at
         FROM csfloat_listing_snapshots
         WHERE item_id = ?
         ORDER BY recorded_at DESC, id DESC
         LIMIT 1'
    );
    $latestBatchStatement->bind_param('i', $itemId);
    $latestBatchStatement->execute();
    $latestBatch = $latestBatchStatement->get_result()->fetch_assoc();

    if (!$latestBatch) {
        return null;
    }

    $batchId = (string)$latestBatch['batch_id'];
    $defaultFeePct = (float)(appConfig()['csfloat']['default_fee_pct'] ?? 2.5);

    $statsStatement = $connection->prepare(
        'SELECT
            ROUND(MIN(price), 2) AS best_price,
            ROUND(AVG(price), 2) AS avg_price,
            COUNT(*) AS total_stock
         FROM csfloat_listing_snapshots
         WHERE item_id = ?
           AND batch_id = ?'
    );
    $statsStatement->bind_param('is', $itemId, $batchId);
    $statsStatement->execute();
    $stats = $statsStatement->get_result()->fetch_assoc() ?: [];

    $wearStatement = $connection->prepare(
        'SELECT
            wear,
            ROUND(MIN(price), 2) AS best_price,
            COUNT(*) AS stock
         FROM csfloat_listing_snapshots
         WHERE item_id = ?
           AND batch_id = ?
         GROUP BY wear
         ORDER BY ' . wearSortSql()
    );
    $wearStatement->bind_param('is', $itemId, $batchId);
    $wearStatement->execute();
    $wearResult = $wearStatement->get_result();

    $wears = [];
    while ($row = $wearResult->fetch_assoc()) {
        $wears[] = [
            'wear' => $row['wear'],
            'best_price' => (float)$row['best_price'],
            'stock' => (int)$row['stock'],
        ];
    }

    $trendStatement = $connection->prepare(
        'SELECT batch_id, recorded_at, COUNT(*) AS total_stock
         FROM csfloat_listing_snapshots
         WHERE item_id = ?
         GROUP BY batch_id, recorded_at
         ORDER BY recorded_at DESC
         LIMIT 2'
    );
    $trendStatement->bind_param('i', $itemId);
    $trendStatement->execute();
    $trendResult = $trendStatement->get_result();

    $batches = [];
    while ($row = $trendResult->fetch_assoc()) {
        $batches[] = $row;
    }

    $latestStock = isset($batches[0]['total_stock']) ? (int)$batches[0]['total_stock'] : 0;
    $previousStock = isset($batches[1]['total_stock']) ? (int)$batches[1]['total_stock'] : 0;
    $trendPct = $previousStock > 0
        ? round((($latestStock - $previousStock) / $previousStock) * 100, 1)
        : 0.0;

    return [
        'marketplace' => $marketplace,
        'best_price' => (float)($stats['best_price'] ?? 0),
        'avg_price' => (float)($stats['avg_price'] ?? 0),
        'total_stock' => (int)($stats['total_stock'] ?? 0),
        'fee_pct' => $defaultFeePct,
        'is_best' => false,
        'trend_pct' => $trendPct,
        'wears' => $wears,
        'updated_at' => $latestBatch['recorded_at'],
    ];
}

function fetchSkinportPayload(mysqli $connection, int $itemId, string $marketplace): ?array
{
    ensureSkinportSnapshotTable($connection);

    $latestBatchStatement = $connection->prepare(
        'SELECT batch_id, recorded_at
         FROM skinport_item_snapshots
         WHERE item_id = ?
         ORDER BY recorded_at DESC, id DESC
         LIMIT 1'
    );
    $latestBatchStatement->bind_param('i', $itemId);
    $latestBatchStatement->execute();
    $latestBatch = $latestBatchStatement->get_result()->fetch_assoc();

    if (!$latestBatch) {
        return null;
    }

    $batchId = (string)$latestBatch['batch_id'];
    $defaultFeePct = (float)(appConfig()['skinport']['default_fee_pct'] ?? 1.0);

    $statsStatement = $connection->prepare(
        'SELECT
            ROUND(MIN(COALESCE(min_price, mean_price, median_price, suggested_price)), 2) AS best_price,
            ROUND(AVG(COALESCE(mean_price, min_price, median_price, suggested_price)), 2) AS avg_price,
            SUM(quantity) AS total_stock
         FROM skinport_item_snapshots
         WHERE item_id = ?
           AND batch_id = ?'
    );
    $statsStatement->bind_param('is', $itemId, $batchId);
    $statsStatement->execute();
    $stats = $statsStatement->get_result()->fetch_assoc() ?: [];

    $wearStatement = $connection->prepare(
        'SELECT
            wear,
            ROUND(COALESCE(min_price, mean_price, median_price, suggested_price), 2) AS best_price,
            quantity AS stock
         FROM skinport_item_snapshots
         WHERE item_id = ?
           AND batch_id = ?
         ORDER BY ' . wearSortSql()
    );
    $wearStatement->bind_param('is', $itemId, $batchId);
    $wearStatement->execute();
    $wearResult = $wearStatement->get_result();

    $wears = [];
    while ($row = $wearResult->fetch_assoc()) {
        $wears[] = [
            'wear' => $row['wear'],
            'best_price' => $row['best_price'] !== null ? (float)$row['best_price'] : 0.0,
            'stock' => (int)$row['stock'],
        ];
    }

    $trendStatement = $connection->prepare(
        'SELECT batch_id, recorded_at, SUM(quantity) AS total_stock
         FROM skinport_item_snapshots
         WHERE item_id = ?
         GROUP BY batch_id, recorded_at
         ORDER BY recorded_at DESC
         LIMIT 2'
    );
    $trendStatement->bind_param('i', $itemId);
    $trendStatement->execute();
    $trendResult = $trendStatement->get_result();

    $batches = [];
    while ($row = $trendResult->fetch_assoc()) {
        $batches[] = $row;
    }

    $latestStock = isset($batches[0]['total_stock']) ? (int)$batches[0]['total_stock'] : 0;
    $previousStock = isset($batches[1]['total_stock']) ? (int)$batches[1]['total_stock'] : 0;
    $trendPct = $previousStock > 0
        ? round((($latestStock - $previousStock) / $previousStock) * 100, 1)
        : 0.0;

    return [
        'marketplace' => $marketplace,
        'best_price' => (float)($stats['best_price'] ?? 0),
        'avg_price' => (float)($stats['avg_price'] ?? 0),
        'total_stock' => (int)($stats['total_stock'] ?? 0),
        'fee_pct' => $defaultFeePct,
        'is_best' => false,
        'trend_pct' => $trendPct,
        'wears' => $wears,
        'updated_at' => $latestBatch['recorded_at'],
    ];
}

try {
    $connection = dbConnection();
    $itemId = isset($_GET['item_id']) ? (int)$_GET['item_id'] : 1;
    $marketplace = trim((string)($_GET['marketplace'] ?? 'Steam'));
    $canonicalMarketplace = $marketplace === 'Steam Market' ? 'Steam' : $marketplace;

    if ($canonicalMarketplace === 'CSFloat') {
        $payload = fetchCsfloatPayload($connection, $itemId, $marketplace);
        if ($payload === null || empty($payload['wears'])) {
            respondJson(['error' => 'No CSFloat listing snapshots found for this item.'], 404);
        }

        respondJson($payload);
    }

    if ($canonicalMarketplace === 'Skinport') {
        $payload = fetchSkinportPayload($connection, $itemId, $marketplace);
        if ($payload === null || empty($payload['wears'])) {
            respondJson(['error' => 'No Skinport snapshots found for this item.'], 404);
        }

        respondJson($payload);
    }

    if ($canonicalMarketplace === 'Buff.163') {
        $payload = fetchBuff163Payload($connection, $itemId, $marketplace);
        if ($payload !== null && !empty($payload['wears'])) {
            respondJson($payload);
        }
    }

    if ($canonicalMarketplace === 'Buff Market') {
        $payload = fetchBuffMarketPayload($connection, $itemId, $marketplace);
        if ($payload !== null && !empty($payload['wears'])) {
            respondJson($payload);
        }
    }

    $statsStatement = $connection->prepare(
        'SELECT
            ROUND(MIN(price), 2) AS best_price,
            ROUND(AVG(price), 2) AS avg_price,
            SUM(stock) AS total_stock,
            MAX(fee_pct) AS fee_pct,
            MAX(is_best) AS is_best
         FROM market_listings
         WHERE item_id = ?
           AND marketplace = ?'
    );
    $statsStatement->bind_param('is', $itemId, $marketplace);
    $statsStatement->execute();
    $stats = $statsStatement->get_result()->fetch_assoc() ?: [];

    $wearStatement = $connection->prepare(
        'SELECT
            wear,
            ROUND(MIN(price), 2) AS best_price,
            SUM(stock) AS stock
         FROM market_listings
         WHERE item_id = ?
           AND marketplace = ?
         GROUP BY wear
         ORDER BY ' . wearSortSql()
    );
    $wearStatement->bind_param('is', $itemId, $marketplace);
    $wearStatement->execute();
    $wearResult = $wearStatement->get_result();

    $wears = [];
    while ($row = $wearResult->fetch_assoc()) {
        $wears[] = [
            'wear' => $row['wear'],
            'best_price' => (float)$row['best_price'],
            'stock' => (int)$row['stock'],
        ];
    }

    if (($stats['best_price'] ?? null) === null && !$wears) {
        respondJson(['error' => 'No market listings found for this marketplace.'], 404);
    }

    $trendWhere = 'WHERE item_id = ?';
    $bindTypes = 'i';
    $bindValues = [$itemId];
    if (tableHasColumn($connection, 'price_history', 'source')) {
        $trendWhere .= ' AND source = ?';
        $bindTypes .= 's';
        $bindValues[] = $marketplace;
    }

    $trendStatement = $connection->prepare(
        'SELECT
            SUM(CASE WHEN recorded_at >= NOW() - INTERVAL 7 DAY THEN volume ELSE 0 END) AS this_week,
            SUM(CASE WHEN recorded_at >= NOW() - INTERVAL 14 DAY
                      AND recorded_at < NOW() - INTERVAL 7 DAY THEN volume ELSE 0 END) AS last_week
         FROM price_history
         ' . $trendWhere
    );
    $trendStatement->bind_param($bindTypes, ...$bindValues);
    $trendStatement->execute();
    $trendRow = $trendStatement->get_result()->fetch_assoc() ?: [];
    $thisWeek = (int)($trendRow['this_week'] ?? 0);
    $lastWeek = (int)($trendRow['last_week'] ?? 1);
    $trendPct = $lastWeek > 0
        ? round((($thisWeek - $lastWeek) / $lastWeek) * 100, 1)
        : 0.0;

    respondJson([
        'marketplace' => $marketplace,
        'best_price' => (float)($stats['best_price'] ?? 0),
        'avg_price' => (float)($stats['avg_price'] ?? 0),
        'total_stock' => (int)($stats['total_stock'] ?? 0),
        'fee_pct' => (float)($stats['fee_pct'] ?? 0),
        'is_best' => (bool)($stats['is_best'] ?? false),
        'trend_pct' => $trendPct,
        'wears' => $wears,
    ]);
} catch (Throwable $exception) {
    respondJson(['error' => $exception->getMessage()], 500);
}
