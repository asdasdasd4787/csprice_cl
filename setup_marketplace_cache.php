<?php
declare(strict_types=1);

/**
 * One-time setup script: creates the marketplace_price_cache table in local MySQL
 * and does an initial sync of White.Market prices.
 * Run once via browser: http://localhost/csgo_price_tracker/setup_marketplace_cache.php
 */

require __DIR__ . '/app_bootstrap.php';

header('Content-Type: text/plain; charset=utf-8');

try {
    $pdo = dbPdoConnection('db');
} catch (Throwable $e) {
    echo "ERROR: Cannot connect to local MySQL: " . $e->getMessage() . "\n";
    exit(1);
}

// ── Create table ─────────────────────────────────────────────────────────────

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

echo "Table marketplace_price_cache: OK\n";

// ── Sync White.Market ─────────────────────────────────────────────────────────

$config  = appConfig()['white_market'] ?? [];
$url     = trim((string)($config['export_url'] ?? 'https://export.white.market/v1/prices/730.json'));
$timeout = max(5, (int)($config['timeout_seconds'] ?? 20));

echo "Downloading White.Market export from {$url}...\n";
flush();

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => $timeout,
    CURLOPT_CONNECTTIMEOUT => min(6, $timeout),
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    CURLOPT_USERAGENT      => 'CS2MarketTracker/1.0',
]);
$body   = curl_exec($ch);
$status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);

if ($body === false || $status < 200 || $status >= 300) {
    echo "ERROR: White.Market download failed (HTTP {$status})\n";
    exit(1);
}

$export = json_decode((string)$body, true);
if (!is_array($export)) {
    echo "ERROR: White.Market returned invalid JSON\n";
    exit(1);
}

// Normalise: might be {items:[...]} or {data:[...]} or flat array
if (isset($export['items']) && is_array($export['items'])) {
    $rows = $export['items'];
} elseif (isset($export['data']) && is_array($export['data'])) {
    $rows = $export['data'];
} else {
    $rows = array_values($export);
}

echo "Parsed " . count($rows) . " rows — upserting into MySQL...\n";
flush();

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
foreach ($rows as $row) {
    if (!is_array($row)) { $skipped++; continue; }

    $name = trim((string)($row['market_hash_name'] ?? $row['name'] ?? ''));
    if ($name === '') { $skipped++; continue; }

    $price = null;
    foreach (['price', 'min_price', 'lowest_price'] as $k) {
        if (isset($row[$k]) && is_numeric($row[$k]) && (float)$row[$k] > 0) {
            $price = round((float)$row[$k], 4);
            break;
        }
    }
    if ($price === null) { $skipped++; continue; }

    $listings = isset($row['market_product_count']) && is_numeric($row['market_product_count'])
        ? (int)$row['market_product_count']
        : null;
    $marketUrl = (string)($row['market_product_link'] ?? '');

    $stmt->execute([
        ':name'     => $name,
        ':price'    => $price,
        ':listings' => $listings,
        ':url'      => $marketUrl ?: null,
    ]);
    $inserted++;
}

echo "Done. Upserted: {$inserted}  Skipped: {$skipped}\n";
echo "\nSetup complete. White.Market prices are now cached in MySQL.\n";
echo "Add a Windows Task Scheduler entry to run sync_market_prices.php daily.\n";
