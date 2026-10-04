<?php
require __DIR__ . '/../app_bootstrap.php';

function postJson(string $url, array $body): array {
    $ctx = stream_context_create(['http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/json\r\n",
        'content' => json_encode($body),
        'timeout' => 120,
    ]]);
    return json_decode((string)file_get_contents($url, false, $ctx), true) ?: [];
}

$cat = json_decode((string)file_get_contents(__DIR__ . '/../assets/steam-market-cache/roi_catalog.json'), true);
$items = array_values(array_filter($cat['items'] ?? [], fn($it) => $it['image'] && ($it['seed_sell_price'] ?? 0) > 0));
$names = array_slice(array_map(fn($it) => $it['market_hash_name'], $items), 0, 450);
$cf = postJson('http://localhost/csgo_price_tracker/get_csfloat_prices.php', [
    'market_hash_names' => $names,
    'cache_only' => false,
    'ignore_auctions' => true,
    'buy_now_only' => true,
]);
$v = 0;
$db = 0;
$other = 0;
foreach ($cf['items'] ?? [] as $r) {
    if (!empty($r['_from_db'])) {
        $db++;
    } elseif (($r['price_verified'] ?? null) !== false && ($r['current_price'] ?? 0) > 0) {
        $v++;
    } else {
        $other++;
    }
}
echo "items=" . count($cf['items'] ?? []) . " verified=$v from_db=$db other=$other\n";
