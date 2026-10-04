<?php
declare(strict_types=1);

require __DIR__ . '/../app_bootstrap.php';

$names = [
    'Glock-18 | Block-18 (Factory New)',
    'Glock-18 | Block-18',
];

foreach ($names as $name) {
    echo "=== $name ===" . PHP_EOL;
    $cachePath = rtrim(sys_get_temp_dir(), '\\/') . DIRECTORY_SEPARATOR . 'csgo_market_activity_' . md5(strtolower('730|' . trim($name))) . '.json';
    echo "cache exists: " . (is_file($cachePath) ? 'yes' : 'no') . PHP_EOL;

    $url = sprintf(
        'https://steamcommunity.com/market/pricehistory/?appid=730&currency=3&market_hash_name=%s',
        rawurlencode($name)
    );
    try {
        $response = httpJsonRequest($url, ['User-Agent: Mozilla/5.0', 'Accept: application/json'], 25);
        $payload = $response['json'] ?? [];
        $count = is_array($payload['prices'] ?? null) ? count($payload['prices']) : 0;
        echo "api success=" . json_encode($payload['success'] ?? null) . " prices=$count" . PHP_EOL;
        if ($count > 0) {
            $first = $payload['prices'][0];
            $last = $payload['prices'][$count - 1];
            echo "first=" . json_encode($first) . PHP_EOL;
            echo "last=" . json_encode($last) . PHP_EOL;
        }
    } catch (Throwable $e) {
        echo "api error: " . $e->getMessage() . PHP_EOL;
    }
    echo PHP_EOL;
}
