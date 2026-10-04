<?php
declare(strict_types=1);

/**
 * Daily sync: refresh marketplace_price_cache from White.Market export.
 * Task Scheduler: php C:\xampp\htdocs\csgo_price_tracker\sync_market_prices.php
 * Or browser:     http://localhost/csgo_price_tracker/sync_market_prices.php
 */

require __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/white_market_history_lib.php';

if (PHP_SAPI !== 'cli') {
    header('Content-Type: text/plain; charset=utf-8');
}

set_time_limit(120);

function syncLog(string $msg): void
{
    echo $msg . "\n";
    if (PHP_SAPI !== 'cli') {
        flush();
    }
}

// ── Connect ───────────────────────────────────────────────────────────────────

try {
    $pdo = dbPdoConnection('db');
} catch (Throwable $e) {
    syncLog("ERROR: DB connection failed: " . $e->getMessage());
    exit(1);
}

// Ensure table exists (idempotent)
$pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS marketplace_price_cache (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  market_hash_name VARCHAR(512) NOT NULL,
  marketplace     VARCHAR(64)  NOT NULL,
  price           DECIMAL(10,4) NOT NULL,
  listings        INT          DEFAULT NULL,
  market_url      VARCHAR(2048) DEFAULT NULL,
  updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_item_market (market_hash_name(255), marketplace)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
SQL);

// ── White.Market ──────────────────────────────────────────────────────────────

$wmConfig  = appConfig()['white_market'] ?? [];
$wmUrl     = trim((string)($wmConfig['export_url'] ?? 'https://export.white.market/v1/prices/730.json'));
$wmTimeout = max(5, (int)($wmConfig['timeout_seconds'] ?? 20));
$usdToEur  = whiteMarketUsdToEurRate();
$cacheDir  = __DIR__ . '/assets/white-market-cache';
$cacheFile = $cacheDir . '/prices_730.json';

syncLog("[White.Market] Downloading export…");

$ch = curl_init($wmUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => $wmTimeout,
    CURLOPT_CONNECTTIMEOUT => min(6, $wmTimeout),
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    CURLOPT_USERAGENT      => 'CS2MarketTracker/1.0',
]);
$body   = curl_exec($ch);
$status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);

if ($body !== false && $status >= 200 && $status < 300) {
    $export = json_decode((string)$body, true);
    if (is_array($export)) {
        // Also update file cache
        if (!is_dir($cacheDir)) {
            mkdir($cacheDir, 0755, true);
        }
        file_put_contents($cacheFile, (string)json_encode($export));

        if (isset($export['items']) && is_array($export['items'])) {
            $wmRows = $export['items'];
        } elseif (isset($export['data']) && is_array($export['data'])) {
            $wmRows = $export['data'];
        } else {
            $wmRows = array_values($export);
        }

        $stmt = $pdo->prepare(<<<SQL
INSERT INTO marketplace_price_cache
    (market_hash_name, marketplace, price, listings, market_url)
VALUES
    (:name, 'white_market', :price, :listings, :url)
ON DUPLICATE KEY UPDATE
    price      = VALUES(price),
    listings   = VALUES(listings),
    market_url = VALUES(market_url),
    updated_at = CURRENT_TIMESTAMP
SQL);

        $inserted = 0;
        $skipped  = 0;
        foreach ($wmRows as $row) {
            if (!is_array($row)) { $skipped++; continue; }
            $name = trim((string)($row['market_hash_name'] ?? $row['name'] ?? ''));
            if ($name === '') { $skipped++; continue; }
            $price = null;
            foreach (['price', 'min_price', 'lowest_price'] as $k) {
                if (isset($row[$k]) && is_numeric($row[$k]) && (float)$row[$k] > 0) {
                    $price = whiteMarketExportPriceToEur((float)$row[$k], $usdToEur);
                    break;
                }
            }
            if ($price === null || $price <= 0) { $skipped++; continue; }
            $listings  = isset($row['market_product_count']) && is_numeric($row['market_product_count'])
                ? (int)$row['market_product_count'] : null;
            $marketUrl = (string)($row['market_product_link'] ?? '');
            $stmt->execute([
                ':name'     => $name,
                ':price'    => $price,
                ':listings' => $listings,
                ':url'      => $marketUrl ?: null,
            ]);
            $inserted++;
        }
        syncLog("[White.Market] Upserted {$inserted}, skipped {$skipped}");
    } else {
        syncLog("[White.Market] ERROR: invalid JSON response");
    }
} else {
    syncLog("[White.Market] ERROR: HTTP {$status} — skipped");
}

syncLog("Sync complete: " . date('Y-m-d H:i:s'));
