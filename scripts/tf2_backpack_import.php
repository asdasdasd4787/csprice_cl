<?php
declare(strict_types=1);
/**
 * Imports backpack.tf community prices (refined metal) for the TF2
 * inventory's metal fallback (tf2_inventory_helpers.php):
 *
 *   php scripts/tf2_backpack_import.php
 *
 * Needs a backpack.tf API key (https://backpack.tf/developer/apikey/view),
 * read from the BACKPACKTF_API_KEY environment variable or the 'backpacktf'
 * => ['api_key' => ...] section of config.local.php. Never put the key in
 * this file. Writes assets/data/tf2/backpack-prices.json:
 *   { fetched_at, key_ref, prices: { "<quality>|<craftable 1/0>|<name>": ref } }
 * Unusual prices are skipped (they are per effect and the index has them
 * from the markets already).
 */

require __DIR__ . '/../app_bootstrap.php';

$key = trim((string)getenv('BACKPACKTF_API_KEY'));
if ($key === '') {
    $config = appConfig();
    $key = trim((string)($config['backpacktf']['api_key'] ?? ''));
}
if ($key === '') {
    fwrite(STDERR, "No backpack.tf API key: set BACKPACKTF_API_KEY or config.local.php ['backpacktf']['api_key'].\n");
    exit(2);
}

$url = 'https://backpack.tf/api/IGetPrices/v4?raw=1&since=0&key=' . rawurlencode($key);
$response = httpJsonRequest($url, ['Accept: application/json', 'User-Agent: tf2price.eu importer'], 120);
$body = json_decode((string)($response['body'] ?? ''), true);
$data = is_array($body['response'] ?? null) ? $body['response'] : null;
if ((int)($response['status'] ?? 0) !== 200 || !$data || (int)($data['success'] ?? 0) !== 1) {
    fwrite(STDERR, 'backpack.tf request failed: HTTP ' . (int)($response['status'] ?? 0) . ' ' . (string)($data['message'] ?? '') . "\n");
    exit(1);
}

$qualities = [
    '0' => 'normal', '1' => 'genuine', '3' => 'vintage', '5' => 'unusual', '6' => 'unique', '7' => 'community',
    '8' => 'valve', '9' => 'self-made', '11' => 'strange', '13' => 'haunted', '14' => "collector's", '15' => 'decorated weapon',
];
$keyRef = 0.0;
$prices = [];
foreach ((array)($data['items'] ?? []) as $name => $item) {
    foreach ((array)($item['prices'] ?? []) as $qualityId => $byTradable) {
        $quality = $qualities[(string)$qualityId] ?? null;
        if ($quality === null || $quality === 'unusual') {
            continue;
        }
        foreach ((array)($byTradable['Tradable'] ?? []) as $craftKey => $entries) {
            $craftable = strtolower((string)$craftKey) === 'craftable' ? '1' : '0';
            $entry = is_array($entries) ? ($entries[0] ?? reset($entries)) : null;
            if (!is_array($entry)) {
                continue;
            }
            $ref = null;
            if (is_numeric($entry['value_raw'] ?? null)) {
                $ref = (float)$entry['value_raw'];
            } elseif (($entry['currency'] ?? '') === 'metal' && is_numeric($entry['value'] ?? null)) {
                $ref = (float)$entry['value'];
            }
            if ($ref === null || $ref <= 0) {
                continue;
            }
            $prices[$quality . '|' . $craftable . '|' . mb_strtolower((string)$name)] = round($ref, 2);
            if ((string)$name === 'Mann Co. Supply Crate Key' && $quality === 'unique' && $craftable === '1') {
                $keyRef = round($ref, 2);
            }
        }
    }
}
if (!$prices) {
    fwrite(STDERR, "backpack.tf returned no usable prices.\n");
    exit(1);
}
$out = __DIR__ . '/../assets/data/tf2/backpack-prices.json';
file_put_contents($out, json_encode([
    'fetched_at' => gmdate('c'),
    'key_ref' => $keyRef,
    'prices' => $prices,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
echo count($prices), " prices written to ", basename($out), " (key = ", $keyRef, " ref)\n";
