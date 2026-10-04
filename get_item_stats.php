<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');

$catalogPath = __DIR__ . '/assets/steam-market-cache/roi_catalog.json';

if (!is_readable($catalogPath)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'error' => 'Catalog unavailable.']);
    exit;
}

$payload = json_decode((string) file_get_contents($catalogPath), true);
$items = is_array($payload['items'] ?? null) ? $payload['items'] : [];

$counts = [];
$uniqueBase = [];

foreach ($items as $item) {
    $category = strtolower(trim((string) ($item['category'] ?? 'unknown')));
    $counts[$category] = ($counts[$category] ?? 0) + 1;

    $baseName = preg_replace('/\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i', '', (string) ($item['market_hash_name'] ?? ''));
    $baseName = preg_replace('/^(StatTrak™|Souvenir|★)\s*/u', '', $baseName);
    $baseName = trim($baseName);
    if ($baseName !== '') {
        $uniqueBase[$category][$baseName] = true;
    }
}

$labels = [
    'skins' => 'Weapon Skins',
    'knives' => 'Knives',
    'gloves' => 'Gloves',
    'stickers' => 'Stickers',
    'cases' => 'Cases',
    'agents' => 'Agents',
    'music' => 'Music Kits',
    'patches' => 'Patches',
    'graffiti' => 'Graffiti',
    'collectibles' => 'Collectibles',
    'charms' => 'Charms',
    'tools' => 'Tools',
    'keys' => 'Keys',
];

$rows = [];
foreach ($counts as $category => $count) {
    $rows[] = [
        'category' => $category,
        'label' => $labels[$category] ?? ucwords(str_replace('_', ' ', $category)),
        'listings' => $count,
        'unique_items' => count($uniqueBase[$category] ?? []),
    ];
}

usort($rows, static fn(array $a, array $b): int => $b['listings'] <=> $a['listings']);

$totalListings = array_sum($counts);
$totalUnique = array_sum(array_map(static fn(array $set): int => count($set), $uniqueBase));

echo json_encode([
    'success' => true,
    'updated_at' => $payload['updated_at'] ?? null,
    'total_listings' => $totalListings,
    'total_unique_items' => $totalUnique,
    'categories' => $rows,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
