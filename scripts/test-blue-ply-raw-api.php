<?php
declare(strict_types=1);

require_once __DIR__ . '/../steam_auth_helpers.php';

$name = 'Desert Eagle | Blue Ply (Factory New)';
$url = sprintf(
    'https://steamcommunity.com/market/pricehistory/?appid=730&currency=3&market_hash_name=%s',
    730,
    3,
    rawurlencode($name)
);
$url = steamPriceHistoryApiUrl($name);

try {
    $response = httpJsonRequest(
        $url,
        ['User-Agent: Mozilla/5.0', 'Accept: application/json, text/javascript, */*'],
        25
    );
    $payload = $response['json'] ?? [];
    echo 'success=' . json_encode($payload['success'] ?? null) . PHP_EOL;
    $prices = $payload['prices'] ?? [];
    echo 'count=' . count($prices) . PHP_EOL;
    if (count($prices) >= 3) {
        foreach ([0, 1, 2, count($prices) - 3, count($prices) - 2, count($prices) - 1] as $i) {
            $entry = $prices[$i];
            echo "[$i] " . json_encode($entry) . PHP_EOL;
        }
    }
} catch (Throwable $e) {
    echo 'error=' . $e->getMessage() . PHP_EOL;
}
