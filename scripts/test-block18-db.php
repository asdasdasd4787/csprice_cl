<?php
declare(strict_types=1);
require __DIR__ . '/../app_bootstrap.php';

$name = 'Glock-18 | Block-18 (Factory New)';
try {
    $pdo = marketDataPdoConnection();
    $stmt = $pdo->prepare("SELECT current_price, price_history FROM roi_prices WHERE market_hash_name = ? AND source = 'steam' LIMIT 1");
    $stmt->execute([$name]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    echo "roi_prices row: " . json_encode($row ? ['price' => $row['current_price'], 'history_len' => is_string($row['price_history'] ?? null) ? strlen($row['price_history']) : 0] : null) . PHP_EOL;
    if (!empty($row['price_history'])) {
        $decoded = json_decode($row['price_history'], true);
        echo "history points: " . (is_array($decoded) ? count($decoded) : 0) . PHP_EOL;
        if (is_array($decoded) && count($decoded) > 0) {
            echo "first: " . json_encode($decoded[0]) . PHP_EOL;
            $last = $decoded[count($decoded)-1];
            echo "last: " . json_encode($last) . PHP_EOL;
        }
    }
} catch (Throwable $e) {
    echo "error: " . $e->getMessage() . PHP_EOL;
}

try {
    $pdo = marketHistoryPdoConnection();
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM price_history ph INNER JOIN items i ON i.id = ph.item_id WHERE i.market_hash_name = ?");
    $stmt->execute([$name]);
    echo "price_history count: " . $stmt->fetchColumn() . PHP_EOL;
} catch (Throwable $e) {
    echo "price_history error: " . $e->getMessage() . PHP_EOL;
}
