<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';
if (!defined('STEAM_WEAR_LIB_ONLY')) {
    define('STEAM_WEAR_LIB_ONLY', true);
}
require_once __DIR__ . '/get_steam_wear_prices.php';

function ensureSteamAnalystPricesTable(PDO $connection): void
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
        $connection->exec('CREATE INDEX idx_item_recorded ON steam_analyst_prices (item_id, recorded_at)');

        return;
    }

    $connection->exec(
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

try {
    $connection = marketHistoryPdoConnection();
    $requestedItemId = isset($_GET['item_id']) ? (int)$_GET['item_id'] : 1;
    $lookupName = trim((string)($_GET['lookup_name'] ?? ''));
    $itemId = resolveDataDbItemId($connection, $requestedItemId, $lookupName);
    ensureSteamAnalystPricesTable($connection);

    $statement = $connection->prepare(
        'SELECT wear, price, volume, market_name, recorded_at
         FROM steam_analyst_prices
         WHERE item_id = :item_id
         ORDER BY ' . dbWearOrderSql('wear')
    );
    $statement->execute([':item_id' => $itemId]);

    $qualityRows = [];
    $latestSteam = null;
    $updatedAt = '';

    foreach ($statement->fetchAll() as $row) {
        $qualityRows[] = [
            'wear' => $row['wear'],
            'price' => (float)$row['price'],
            'volume' => (int)$row['volume'],
            'market_name' => $row['market_name'],
        ];

        if ($row['wear'] === 'Factory New') {
            $finalPrice = (float)$row['price'];
            $latestSteam = [
                'name' => 'Steam Market',
                'base_price' => round($finalPrice / 1.15, 2),
                'final_price' => $finalPrice,
                'fee_pct' => 15.0,
            ];
        }

        if ($row['recorded_at'] > $updatedAt) {
            $updatedAt = $row['recorded_at'];
        }
    }

    // ── StatTrak™ prices: matched by the exact StatTrak market_hash_name in
    //    roi_prices (source=steam). Only real listings are returned; missing
    //    variants stay absent so the UI shows "—" rather than a placeholder.
    $baseName = $lookupName;
    if (preg_match('/^(.*)\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i', $lookupName, $m)) {
        $baseName = trim($m[1]);
    }
    if (function_exists('steamWearEnsureStarPrefix')) {
        $baseName = steamWearEnsureStarPrefix($baseName);
    }
    if ($baseName !== '' && $qualityRows) {
        $stNameToWear = [];
        foreach ($qualityRows as $qr) {
            $stName = steamStatTrakMarketName($baseName, (string)$qr['wear']);
            $stNameToWear[$stName] = $qr['wear'];
        }
        try {
            $placeholders = implode(',', array_fill(0, count($stNameToWear), '?'));
            $stStmt = $connection->prepare(
                "SELECT market_hash_name, current_price FROM roi_prices
                 WHERE source = 'steam' AND market_hash_name IN ({$placeholders})"
            );
            $stStmt->execute(array_keys($stNameToWear));
            $stByWear = [];
            foreach ($stStmt->fetchAll(PDO::FETCH_ASSOC) as $stRow) {
                $w = $stNameToWear[(string)$stRow['market_hash_name']] ?? null;
                if ($w !== null && (float)$stRow['current_price'] > 0) {
                    $stByWear[$w] = round((float)$stRow['current_price'], 2);
                }
            }
            foreach ($qualityRows as $i => $qr) {
                $qualityRows[$i]['stattrak'] = $stByWear[$qr['wear']] ?? null;
            }
        } catch (Throwable) {
            // roi_prices unavailable — leave stattrak absent (UI shows "—").
        }
    }

    respondJson([
        'item_id' => $itemId,
        'quality_rows' => $qualityRows,
        'steam_market' => $latestSteam,
        'updated_at' => $updatedAt,
    ]);
} catch (Throwable $exception) {
    respondJson([
        'error' => $exception->getMessage(),
    ], 500);
}
