<?php
require __DIR__ . '/../app_bootstrap.php';
require __DIR__ . '/../get_roi_prices_cached.php';

$name = '★ Navaja Knife | Doppler (Factory New)';
$apiName = cachedResolveWearMarketName($name);
echo "apiName=$apiName\n";

$cfg = appConfig()['skinport'] ?? [];
$clientId = trim((string)($cfg['client_id'] ?? ''));
$clientSecret = trim((string)($cfg['client_secret'] ?? ''));
$authHeader = ($clientId !== '' && $clientSecret !== '') ? base64_encode($clientId . ':' . $clientSecret) : '';
$headers = ['Accept: application/json', 'Accept-Encoding: gzip'];
if ($authHeader) $headers[] = 'Authorization: Basic ' . $authHeader;

$ch = curl_init('https://api.skinport.com/v1/items?app_id=730&currency=EUR&tradable=0');
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60, CURLOPT_HTTPHEADER => $headers, CURLOPT_ENCODING => '']);
$body = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);
echo "http=$code len=" . strlen((string)$body) . "\n";
$items = json_decode((string)$body, true);
if (!is_array($items)) {
    echo substr((string)$body, 0, 200) . "\n";
    exit(1);
}
echo "total items=" . count($items) . "\n";
foreach ($items as $row) {
    if (!is_array($row)) continue;
    $n = (string)($row['market_hash_name'] ?? '');
    if (stripos($n, 'Navaja') !== false && stripos($n, 'Doppler') !== false) {
        echo json_encode([
            'name' => $n,
            'min' => $row['min_price'] ?? null,
            'median' => $row['median_price'] ?? null,
            'qty' => $row['quantity'] ?? null,
        ], JSON_UNESCAPED_UNICODE) . "\n";
    }
}
