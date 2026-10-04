<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';

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
            INDEX idx_market_hash_name (market_hash_name(191))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
}

function wearSortSql(): string
{
    return "FIELD(wear, 'Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred')";
}

function preferredSkinportPrice(array $row): ?float
{
    foreach (['min_price', 'suggested_price', 'mean_price', 'median_price'] as $key) {
        if (isset($row[$key]) && $row[$key] !== null && (float)$row[$key] > 0) {
            return round((float)$row[$key], 2);
        }
    }

    return null;
}

/** Overlay DB snapshot wears with the live Skinport items index (cheapest ask). */
function overlaySkinportQualityFromItemsIndex(array $qualityRows, string $baseLookupName = ''): array
{
    $indexPath = __DIR__ . '/assets/skinport-cache/items_index.json';
    if (!is_file($indexPath)) {
        return $qualityRows;
    }

    $decoded = json_decode((string)file_get_contents($indexPath), true);
    $items = is_array($decoded['items'] ?? null) ? $decoded['items'] : [];
    if (!$items) {
        return $qualityRows;
    }

    $byWear = [];
    foreach ($qualityRows as $row) {
        if (!is_array($row) || empty($row['wear'])) {
            continue;
        }
        $byWear[(string)$row['wear']] = $row;
    }

    $wears = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
    foreach ($wears as $wear) {
        $candidates = [];
        if (!empty($byWear[$wear]['market_name'])) {
            $candidates[] = (string)$byWear[$wear]['market_name'];
        }
        $base = trim($baseLookupName);
        if ($base === '' && !empty($byWear[$wear]['market_name'])) {
            $base = preg_replace('/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i', '', (string)$byWear[$wear]['market_name']) ?? '';
        }
        if ($base !== '') {
            $candidates[] = "{$base} ({$wear})";
        }

        $hit = null;
        foreach ($candidates as $name) {
            if (isset($items[$name]) && is_array($items[$name])) {
                $hit = $items[$name];
                break;
            }
        }
        if (!$hit) {
            continue;
        }

        $minPrice = isset($hit['min_price']) && is_numeric($hit['min_price']) ? (float)$hit['min_price'] : null;
        $ask = preferredSkinportPrice([
            'min_price' => $minPrice,
            'suggested_price' => $hit['suggested_price'] ?? null,
            'mean_price' => $hit['mean_price'] ?? null,
            'median_price' => $hit['median_price'] ?? null,
        ]);
        if ($ask === null) {
            continue;
        }

        $existing = $byWear[$wear] ?? [
            'wear' => $wear,
            'market_name' => $candidates[0] ?? "{$base} ({$wear})",
            'quantity' => 0,
        ];
        $byWear[$wear] = array_merge($existing, [
            'price' => $ask,
            'min_price' => $minPrice,
            'mean_price' => isset($hit['mean_price']) ? (float)$hit['mean_price'] : ($existing['mean_price'] ?? null),
            'median_price' => isset($hit['median_price']) ? (float)$hit['median_price'] : ($existing['median_price'] ?? null),
            'suggested_price' => isset($hit['suggested_price']) ? (float)$hit['suggested_price'] : ($existing['suggested_price'] ?? null),
            'quantity' => isset($hit['quantity']) ? (int)$hit['quantity'] : (int)($existing['quantity'] ?? 0),
            'market_name' => (string)($hit['market_hash_name'] ?? $existing['market_name'] ?? ''),
        ]);
    }

    $ordered = [];
    foreach ($wears as $wear) {
        if (isset($byWear[$wear])) {
            $ordered[] = $byWear[$wear];
        }
    }
    return $ordered ?: $qualityRows;
}

try {
    $connection = dbConnection();
    $itemId = isset($_GET['item_id']) ? (int)$_GET['item_id'] : 1;
    $lookupName = trim((string)($_GET['lookup_name'] ?? $_GET['name'] ?? ''));
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
        $qualityRows = overlaySkinportQualityFromItemsIndex([], $lookupName);
        $fn = null;
        foreach ($qualityRows as $row) {
            if (($row['wear'] ?? '') === 'Factory New') {
                $fn = $row;
                break;
            }
        }
        $skinportMarket = null;
        if ($fn && isset($fn['price']) && (float)$fn['price'] > 0) {
            $feePct = (float)(appConfig()['skinport']['default_fee_pct'] ?? 1.0);
            $finalPrice = (float)$fn['price'];
            $skinportMarket = [
                'name' => 'Skinport',
                'base_price' => round($finalPrice / (1 + ($feePct / 100)), 2),
                'final_price' => $finalPrice,
                'fee_pct' => $feePct,
            ];
        }
        respondJson([
            'item_id' => $itemId,
            'quality_rows' => $qualityRows,
            'skinport_market' => $skinportMarket,
            'updated_at' => gmdate('Y-m-d H:i:s'),
            'price_source' => 'items_index',
        ]);
    }

    $statement = $connection->prepare(
        'SELECT
            market_hash_name,
            wear,
            currency,
            suggested_price,
            min_price,
            max_price,
            mean_price,
            median_price,
            quantity,
            item_page,
            market_page,
            recorded_at
         FROM skinport_item_snapshots
         WHERE item_id = ?
           AND batch_id = ?
         ORDER BY ' . wearSortSql()
    );
    $batchId = (string)$latestBatch['batch_id'];
    $statement->bind_param('is', $itemId, $batchId);
    $statement->execute();
    $result = $statement->get_result();

    $qualityRows = [];
    while ($row = $result->fetch_assoc()) {
        $price = preferredSkinportPrice($row);
        $qualityRows[] = [
            'wear' => $row['wear'],
            'price' => $price,
            'min_price' => $row['min_price'] !== null ? (float)$row['min_price'] : null,
            'mean_price' => $row['mean_price'] !== null ? (float)$row['mean_price'] : null,
            'median_price' => $row['median_price'] !== null ? (float)$row['median_price'] : null,
            'suggested_price' => $row['suggested_price'] !== null ? (float)$row['suggested_price'] : null,
            'quantity' => (int)$row['quantity'],
            'market_name' => $row['market_hash_name'],
        ];
    }

    if ($lookupName === '' && $qualityRows) {
        $lookupName = preg_replace(
            '/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i',
            '',
            (string)($qualityRows[0]['market_name'] ?? '')
        ) ?? '';
    }
    $qualityRows = overlaySkinportQualityFromItemsIndex($qualityRows, $lookupName);

    $marketRowSource = null;
    foreach ($qualityRows as $row) {
        if (($row['wear'] ?? '') === 'Factory New') {
            $marketRowSource = $row;
            break;
        }
        if ($marketRowSource === null) {
            $marketRowSource = $row;
        }
    }

    $skinportMarket = null;
    if ($marketRowSource !== null) {
        $finalPrice = preferredSkinportPrice($marketRowSource);
        if ($finalPrice !== null) {
            $feePct = (float)(appConfig()['skinport']['default_fee_pct'] ?? 1.0);
            $skinportMarket = [
                'name' => 'Skinport',
                'base_price' => round($finalPrice / (1 + ($feePct / 100)), 2),
                'final_price' => $finalPrice,
                'fee_pct' => $feePct,
            ];
        }
    }

    respondJson([
        'item_id' => $itemId,
        'quality_rows' => $qualityRows,
        'skinport_market' => $skinportMarket,
        'updated_at' => (string)$latestBatch['recorded_at'],
        'price_source' => 'items_index_overlay',
    ]);
} catch (Throwable $exception) {
    respondJson([
        'error' => $exception->getMessage(),
    ], 500);
}
