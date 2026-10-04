<?php
declare(strict_types=1);

require __DIR__ . '/../app_bootstrap.php';
require __DIR__ . '/../price_cache_service.php';

$pdo = marketDataPdoConnection();
$stmt = $pdo->query(
    "SELECT market_hash_name, current_price FROM roi_prices
     WHERE source = 'steam' AND market_hash_name ILIKE '%Bayonet%Bright Water%'
     ORDER BY market_hash_name LIMIT 20"
);
foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
    echo $row['market_hash_name'] . ' => ' . $row['current_price'] . PHP_EOL;
}

echo PHP_EOL . "--- gloves ---" . PHP_EOL;
$gloves = $pdo->query(
    "SELECT market_hash_name, current_price FROM roi_prices
     WHERE source = 'steam' AND market_hash_name ILIKE '%Sport Gloves%'
     ORDER BY market_hash_name LIMIT 12"
);
foreach ($gloves->fetchAll(PDO::FETCH_ASSOC) as $row) {
    echo $row['market_hash_name'] . ' => ' . $row['current_price'] . PHP_EOL;
}
