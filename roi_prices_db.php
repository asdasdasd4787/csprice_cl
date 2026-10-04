<?php
declare(strict_types=1);

/**
 * Shared PostgreSQL (Supabase) helpers for the roi_prices cache table that
 * powers the Deals page and the Market explorer.
 *
 * roi_prices is read by get_roi_prices_cached.php and written by the sync
 * scripts (sync_roi_prices.php = Steam, sync_provider_prices.php = Skinport /
 * DMarket / White.Market). One row per (market_hash_name, source).
 */

function roiPricesEnsureTable(PDO $pdo): void
{
    $pdo->exec(<<<'SQL'
        CREATE TABLE IF NOT EXISTS roi_prices (
            market_hash_name TEXT          NOT NULL,
            source           TEXT          NOT NULL DEFAULT 'steam',
            current_price    NUMERIC(12,4),
            sell_orders      INTEGER,
            buy_orders       INTEGER,
            price_history    TEXT,
            market_url       TEXT,
            updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
            CONSTRAINT pk_roi_prices PRIMARY KEY (market_hash_name, source)
        )
    SQL);
    $pdo->exec('ALTER TABLE roi_prices ADD COLUMN IF NOT EXISTS market_url TEXT');
    $pdo->exec('CREATE INDEX IF NOT EXISTS ix_roi_prices_source_updated ON roi_prices (source, updated_at)');
}

function roiPricesUpsert(PDO $pdo, array $row): void
{
    $price = $row['current_price'] ?? null;
    if (!is_numeric($price) || (float)$price <= 0) {
        return;
    }

    $history = $row['price_history'] ?? $row['history'] ?? null;
    if (is_array($history)) {
        $history = $history ? json_encode($history, JSON_UNESCAPED_SLASHES) : null;
    }

    static $stmt = null;
    if ($stmt === null || !($stmt instanceof PDOStatement)) {
        $stmt = $pdo->prepare(<<<'SQL'
            INSERT INTO roi_prices
                (market_hash_name, source, current_price, sell_orders, buy_orders, price_history, market_url, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, now())
            ON CONFLICT (market_hash_name, source) DO UPDATE SET
                current_price = EXCLUDED.current_price,
                sell_orders   = EXCLUDED.sell_orders,
                buy_orders    = EXCLUDED.buy_orders,
                price_history = COALESCE(EXCLUDED.price_history, roi_prices.price_history),
                market_url    = COALESCE(EXCLUDED.market_url, roi_prices.market_url),
                updated_at    = now()
        SQL);
    }

    $stmt->execute([
        (string)$row['market_hash_name'],
        (string)$row['source'],
        round((float)$price, 4),
        isset($row['sell_orders']) && is_numeric($row['sell_orders']) ? (int)$row['sell_orders'] : null,
        isset($row['buy_orders'])  && is_numeric($row['buy_orders'])  ? (int)$row['buy_orders']  : null,
        $history !== '' ? $history : null,
        isset($row['market_url']) && $row['market_url'] !== '' ? (string)$row['market_url'] : null,
    ]);
}

/** Names already synced for $source within $staleHours (skip-list for incremental runs). */
function roiPricesFreshNames(PDO $pdo, string $source, int $staleHours): array
{
    $stmt = $pdo->prepare(
        'SELECT market_hash_name FROM roi_prices
         WHERE source = ? AND updated_at >= now() - (? * interval \'1 hour\')'
    );
    $stmt->execute([$source, $staleHours]);
    return array_fill_keys($stmt->fetchAll(PDO::FETCH_COLUMN), true);
}
