<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';
require __DIR__ . '/lib/craft_econ_lookup.php';

$raw = (string)file_get_contents('php://input');
$payload = json_decode($raw, true);
if (!is_array($payload)) {
    $payload = $_GET;
}

$skinName = trim((string)($payload['skin_market_hash_name'] ?? $payload['skin'] ?? ''));
$stickerNames = [];
foreach ((array)($payload['sticker_market_hash_names'] ?? $payload['stickers'] ?? []) as $name) {
    $label = trim((string)$name);
    if ($label !== '') {
        $stickerNames[] = $label;
    }
}
$keychainNames = [];
foreach ((array)($payload['keychain_market_hash_names'] ?? $payload['keychains'] ?? []) as $name) {
    $label = trim((string)$name);
    if ($label !== '') {
        $keychainNames[] = $label;
    }
}

if ($skinName === '') {
    respondJson([
        'success' => false,
        'error' => 'skin_market_hash_name is required',
    ]);
    exit;
}

$bundle = resolveCraftEconBundle($skinName, $stickerNames, $keychainNames);
$lookup = loadCraftEconLookup();

respondJson([
    'success' => (bool)$bundle['skin'],
    'skin_market_hash_name' => $skinName,
    'skin' => $bundle['skin'],
    'stickers' => $bundle['stickers'],
    'missing_stickers' => $bundle['missing_stickers'],
    'keychains' => $bundle['keychains'] ?? [],
    'missing_keychains' => $bundle['missing_keychains'] ?? [],
    'lookup_ready' => is_file(craftEconLookupPath()),
    'lookup_counts' => [
        'skins' => is_array($lookup['skins'] ?? null) ? count($lookup['skins']) : 0,
        'stickers' => is_array($lookup['stickers'] ?? null) ? count($lookup['stickers']) : 0,
        'keychains' => is_array($lookup['keychains'] ?? null) ? count($lookup['keychains']) : 0,
    ],
    'error' => $bundle['skin'] ? null : 'Skin not found in craft econ lookup',
]);
