<?php
declare(strict_types=1);
require __DIR__ . '/app_bootstrap.php';

$weapon = trim((string)($_GET['weapon'] ?? ''));
$category = trim((string)($_GET['category'] ?? ''));
$exclude = trim((string)($_GET['exclude'] ?? ''));
$limit = max(1, min(12, (int)($_GET['limit'] ?? 4)));

$VALID_CATEGORIES = ['knives', 'gloves', 'skins', 'agents'];
$isPerWeapon = in_array($category, ['knives', 'gloves', 'skins'], true);

if (!in_array($category, $VALID_CATEGORIES, true) || ($isPerWeapon && $weapon === '')) {
    respondJson([
        'success' => false,
        'error' => 'category must be knives|gloves|skins|agents (weapon is also required for knives/gloves/skins)',
        'items' => [],
    ]);
    exit;
}

/**
 * name_color -> display rarity label. Agents use Valve's own agent-quality
 * names, which reuse the same hex palette as weapon rarities but mean
 * something different (e.g. EB4B4B is "Covert" on a skin, "Master" on an agent).
 */
function relatedFinishesRarityLabel(string $color, string $category): string
{
    $color = strtoupper(trim($color));
    if ($category === 'agents') {
        $map = [
            'EB4B4B' => 'Master',
            'D32CE6' => 'Superior',
            '8847FF' => 'Exceptional',
            '4B69FF' => 'Distinguished',
        ];
        return $map[$color] ?? 'Distinguished';
    }

    $map = [
        'E4AE39' => 'Contraband',
        'EB4B4B' => 'Covert',
        'D32CE6' => 'Classified',
        '8847FF' => 'Restricted',
        '4B69FF' => 'Mil-Spec',
        '5E98D9' => 'Industrial Grade',
        'B0C3D9' => 'Consumer Grade',
    ];
    return $map[$color] ?? 'Consumer Grade';
}

function relatedFinishesIndexPath(string $category): string
{
    return __DIR__ . '/assets/steam-market-cache/_related_finishes_' . $category . '.json';
}

/**
 * One row per finish/agent. Knives/gloves/skins are seeded as a single
 * representative wear per finish ("★ Weapon | Finish (Wear)" or, for plain
 * skins, "Weapon | Finish (Wear)"); agents have no wear or star prefix at
 * all ("Name | Faction").
 *
 * @return list<array<string, mixed>>
 */
function relatedFinishesBuildIndex(string $category): array
{
    $catalogFile = __DIR__ . '/assets/steam-market-cache/roi_catalog.json';
    if (!is_file($catalogFile)) {
        return [];
    }

    $decoded = json_decode((string)file_get_contents($catalogFile), true);
    $items = is_array($decoded['items'] ?? null) ? $decoded['items'] : [];

    $out = [];
    foreach ($items as $item) {
        if (!is_array($item) || (string)($item['category'] ?? '') !== $category) {
            continue;
        }

        $name = trim((string)($item['market_hash_name'] ?? ''));
        if ($name === '') {
            continue;
        }

        $core = str_starts_with($name, "\u{2605} ") ? mb_substr($name, 2) : $name;
        $core = trim(preg_replace(
            '/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i',
            '',
            $core
        ) ?? '');
        $parts = array_map('trim', explode('|', $core, 2));
        if (count($parts) < 2 || $parts[0] === '' || $parts[1] === '') {
            continue;
        }

        $baseName = str_starts_with($name, "\u{2605} ") ? ("\u{2605} " . $core) : $core;
        $rawColor = strtoupper(trim((string)($item['name_color'] ?? '')));
        $out[] = [
            'weapon' => $parts[0],
            'finish' => $parts[1],
            'market_hash_name' => $name,
            'base_name' => $baseName,
            'display_name' => (string)($item['display_name'] ?? $core),
            'image' => (string)($item['image'] ?? ''),
            'rarity_label' => relatedFinishesRarityLabel($rawColor, $category),
            'rarity_hex' => $rawColor !== '' ? $rawColor : '94A3B8',
            'price' => is_numeric($item['seed_sell_price'] ?? null) ? (float)$item['seed_sell_price'] : null,
            'listings' => is_numeric($item['seed_sell_listings'] ?? null) ? (int)$item['seed_sell_listings'] : 0,
        ];
    }

    return $out;
}

/** @return list<array<string, mixed>> */
function relatedFinishesLoadIndex(string $category): array
{
    $path = relatedFinishesIndexPath($category);
    $catalogFile = __DIR__ . '/assets/steam-market-cache/roi_catalog.json';
    $catalogMtime = is_file($catalogFile) ? (int)filemtime($catalogFile) : 0;

    if (is_file($path) && (int)filemtime($path) >= $catalogMtime) {
        $decoded = json_decode((string)file_get_contents($path), true);
        if (is_array($decoded)) {
            return $decoded;
        }
    }

    $index = relatedFinishesBuildIndex($category);
    @file_put_contents($path, json_encode($index));
    return $index;
}

$index = relatedFinishesLoadIndex($category);
$excludeKey = mb_strtolower($exclude);

if ($isPerWeapon) {
    $weaponKey = mb_strtolower($weapon);
    $matches = array_values(array_filter($index, static function (array $row) use ($weaponKey, $excludeKey): bool {
        if (mb_strtolower((string)$row['weapon']) !== $weaponKey) {
            return false;
        }
        return $excludeKey === '' || mb_strtolower((string)$row['base_name']) !== $excludeKey;
    }));
} else {
    // Agents: no per-character "finish" concept, just other agents overall.
    $matches = array_values(array_filter($index, static function (array $row) use ($excludeKey): bool {
        return $excludeKey === '' || mb_strtolower((string)$row['base_name']) !== $excludeKey;
    }));
}

usort($matches, static fn(array $a, array $b): int => ($b['price'] ?? 0) <=> ($a['price'] ?? 0));

respondJson([
    'success' => true,
    'weapon' => $weapon,
    'category' => $category,
    'items' => array_slice($matches, 0, $limit),
]);
