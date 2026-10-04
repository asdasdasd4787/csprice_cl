<?php
declare(strict_types=1);

require_once __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/sync_steam_item_images.php';
require_once __DIR__ . '/sync_steam_market_catalog.php';

const ROI_CATALOG_OUTPUT = STEAM_IMAGE_CACHE_DIR . '/roi_catalog.json';
const BYMYKEL_API_BASE = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/';
const CSROI_PRICING_URL = 'https://csroi.com/pricing.json';
const ROI_ALLOWED_MARKET_CATEGORIES = [
    'skins',
    'cases',
    'stickers',
    'knives',
    'gloves',
    'agents',
    'patches',
    'music',
    'graffiti',
    'collectibles',
    'charms',
    'tools',
    'other',
];
const ROI_INVENTORY_CATEGORY_MAP = [
    'agents' => ['category' => 'agents', 'label' => 'Agents'],
    'collectibles' => ['category' => 'collectibles', 'label' => 'Collectibles'],
    'crates' => ['category' => 'cases', 'label' => 'Cases'],
    'graffiti' => ['category' => 'graffiti', 'label' => 'Graffiti'],
    'highlights' => ['category' => 'charms', 'label' => 'Highlights'],
    'keychains' => ['category' => 'charms', 'label' => 'Charms'],
    'keys' => ['category' => 'tools', 'label' => 'Tools'],
    'music_kits' => ['category' => 'music', 'label' => 'Music Kits'],
    'patches' => ['category' => 'patches', 'label' => 'Patches'],
    'sticker_slabs' => ['category' => 'charms', 'label' => 'Charms'],
    'stickers' => ['category' => 'stickers', 'label' => 'Stickers'],
    'tools' => ['category' => 'tools', 'label' => 'Tools'],
];

function roiNormalizeKey(string $value): string
{
    return strtolower(trim($value));
}

function roiVariantMeta(string $marketHashName): array
{
    $name = trim($marketHashName);
    $isSouvenir = str_starts_with($name, 'Souvenir ');
    if ($isSouvenir) {
        $name = substr($name, strlen('Souvenir '));
    }

    $isStatTrak = str_starts_with($name, 'StatTrak™ ');
    if ($isStatTrak) {
        $name = substr($name, strlen('StatTrak™ '));
    }

    $wear = '';
    if (preg_match('/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/', $name, $matches)) {
        $wear = trim((string)$matches[1]);
    }

    return [
        'base_name' => roiStripWear($name),
        'wear' => $wear,
        'is_stattrak' => $isStatTrak,
        'is_souvenir' => $isSouvenir,
    ];
}

function roiSeedQuoteFromPricing(array $quotes): array
{
    $price = null;
    foreach ([
        $quotes['steam']['last_24h'] ?? null,
        $quotes['skinport']['suggested_price'] ?? null,
        $quotes['skinport']['starting_at'] ?? null,
        $quotes['csfloat']['starting_at'] ?? null,
    ] as $candidate) {
        if (is_numeric($candidate) && (float)$candidate > 0) {
            $price = round((float)$candidate, 2);
            break;
        }
    }

    $listings = null;
    foreach ([
        $quotes['steam']['num_listings'] ?? null,
        $quotes['csfloat']['num_listings'] ?? null,
        $quotes['youpin']['num_listings'] ?? null,
    ] as $candidate) {
        if (is_numeric($candidate) && (int)$candidate >= 0) {
            $listings = (int)$candidate;
            break;
        }
    }

    return [
        'price' => $price,
        'listings' => $listings,
    ];
}

function roiFetchPricingRows(): array
{
    $payload = steamImageFetchJson(CSROI_PRICING_URL, 120);
    $rows = [];

    foreach ($payload as $marketHashName => $quotes) {
        if (!is_string($marketHashName) || !is_array($quotes)) {
            continue;
        }

        $trimmed = trim($marketHashName);
        if ($trimmed === '') {
            continue;
        }

        $rows[] = [
            'market_hash_name' => $trimmed,
            'quotes' => $quotes,
        ];
    }

    return $rows;
}

function roiCatalogEntryKey(array $entry): string
{
    return roiNormalizeKey((string)($entry['market_hash_name'] ?? ''));
}

function roiCatalogBaseKey(string $marketHashName): string
{
    return roiNormalizeKey(roiVariantMeta($marketHashName)['base_name']);
}

function roiPickBetterBaseEntry(array $candidate, array $current): bool
{
    $candidateMeta = roiVariantMeta((string)($candidate['market_hash_name'] ?? ''));
    $currentMeta = roiVariantMeta((string)($current['market_hash_name'] ?? ''));

    $candidatePenalty = ($candidateMeta['is_stattrak'] ? 10 : 0) + ($candidateMeta['is_souvenir'] ? 5 : 0) + roiWearRank((string)$candidateMeta['wear']);
    $currentPenalty = ($currentMeta['is_stattrak'] ? 10 : 0) + ($currentMeta['is_souvenir'] ? 5 : 0) + roiWearRank((string)$currentMeta['wear']);

    if ($candidatePenalty !== $currentPenalty) {
        return $candidatePenalty < $currentPenalty;
    }

    return strcasecmp((string)($candidate['market_hash_name'] ?? ''), (string)($current['market_hash_name'] ?? '')) < 0;
}

function roiIndexCatalogEntries(array $entries): array
{
    $exact = [];
    $base = [];

    foreach ($entries as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $marketHashName = trim((string)($entry['market_hash_name'] ?? ''));
        if ($marketHashName === '') {
            continue;
        }

        $exact[roiCatalogEntryKey($entry)] = $entry;
        $baseKey = roiCatalogBaseKey($marketHashName);
        if (!isset($base[$baseKey]) || roiPickBetterBaseEntry($entry, $base[$baseKey])) {
            $base[$baseKey] = $entry;
        }
    }

    return ['exact' => $exact, 'base' => $base];
}

function roiCategoryLabel(string $category): string
{
    return match ($category) {
        'skins' => 'Weapon Skins',
        'cases' => 'Cases',
        'stickers' => 'Stickers',
        'agents' => 'Agents',
        'patches' => 'Patches',
        'music' => 'Music Kits',
        'collectibles' => 'Collectibles',
        'graffiti' => 'Graffiti',
        'charms' => 'Charms',
        'tools' => 'Tools',
        'knives' => 'Weapon Skins',
        'gloves' => 'Weapon Skins',
        default => 'Other Items',
    };
}

function roiDropdownTypeId(string $category): string
{
    return match ($category) {
        'skins', 'knives', 'gloves' => 'skins',
        'cases' => 'cases',
        'stickers' => 'stickers',
        'agents' => 'agents',
        'patches' => 'patches',
        'music' => 'music',
        'collectibles', 'graffiti' => 'collectibles',
        'charms' => 'charms',
        'tools' => 'tools',
        default => 'all',
    };
}

function roiCasesScopeSubgroups(): array
{
    return ['cases', 'capsules', 'stickers', 'charms', 'souvenirs', 'patches', 'music', 'pins', 'graffiti', 'coins', 'medals', 'operations', 'storage', 'other'];
}

function roiIsSellablePin(string $marketHashName): bool
{
    return (bool) preg_match('/\bPin$/u', trim($marketHashName));
}

function roiIsOperationStar(string $marketHashName): bool
{
    return (bool) preg_match('/\d+\s+Stars?\s+for\s+Operation/i', trim($marketHashName));
}

function roiIsTournamentMedal(string $marketHashName): bool
{
    return (bool) preg_match('/\b(Champion|Finalist|Semifinalist|Quarterfinalist|Participant)\s+at\b/i', trim($marketHashName));
}

function roiIsStickerSlab(string $marketHashName): bool
{
    return str_starts_with(trim($marketHashName), 'Sticker Slab |');
}

function roiIsCharmItem(string $marketHashName): bool
{
    $name = trim($marketHashName);
    if ($name === '') {
        return false;
    }
    if (roiIsStickerSlab($name)) {
        return true;
    }
    return str_starts_with($name, 'Charm |')
        || str_starts_with($name, 'Souvenir Charm |');
}

function roiIsCaseKey(string $marketHashName): bool
{
    return (bool) preg_match('/\sKey$/u', trim($marketHashName));
}

function roiIsCapsuleContainer(string $marketHashName): bool
{
    $name = trim($marketHashName);
    $lower = strtolower($name);
    if ($name === '') {
        return false;
    }
    if (str_starts_with($name, 'Sticker |') || str_starts_with($name, 'Sticker Slab |')) {
        return false;
    }
    if (str_contains($lower, 'autograph capsule') || str_contains($lower, 'capsule')) {
        return true;
    }
    if (str_contains($lower, 'sticker collection')) {
        return true;
    }

    return (bool) preg_match('/\b(challengers?|legends?|contenders?|champions?)\b/', $lower);
}

function roiIsNonMarketableTrophy(string $marketHashName): bool
{
    return (bool) preg_match(
        "/Pick'Em Trophy|Fantasy Trophy|Premier Season (One|Two|Three|Four) Medal|\\d{4} Service Medal|Global Offensive Badge|Loyalty Badge/i",
        trim($marketHashName)
    );
}

function roiSouvenirMapPattern(): string
{
    static $pattern = null;
    if ($pattern === null) {
        $maps = [
            'Ancient', 'Anubis', 'Dust II', 'Inferno', 'Mirage', 'Nuke', 'Overpass', 'Train', 'Vertigo',
            'Cobblestone', 'Cache', 'Office', 'Italy', 'Aztec', 'Canals', 'Biome', 'Black Gold', 'Season',
            'Sugarcane', 'Lake', 'Safehouse', 'Bazaar', 'Shortdust', 'Engage', 'Basalt', 'Insert', 'Thrill',
            'Thera', 'Palacio', 'Memento', 'Assembly', 'Agency', 'Ali', 'Alpine', 'Abbey', 'Apollo',
            'Blacksite', 'Breach', 'Climb', 'Edin', 'Ember', 'Farm', 'Gulag', 'Jungle', 'Marquis', 'Mocha',
            'Museum', 'Ravine', 'Rialto', 'Rooster', 'Sanctum', 'Scar', 'Shoots', 'Stadium', 'Studio', 'Subzero', 'Zoo',
        ];
        $pattern = '/\b(' . implode('|', array_map(static fn(string $map): string => preg_quote($map, '/'), $maps)) . ')\s+Souvenir Package$/iu';
    }

    return $pattern;
}

function roiIsSouvenirTokenItem(string $marketHashName): bool
{
    return (bool) preg_match('/\bSouvenir Token$/u', trim($marketHashName));
}

function roiIsGenericSouvenirPackage(string $marketHashName): bool
{
    $name = trim($marketHashName);
    if (!preg_match('/ Souvenir Package$/u', $name)) {
        return false;
    }
    if (preg_match('/\bHighlight\s+Souvenir Package$/iu', $name)) {
        return false;
    }

    return !preg_match(roiSouvenirMapPattern(), $name);
}

function roiIsCatalogTokenItem(string $marketHashName): bool
{
    return roiIsSouvenirTokenItem($marketHashName) || roiIsGenericSouvenirPackage($marketHashName);
}

function roiInferCategoryFromName(string $marketHashName): array
{
    $name = trim($marketHashName);
    $lower = strtolower($name);

    if (str_contains($name, ' | ')) {
        if (str_starts_with($name, 'Sticker Slab |')) {
            return ['category' => 'charms', 'label' => 'Charms'];
        }
        if (str_starts_with($name, 'Sticker |')) {
            return ['category' => 'stickers', 'label' => 'Stickers'];
        }
        if (str_starts_with($name, 'Patch |')) {
            return ['category' => 'patches', 'label' => 'Patches'];
        }
        if (str_starts_with($name, 'Music Kit |')) {
            return ['category' => 'music', 'label' => 'Music Kits'];
        }
        if (str_starts_with($name, 'Charm |') || str_starts_with($name, 'Souvenir Charm |')) {
            return ['category' => 'charms', 'label' => 'Charms'];
        }
        return ['category' => 'skins', 'label' => 'Weapon Skins'];
    }

    if (str_contains($lower, 'sticker collection') || str_contains($lower, 'storage unit')) {
        return ['category' => 'stickers', 'label' => 'Stickers'];
    }
    if (str_contains($lower, 'patch collection') || str_contains($lower, 'skill group patch')) {
        return ['category' => 'patches', 'label' => 'Patches'];
    }
    if (str_contains($lower, 'graffiti')) {
        return ['category' => 'graffiti', 'label' => 'Graffiti'];
    }
    if (str_contains($lower, 'patch')) {
        return ['category' => 'patches', 'label' => 'Patches'];
    }
    if (str_contains($lower, 'music kit')) {
        return ['category' => 'music', 'label' => 'Music Kits'];
    }
    if (str_contains($lower, 'coin') || str_contains($lower, 'pin')) {
        return ['category' => 'collectibles', 'label' => 'Collectibles'];
    }
    if (str_contains($lower, 'key') || str_contains($lower, 'tag') || str_contains($lower, 'pass')) {
        return ['category' => 'tools', 'label' => 'Tools'];
    }
    if (
        str_contains($lower, 'capsule')
        || (str_contains($lower, 'case') && !str_contains($lower, 'sticker collection'))
        || str_contains($lower, 'package')
    ) {
        return ['category' => 'cases', 'label' => 'Cases'];
    }

    return ['category' => 'other', 'label' => 'Other Items'];
}

function roiCatalogKindMeta(string $marketHashName): ?array
{
    $lower = strtolower(trim($marketHashName));
    if ($lower === '') {
        return null;
    }

    if (str_contains($lower, 'sticker collection')) {
        return [
            'category' => 'cases',
            'category_label' => 'Cases',
            'type_filter' => 'cases',
            'sub_filter' => 'capsules',
            'type_note' => 'Sticker Collection',
        ];
    }

    if (roiIsCapsuleContainer($marketHashName)) {
        return [
            'category' => 'cases',
            'category_label' => 'Cases',
            'type_filter' => 'cases',
            'sub_filter' => 'capsules',
            'type_note' => 'Capsule',
        ];
    }

    if (str_contains($lower, 'storage unit')) {
        return [
            'category' => 'stickers',
            'category_label' => 'Stickers',
            'type_filter' => 'stickers',
            'sub_filter' => 'storage',
            'type_note' => 'Storage Unit',
        ];
    }

    if (str_contains($lower, 'patch collection') || str_contains($lower, 'skill group patch')) {
        return [
            'category' => 'patches',
            'category_label' => 'Patches',
            'type_filter' => 'patches',
            'sub_filter' => 'patches',
            'type_note' => 'Patch Collection',
        ];
    }

    if (roiIsStickerSlab($marketHashName)) {
        return [
            'category' => 'charms',
            'category_label' => 'Charms',
            'type_filter' => 'charms',
            'sub_filter' => 'charms',
            'type_note' => 'Sticker Slab',
        ];
    }

    if (roiIsCharmItem($marketHashName)) {
        $isSouvenirCharm = str_starts_with(trim($marketHashName), 'Souvenir Charm |');
        return [
            'category' => 'charms',
            'category_label' => 'Charms',
            'type_filter' => 'charms',
            'sub_filter' => 'charms',
            'type_note' => $isSouvenirCharm ? 'Tournament Charm' : 'Charm',
        ];
    }

    if (roiIsCaseKey($marketHashName)) {
        return [
            'category' => 'tools',
            'category_label' => 'Tools',
            'type_filter' => 'tools',
            'sub_filter' => 'other',
            'type_note' => 'Case Key',
        ];
    }

    if (str_contains($lower, 'viewer pass') || preg_match('/\boperation\b.*\bpass\b/', $lower)) {
        return [
            'category' => 'tools',
            'category_label' => 'Tools',
            'type_filter' => 'tools',
            'sub_filter' => 'operations',
            'type_note' => 'Viewer Pass',
        ];
    }

    if (roiIsSellablePin($marketHashName)) {
        return [
            'category' => 'collectibles',
            'category_label' => 'Collectible Pins',
            'type_filter' => 'collectibles',
            'sub_filter' => 'pins',
            'type_note' => 'Collectible Pin',
        ];
    }

    if (roiIsOperationStar($marketHashName)) {
        return [
            'category' => 'collectibles',
            'category_label' => 'Collectibles',
            'type_filter' => 'collectibles',
            'sub_filter' => 'operations',
            'type_note' => 'Operation Star',
        ];
    }

    return null;
}

function roiApplyCatalogKindMeta(array $entry): array
{
    $marketHashName = trim((string)($entry['market_hash_name'] ?? ''));
    $kind = roiCatalogKindMeta($marketHashName);
    if ($kind === null) {
        return $entry;
    }

    foreach ($kind as $key => $value) {
        if ($value !== '') {
            $entry[$key] = $value;
        }
    }

    return $entry;
}

function roiGroupingMeta(array $entry): array
{
    $marketHashName = trim((string)($entry['market_hash_name'] ?? ''));
    $kind = roiCatalogKindMeta($marketHashName);
    $category = trim((string)($kind['category'] ?? $entry['category'] ?? 'other'));
    $typeId = trim((string)($kind['type_filter'] ?? roiDropdownTypeId($category)));
    $lower = strtolower($marketHashName);
    $subgroup = trim((string)($kind['sub_filter'] ?? 'all'));

    if ($subgroup !== 'all' && $subgroup !== '') {
        $scope = in_array($subgroup, roiCasesScopeSubgroups(), true)
            ? 'cases'
            : 'armory';

        return [
            'type_filter' => $typeId,
            'scope_filter' => $scope,
            'sub_filter' => $subgroup,
        ];
    }

    if ($typeId === 'cases') {
        if (str_contains($lower, 'graffiti box')) {
            $subgroup = 'graffiti';
        } elseif (str_contains($lower, 'patch pack')) {
            $subgroup = 'patches'; // e.g. "CS:GO Patch Pack", "Stockholm 2021 Challengers Patch Pack"
        } elseif (
            str_contains($lower, 'capsule') ||
            (bool)preg_match('/\b(challengers?|legends?|contenders?|champions?)\b/', $lower)
        ) {
            // Named capsule + tournament autograph containers (no "capsule" in market name)
            // e.g. "2020 RMR Legends", "Atlanta 2017 Challengers (Holo-Foil)"
            $subgroup = 'capsules';
        } else {
            $subgroup = 'cases';
        }
    } elseif ($typeId === 'skins') {
        $subgroup = roiWeaponClassSubFilter($marketHashName, $category);
    } elseif ($typeId === 'stickers') {
        // Autograph stickers go under capsules together with autograph/sticker capsule packages
        $subgroup = str_contains($lower, 'autograph') ? 'capsules' : 'stickers';
    } elseif ($typeId === 'patches') {
        $subgroup = 'patches';
    } elseif ($typeId === 'music') {
        $subgroup = 'music';
    } elseif ($typeId === 'agents') {
        $subgroup = 'agents';
    } elseif ($typeId === 'charms') {
        $subgroup = 'charms';
    } elseif ($typeId === 'collectibles') {
        if (roiIsSellablePin($marketHashName)) {
            $subgroup = 'pins';
        } elseif (
            $category === 'graffiti'
            || str_starts_with($marketHashName, 'Sealed Graffiti |')
            || str_starts_with($marketHashName, 'Graffiti |')
        ) {
            $subgroup = 'graffiti';
        } elseif (roiIsOperationStar($marketHashName)) {
            $subgroup = 'operations';
        } elseif (str_contains($lower, 'coin')) {
            $subgroup = 'coins';
        } elseif (roiIsTournamentMedal($marketHashName) || roiIsNonMarketableTrophy($marketHashName)) {
            $subgroup = 'medals';
        } elseif (roiIsCharmItem($marketHashName) || str_contains($lower, 'charm')) {
            $subgroup = 'charms';
        } else {
            $subgroup = 'other';
        }
    } elseif ($typeId === 'tools') {
        if (roiIsCaseKey($marketHashName)) {
            $subgroup = 'other';
        } elseif (str_contains($lower, 'operation') || str_contains($lower, 'pass')) {
            $subgroup = 'operations';
        }
    }

    if (
        !roiIsCaseKey($marketHashName)
        && (str_contains($lower, 'viewer pass') || preg_match('/\boperation\b.*\bpass\b/', $lower))
    ) {
        $subgroup = 'operations';
    } elseif (roiIsCharmItem($marketHashName) || $category === 'charms' || $typeId === 'charms') {
        $subgroup = 'charms';
    } elseif (str_contains($lower, 'souvenir')) {
        $subgroup = 'souvenirs';
    } elseif (str_contains($lower, 'collection package')) {
        $subgroup = 'cases'; // Anubis Collection Package and similar go under Cases
    } elseif (str_contains($lower, 'music kit')) {
        $subgroup = 'music';
    } elseif (str_contains($lower, 'capsule')) {
        $subgroup = 'capsules'; // catch-all for any missed capsules
    }

    $scope = in_array($subgroup, roiCasesScopeSubgroups(), true)
        ? 'cases'
        : 'armory';

    if ($typeId === 'agents' || $typeId === 'skins') {
        $scope = 'armory';
    }

    return [
        'type_filter' => $typeId,
        'scope_filter' => $scope,
        'sub_filter' => $subgroup,
    ];
}

function roiBuildSkinLookup(array $manifestIndex): array
{
    $rows = roiCatalogFetchJson('skins_not_grouped.json');
    $items = [];

    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }

        $marketHashName = roiNormalizeMarketHash($row);
        if ($marketHashName === '') {
            continue;
        }

        $baseName = roiStripWear($marketHashName);
        $wear = trim((string)($row['wear']['name'] ?? ''));
        $meta = roiWeaponCategory(
            (string)($row['weapon']['name'] ?? ''),
            (string)($row['category']['name'] ?? ''),
            $marketHashName
        );
        $preferredImage = roiPreferredImage($manifestIndex, $marketHashName, $baseName, trim((string)($row['image'] ?? '')));

        $items[] = [
            'market_hash_name' => $marketHashName,
            'display_name' => $baseName,
            'selected_wear' => $wear,
            'image' => $preferredImage['image'],
            'local_path' => $preferredImage['local_path'],
            'project_image_path' => $preferredImage['project_image_path'],
            'steam_image_url' => $preferredImage['steam_image_url'],
            'category' => $meta['category'],
            'category_label' => $meta['label'],
            'type_note' => roiSkinTypeNote($row),
            'name_color' => roiNameColor((array)($row['rarity'] ?? [])),
            'market_url' => steamImageMarketUrl($marketHashName),
        ];
    }

    return roiIndexCatalogEntries($items);
}

function roiBuildInventoryLookup(array $manifestIndex): array
{
    $inventory = steamImageFetchJson(BYMYKEL_API_BASE . 'inventory.json', 120);
    $entries = [];

    foreach (ROI_INVENTORY_CATEGORY_MAP as $sourceKey => $meta) {
        $rows = array_values(is_array($inventory[$sourceKey] ?? null) ? $inventory[$sourceKey] : []);
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $marketHashName = roiNormalizeMarketHash($row);
            if ($marketHashName === '') {
                continue;
            }

            $baseName = roiStripWear($marketHashName);
            $preferredImage = roiPreferredImage($manifestIndex, $marketHashName, $baseName, trim((string)($row['image'] ?? '')));
            $entries[] = [
                'market_hash_name' => $marketHashName,
                'display_name' => trim((string)($row['name'] ?? $marketHashName)),
                'selected_wear' => '',
                'image' => $preferredImage['image'],
                'local_path' => $preferredImage['local_path'],
                'project_image_path' => $preferredImage['project_image_path'],
                'steam_image_url' => $preferredImage['steam_image_url'],
                'category' => $meta['category'],
                'category_label' => $meta['label'],
                'type_note' => roiGenericTypeNote($row, $meta['label']),
                'name_color' => roiNameColor((array)($row['rarity'] ?? [])),
                'market_url' => steamImageMarketUrl($marketHashName),
            ];
        }
    }

    return roiIndexCatalogEntries($entries);
}

function roiResolveCatalogMeta(string $marketHashName, array $catalogIndex, array $skinIndex, array $inventoryIndex): array
{
    $exactKey = roiNormalizeKey($marketHashName);
    $baseKey = roiCatalogBaseKey($marketHashName);

    foreach ([
        $catalogIndex['exact'][$exactKey] ?? null,
        $skinIndex['exact'][$exactKey] ?? null,
        $inventoryIndex['exact'][$exactKey] ?? null,
        $catalogIndex['base'][$baseKey] ?? null,
        $skinIndex['base'][$baseKey] ?? null,
        $inventoryIndex['base'][$baseKey] ?? null,
    ] as $candidate) {
        if (is_array($candidate)) {
            return $candidate;
        }
    }

    $fallbackCategory = roiInferCategoryFromName($marketHashName);
    $variant = roiVariantMeta($marketHashName);

    return [
        'market_hash_name' => $marketHashName,
        'display_name' => $variant['base_name'] !== '' ? $variant['base_name'] : $marketHashName,
        'selected_wear' => $variant['wear'],
        'image' => '',
        'local_path' => '',
        'project_image_path' => '',
        'steam_image_url' => '',
        'category' => $fallbackCategory['category'],
        'category_label' => $fallbackCategory['label'],
        'type_note' => $fallbackCategory['label'] . ' item',
        'name_color' => 'B0C3D9',
        'market_url' => steamImageMarketUrl($marketHashName),
    ];
}

function roiBuildPricingCatalogEntry(string $marketHashName, array $quotes, array $meta): array
{
    $variant = roiVariantMeta($marketHashName);
    $seed = roiSeedQuoteFromPricing($quotes);
    $category = trim((string)($meta['category'] ?? 'other'));
    $categoryLabel = trim((string)($meta['category_label'] ?? roiCategoryLabel($category)));
    $inferredCategory = roiInferCategoryFromName($marketHashName);
    $kind = roiCatalogKindMeta($marketHashName);

    if ($kind !== null) {
        $category = (string)$kind['category'];
        $categoryLabel = (string)$kind['category_label'];
    } elseif (
        str_contains($marketHashName, ' | ')
        && $category === 'cases'
        && $inferredCategory['category'] !== 'cases'
    ) {
        $category = $inferredCategory['category'];
        $categoryLabel = $inferredCategory['label'];
    }

    $typeNote = trim((string)($meta['type_note'] ?? 'Counter-Strike item'));
    if ($kind !== null && !empty($kind['type_note'])) {
        $typeNote = (string)$kind['type_note'];
    } elseif (str_contains(strtolower($typeNote), 'base grade cases') && $kind !== null) {
        $typeNote = (string)$kind['type_note'];
    }

    $grouping = roiGroupingMeta([
        'market_hash_name' => $marketHashName,
        'category' => $category,
    ]);

    $entry = [
        'market_hash_name' => $marketHashName,
        'display_name' => trim((string)($meta['display_name'] ?? $variant['base_name'] ?: $marketHashName)),
        'selected_wear' => trim((string)($meta['selected_wear'] ?? $variant['wear'])),
        'image' => trim((string)($meta['image'] ?? '')),
        'local_path' => trim((string)($meta['local_path'] ?? '')),
        'project_image_path' => trim((string)($meta['project_image_path'] ?? '')),
        'steam_image_url' => trim((string)($meta['steam_image_url'] ?? '')),
        'category' => $category,
        'category_label' => $categoryLabel,
        'type_note' => $typeNote,
        'name_color' => trim((string)($meta['name_color'] ?? 'B0C3D9')) ?: 'B0C3D9',
        'market_url' => trim((string)($meta['market_url'] ?? steamImageMarketUrl($marketHashName))),
        'seed_sell_price' => $seed['price'],
        'seed_sell_listings' => $seed['listings'],
        'type_filter' => $grouping['type_filter'],
        'scope_filter' => $grouping['scope_filter'],
        'sub_filter' => $grouping['sub_filter'],
    ];

    return roiApplyCatalogKindMeta($entry);
}

function roiCatalogGroupKey(array $entry): string
{
    $marketHashName = trim((string)($entry['market_hash_name'] ?? ''));
    $category = trim((string)($entry['category'] ?? 'other'));
    $variant = roiVariantMeta($marketHashName);
    if ($variant['wear'] !== '' || in_array($category, ['skins', 'knives', 'gloves'], true)) {
        return roiNormalizeKey($variant['base_name']);
    }

    return roiNormalizeKey($marketHashName);
}

function roiPreferCatalogEntry(array $candidate, array $current): bool
{
    $candidateMeta = roiVariantMeta((string)($candidate['market_hash_name'] ?? ''));
    $currentMeta = roiVariantMeta((string)($current['market_hash_name'] ?? ''));

    $candidatePenalty = ($candidateMeta['is_stattrak'] ? 100 : 0)
        + ($candidateMeta['is_souvenir'] ? 20 : 0)
        + roiWearRank((string)$candidateMeta['wear']);
    $currentPenalty = ($currentMeta['is_stattrak'] ? 100 : 0)
        + ($currentMeta['is_souvenir'] ? 20 : 0)
        + roiWearRank((string)$currentMeta['wear']);

    if ($candidatePenalty !== $currentPenalty) {
        return $candidatePenalty < $currentPenalty;
    }

    $candidatePrice = isset($candidate['seed_sell_price']) && is_numeric($candidate['seed_sell_price']) ? (float)$candidate['seed_sell_price'] : -1.0;
    $currentPrice = isset($current['seed_sell_price']) && is_numeric($current['seed_sell_price']) ? (float)$current['seed_sell_price'] : -1.0;
    if ($candidatePrice !== $currentPrice) {
        return $candidatePrice > $currentPrice;
    }

    return strcasecmp((string)($candidate['market_hash_name'] ?? ''), (string)($current['market_hash_name'] ?? '')) < 0;
}

/** Add a catalog row when the group is not already present (csroi / pricing miss). */
function roiSupplementMissingEntry(array &$itemsByGroup, array $entry): bool
{
    $marketHashName = trim((string)($entry['market_hash_name'] ?? ''));
    if ($marketHashName === '') {
        return false;
    }

    $category = trim((string)($entry['category'] ?? 'other'));
    if (!in_array($category, ROI_ALLOWED_MARKET_CATEGORIES, true)) {
        return false;
    }

    $groupKey = roiCatalogGroupKey($entry);
    if (isset($itemsByGroup[$groupKey])) {
        return false;
    }

    $grouping = roiGroupingMeta([
        'market_hash_name' => $marketHashName,
        'category' => $category,
    ]);

    $itemsByGroup[$groupKey] = roiApplyCatalogKindMeta([
        'market_hash_name' => $marketHashName,
        'display_name' => trim((string)($entry['display_name'] ?? roiStripWear($marketHashName))),
        'selected_wear' => trim((string)($entry['selected_wear'] ?? '')),
        'image' => trim((string)($entry['image'] ?? '')),
        'local_path' => trim((string)($entry['local_path'] ?? '')),
        'project_image_path' => trim((string)($entry['project_image_path'] ?? '')),
        'steam_image_url' => trim((string)($entry['steam_image_url'] ?? '')),
        'category' => $category,
        'category_label' => trim((string)($entry['category_label'] ?? roiCategoryLabel($category))),
        'type_note' => trim((string)($entry['type_note'] ?? roiCategoryLabel($category) . ' item')),
        'name_color' => trim((string)($entry['name_color'] ?? 'B0C3D9')) ?: 'B0C3D9',
        'market_url' => trim((string)($entry['market_url'] ?? steamImageMarketUrl($marketHashName))),
        'seed_sell_price' => isset($entry['seed_sell_price']) && is_numeric($entry['seed_sell_price'])
            ? round((float)$entry['seed_sell_price'], 2)
            : null,
        'seed_sell_listings' => isset($entry['seed_sell_listings']) && is_numeric($entry['seed_sell_listings'])
            ? (int)$entry['seed_sell_listings']
            : null,
        'type_filter' => $grouping['type_filter'],
        'scope_filter' => $grouping['scope_filter'],
        'sub_filter' => $grouping['sub_filter'],
    ]);

    return true;
}

function roiCsgoskinsApiKey(): string
{
    $config = appConfig();
    $fromConfig = trim((string)($config['csgoskins']['api_key'] ?? ''));
    if ($fromConfig !== '') {
        return $fromConfig;
    }

    $fromEnv = getenv('CSGOSKINS_API_KEY');
    return is_string($fromEnv) ? trim($fromEnv) : '';
}

function roiFetchCsgoskinsBasicItems(): array
{
    $apiKey = roiCsgoskinsApiKey();
    if ($apiKey === '') {
        return [];
    }

    $baseUrl = rtrim((string)(appConfig()['csgoskins']['base_url'] ?? 'https://csgoskins.gg'), '/');
    $items = [];
    $page = 1;
    $lastPage = 1;

    do {
        $url = $baseUrl . '/api/v1/basic-item-details?page=' . $page . '&limit=100';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 90,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $apiKey,
                'Accept: application/json',
            ],
        ]);
        $body = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        if ($body === false || $status >= 400) {
            if (PHP_SAPI === 'cli' && $page === 1) {
                fwrite(STDERR, 'CSGOSKINS.GG API unavailable (HTTP ' . $status . "). Skipping.\n");
            }
            break;
        }

        $payload = json_decode((string)$body, true);
        $data = is_array($payload['data'] ?? null) ? $payload['data'] : [];
        foreach ($data as $row) {
            if (is_array($row)) {
                $items[] = $row;
            }
        }

        $meta = is_array($payload['meta'] ?? null) ? $payload['meta'] : [];
        $lastPage = max(1, (int)($meta['last_page'] ?? $page));
        $page++;
        usleep(200000);
    } while ($page <= $lastPage && $page <= 600);

    return $items;
}

function roiEntryFromCsgoskinsRow(
    array $row,
    array $manifestIndex,
    array $catalogIndex,
    array $skinIndex,
    array $inventoryIndex
): array {
    $marketHashName = trim((string)($row['market_hash_name'] ?? ''));
    $meta = roiResolveCatalogMeta($marketHashName, $catalogIndex, $skinIndex, $inventoryIndex);
    $baseName = roiStripWear($marketHashName);
    $image = trim((string)($row['image_url_steam'] ?? $row['image_url'] ?? ''));
    if ($image !== '') {
        $preferred = roiPreferredImage($manifestIndex, $marketHashName, $baseName, $image);
        $meta['image'] = $preferred['image'];
        $meta['local_path'] = $preferred['local_path'];
        $meta['project_image_path'] = $preferred['project_image_path'];
        $meta['steam_image_url'] = $preferred['steam_image_url'] ?: $image;
    }

    $wear = trim((string)($row['exterior']['name'] ?? ''));
    if ($wear !== '') {
        $meta['selected_wear'] = $wear;
    }

    if (!empty($row['rarity']) && is_array($row['rarity'])) {
        $meta['name_color'] = roiNameColor($row['rarity']);
        $rarity = trim((string)($row['rarity']['name'] ?? ''));
        $weapon = trim((string)($row['weapon']['name'] ?? ''));
        $category = trim((string)($row['category']['name'] ?? ''));
        if ($rarity !== '') {
            $meta['type_note'] = trim($rarity . ' ' . ($category !== '' ? $category : $weapon)) ?: $meta['type_note'];
        }
    }

    return $meta;
}

function roiSupplementCatalogIndexes(
    array &$itemsByGroup,
    array $skinIndex,
    array $inventoryIndex,
    array $catalogIndex,
    array $manifestIndex
): int {
    $added = 0;

    foreach ($skinIndex['base'] as $entry) {
        if (roiSupplementMissingEntry($itemsByGroup, $entry)) {
            $added++;
        }
    }

    foreach ($inventoryIndex['exact'] as $entry) {
        if (roiSupplementMissingEntry($itemsByGroup, $entry)) {
            $added++;
        }
    }

    foreach ($catalogIndex['exact'] as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $marketHashName = trim((string)($entry['market_hash_name'] ?? ''));
        if ($marketHashName === '') {
            continue;
        }

        $meta = roiResolveCatalogMeta($marketHashName, $catalogIndex, $skinIndex, $inventoryIndex);
        $seedPrice = $entry['sell_price'] ?? $entry['lowest_price'] ?? null;
        if (is_numeric($seedPrice) && (float)$seedPrice > 0) {
            $meta['seed_sell_price'] = round((float)$seedPrice, 2);
        }
        $seedListings = $entry['sell_listings'] ?? $entry['sell_listing_count'] ?? null;
        if (is_numeric($seedListings)) {
            $meta['seed_sell_listings'] = (int)$seedListings;
        }

        if (roiSupplementMissingEntry($itemsByGroup, $meta)) {
            $added++;
        }
    }

    foreach (roiFetchCsgoskinsBasicItems() as $row) {
        $entry = roiEntryFromCsgoskinsRow($row, $manifestIndex, $catalogIndex, $skinIndex, $inventoryIndex);
        if (roiSupplementMissingEntry($itemsByGroup, $entry)) {
            $added++;
        }
    }

    return $added;
}

function roiCatalogFetchJson(string $fileName): array
{
    $payload = steamImageFetchJson(BYMYKEL_API_BASE . ltrim($fileName, '/'), 90);
    if (array_is_list($payload)) {
        return $payload;
    }

    return array_values(array_filter($payload, 'is_array'));
}

function roiWearRank(?string $wear): int
{
    return match (trim((string)$wear)) {
        'Factory New' => 1,
        'Minimal Wear' => 2,
        'Field-Tested' => 3,
        'Well-Worn' => 4,
        'Battle-Scarred' => 5,
        default => 99,
    };
}

function roiStripWear(string $name): string
{
    return preg_replace('/\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/', '', trim($name)) ?? trim($name);
}

function roiNameColor(array $rarity): string
{
    return strtoupper(ltrim(trim((string)($rarity['color'] ?? 'B0C3D9')), '#')) ?: 'B0C3D9';
}

function roiManifestIndexes(array $manifest): array
{
    $byExact = [];
    $byBase = [];

    foreach ($manifest as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $marketHashName = trim((string)($entry['market_hash_name'] ?? ''));
        if ($marketHashName === '') {
            continue;
        }

        $byExact[$marketHashName] = $entry;
        $baseName = roiStripWear($marketHashName);
        if (!isset($byBase[$baseName])) {
            $byBase[$baseName] = $entry;
        }
    }

    return ['exact' => $byExact, 'base' => $byBase];
}

function roiPreferredImage(array $manifestIndex, string $marketHashName, string $baseName, string $fallbackImage): array
{
    $candidates = [$marketHashName];
    if (stripos($marketHashName, '(Holo-Foil)') !== false) {
        $candidates[] = str_ireplace('(Holo-Foil)', '(Holo/Foil)', $marketHashName);
    }
    if (stripos($marketHashName, '(Holo/Foil)') !== false) {
        $candidates[] = str_ireplace('(Holo/Foil)', '(Holo-Foil)', $marketHashName);
    }

    $manifestEntry = null;
    foreach ($candidates as $candidate) {
        $candidate = trim((string)$candidate);
        if ($candidate === '') {
            continue;
        }
        if (isset($manifestIndex['exact'][$candidate])) {
            $manifestEntry = $manifestIndex['exact'][$candidate];
            break;
        }
    }
    if ($manifestEntry === null) {
        $manifestEntry = $manifestIndex['base'][$baseName] ?? null;
    }

    $localPath = trim((string)($manifestEntry['local_path'] ?? ''));
    $projectImagePath = trim((string)($manifestEntry['project_image_path'] ?? ''));

    return [
        'image' => $localPath !== '' ? $localPath : ($projectImagePath !== '' ? $projectImagePath : $fallbackImage),
        'local_path' => $localPath,
        'project_image_path' => $projectImagePath,
        'steam_image_url' => $fallbackImage,
    ];
}

function roiWeaponClassSubFilter(string $marketHashName, string $category): string
{
    if ($category === 'gloves') {
        return 'gloves';
    }
    if ($category === 'knives' || str_starts_with($marketHashName, '★ ')) {
        return 'knives';
    }

    // Extract weapon name — everything before the first " | "
    $parts = explode(' | ', $marketHashName, 2);
    $weapon = strtolower(preg_replace('/^(StatTrak™|Souvenir)\s+/u', '', trim($parts[0])));

    // Gloves are stored in skins_not_grouped.json with category='skins' in the Steam catalog,
    // so we also detect them by weapon name to ensure correct sub_filter assignment.
    static $gloves = ['sport gloves', 'driver gloves', 'moto gloves', 'specialist gloves', 'hand wraps', 'bloodhound gloves', 'broken fang gloves', 'hydra gloves'];
    static $pistols = ['glock-18', 'usp-s', 'p2000', 'p250', 'desert eagle', 'dual berettas', 'five-seven', 'cz75-auto', 'tec-9', 'r8 revolver', 'zeus x27'];
    static $smgs = ['mac-10', 'mp9', 'mp7', 'mp5-sd', 'ump-45', 'p90', 'pp-bizon'];
    static $shotguns = ['nova', 'xm1014', 'sawed-off', 'mag-7'];
    static $heavy = ['m249', 'negev'];
    static $rifles = ['ak-47', 'aug', 'awp', 'famas', 'g3sg1', 'galil ar', 'm4a1-s', 'm4a4', 'scar-20', 'sg 553', 'ssg 08'];

    if (in_array($weapon, $gloves, true)) return 'gloves';
    if (in_array($weapon, $pistols, true)) return 'pistols';
    if (in_array($weapon, $smgs, true)) return 'smgs';
    if (in_array($weapon, $shotguns, true)) return 'shotguns';
    if (in_array($weapon, $heavy, true)) return 'heavy';
    if (in_array($weapon, $rifles, true)) return 'rifles';
    return 'rifles';
}

function roiWeaponCategory(string $weaponName, string $categoryName, string $marketHashName): array
{
    $weapon = strtolower(trim($weaponName));
    $category = strtolower(trim($categoryName));
    $market = trim($marketHashName);

    if (str_contains($category, 'glove')) {
        return ['category' => 'gloves', 'label' => 'Gloves'];
    }

    if (str_starts_with($market, '★ ') || str_contains($weapon, 'knife')) {
        return ['category' => 'knives', 'label' => 'Knives'];
    }

    return ['category' => 'skins', 'label' => 'Weapon Skins'];
}

function roiSkinTypeNote(array $row): string
{
    $rarity = trim((string)($row['rarity']['name'] ?? ''));
    $category = trim((string)($row['category']['name'] ?? ''));
    $weapon = trim((string)($row['weapon']['name'] ?? ''));
    $label = $category !== '' ? $category : $weapon;

    return trim($rarity . ' ' . $label) ?: 'Counter-Strike item';
}

function roiOriginIsCollection(string $originName): bool
{
    return preg_match('/\bcollection\b/i', $originName) === 1;
}

function roiOriginIsSouvenirNoise(string $originName): bool
{
    return preg_match('/\b(souvenir highlight package|highlight package|souvenir package)\b/i', $originName) === 1;
}

function roiOriginShouldOverwrite(string $existingOrigin, string $incomingOrigin, bool $overwrite): bool
{
    if (!$overwrite || $existingOrigin === '') {
        return $overwrite;
    }

    if (roiOriginIsCollection($existingOrigin) && roiOriginIsSouvenirNoise($incomingOrigin)) {
        return false;
    }

    if (roiOriginIsSouvenirNoise($existingOrigin) && roiOriginIsCollection($incomingOrigin)) {
        return true;
    }

    if (roiOriginIsSouvenirNoise($incomingOrigin) && !roiOriginIsSouvenirNoise($existingOrigin)) {
        return false;
    }

    return $overwrite;
}

function roiAssignSkinOrigin(array &$lookup, string $skinName, string $originName, bool $overwrite = false): void
{
    $originName = trim($originName);
    if ($originName === '') {
        return;
    }

    $baseName = roiStripWear($skinName);
    $candidates = [$baseName];
    if (!str_starts_with(strtolower($baseName), 'sticker | ')) {
        $candidates[] = 'Sticker | ' . $baseName;
    }

    foreach ($candidates as $candidate) {
        $key = roiNormalizeKey($candidate);
        if ($key === '') {
            continue;
        }
        $existing = trim((string)($lookup[$key] ?? ''));
        if ($existing !== '' && !roiOriginShouldOverwrite($existing, $originName, $overwrite)) {
            continue;
        }

        $lookup[$key] = $originName;
    }
}

function roiCleanSkinDescriptionText(string $value): string
{
    $text = trim($value);
    $text = preg_replace('/<\/?i>/', '', $text) ?? $text;
    $text = str_replace(['\\n\\n', '\\n'], ["\n\n", "\n"], $text);

    return trim($text);
}

function roiExtractSkinDescription(string $description): string
{
    $raw = trim($description);
    if ($raw === '') {
        return '';
    }

    // Steam shows weapon flavor text in italics; ByMykel stores it in <i> tags.
    if (preg_match('/<i>(.*?)<\/i>/is', $raw, $matches)) {
        $flavor = roiCleanSkinDescriptionText($matches[1]);
        if ($flavor !== '') {
            return $flavor;
        }
    }

    $text = roiCleanSkinDescriptionText($raw);
    if ($text === '') {
        return '';
    }

    // Some entries keep flavor text after a blank line without <i> tags.
    if (preg_match('/\n\n(.+)$/s', $text, $matches)) {
        $tail = trim($matches[1]);
        if ($tail !== '' && stripos($tail, 'it has been ') === false && mb_strlen($tail) <= 180) {
            return $tail;
        }
    }

    return '';
}

function roiDescriptionLookupKey(string $name): string
{
    $value = trim($name);
    if (str_starts_with($value, 'Souvenir ')) {
        $value = substr($value, strlen('Souvenir '));
    }
    if (str_starts_with($value, 'StatTrak™ ')) {
        $value = substr($value, strlen('StatTrak™ '));
    }

    return roiNormalizeKey(roiStripWear($value));
}

function roiBuildSkinDescriptionLookup(): array
{
    $lookup = [];

    foreach (roiCatalogFetchJson('skins_not_grouped.json') as $row) {
        if (!is_array($row)) {
            continue;
        }

        $marketHashName = roiNormalizeMarketHash($row);
        if ($marketHashName === '') {
            continue;
        }

        $description = roiExtractSkinDescription((string)($row['description'] ?? ''));
        if ($description === '') {
            continue;
        }

        $key = roiDescriptionLookupKey($marketHashName);
        if ($key === '' || isset($lookup[$key])) {
            continue;
        }

        $lookup[$key] = $description;
    }

    foreach (roiCatalogFetchJson('agents.json') as $row) {
        if (!is_array($row)) {
            continue;
        }

        $marketHashName = roiNormalizeMarketHash($row);
        if ($marketHashName === '') {
            continue;
        }

        $description = roiCleanSkinDescriptionText((string)($row['description'] ?? ''));
        if ($description === '') {
            continue;
        }

        $key = roiDescriptionLookupKey($marketHashName);
        if ($key === '' || isset($lookup[$key])) {
            continue;
        }

        $lookup[$key] = $description;
    }

    return $lookup;
}

function roiSaveSkinDescriptionLookup(array $lookup): string
{
    steamImageEnsureCacheDir();
    $path = STEAM_IMAGE_CACHE_DIR . '/skin_description_lookup.json';
    file_put_contents(
        $path,
        json_encode([
            'updated_at' => gmdate(DATE_ATOM),
            'total_count' => count($lookup),
            'items' => $lookup,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );

    return $path;
}

function roiBuildSkinOriginLookup(): array
{
    $lookup = [];

    foreach (roiCatalogFetchJson('collections.json') as $collection) {
        if (!is_array($collection)) {
            continue;
        }

        $collectionName = trim((string)($collection['name'] ?? ''));
        if ($collectionName === '') {
            continue;
        }

        $contains = is_array($collection['contains'] ?? null) ? $collection['contains'] : [];
        foreach ($contains as $skin) {
            if (!is_array($skin)) {
                continue;
            }
            roiAssignSkinOrigin($lookup, (string)($skin['name'] ?? ''), $collectionName);
        }
    }

    foreach (roiCatalogFetchJson('crates.json') as $crate) {
        if (!is_array($crate)) {
            continue;
        }

        $crateName = trim((string)($crate['name'] ?? ''));
        if ($crateName === '') {
            continue;
        }

        foreach (['contains', 'contains_rare'] as $field) {
            $rows = is_array($crate[$field] ?? null) ? $crate[$field] : [];
            foreach ($rows as $skin) {
                if (!is_array($skin)) {
                    continue;
                }
                roiAssignSkinOrigin($lookup, (string)($skin['name'] ?? ''), $crateName, true);
            }
        }
    }

    return $lookup;
}

function roiSaveSkinOriginLookup(array $lookup): string
{
    steamImageEnsureCacheDir();
    $path = STEAM_IMAGE_CACHE_DIR . '/skin_origin_lookup.json';
    file_put_contents(
        $path,
        json_encode([
            'updated_at' => gmdate(DATE_ATOM),
            'total_count' => count($lookup),
            'items' => $lookup,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );

    return $path;
}

function roiGenericTypeNote(array $row, string $fallbackLabel): string
{
    $rarity = trim((string)($row['rarity']['name'] ?? ''));
    $type = trim((string)($row['type'] ?? ''));
    $category = trim((string)($row['category']['name'] ?? ''));
    $team = trim((string)($row['team']['name'] ?? ''));

    foreach ([$type, $category, $team, $fallbackLabel] as $candidate) {
        if ($candidate !== '') {
            return trim($rarity . ' ' . $candidate);
        }
    }

    return trim($rarity . ' Counter-Strike item') ?: 'Counter-Strike item';
}

function roiNormalizeMarketHash(array $row): string
{
    $marketHashName = trim((string)($row['market_hash_name'] ?? ''));
    if ($marketHashName !== '') {
        return $marketHashName;
    }

    return trim((string)($row['name'] ?? ''));
}

function roiBuildSkinCatalog(array $manifestIndex): array
{
    $rows = roiCatalogFetchJson('skins_not_grouped.json');
    $groups = [];

    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }

        $skinId = trim((string)($row['skin_id'] ?? $row['id'] ?? ''));
        $marketHashName = roiNormalizeMarketHash($row);
        if ($skinId === '' || $marketHashName === '') {
            continue;
        }

        $groups[$skinId][] = $row;
    }

    $items = [];
    foreach ($groups as $variants) {
        usort($variants, static function (array $left, array $right): int {
            $leftPenalty = (!empty($left['stattrak']) || !empty($left['souvenir'])) ? 1 : 0;
            $rightPenalty = (!empty($right['stattrak']) || !empty($right['souvenir'])) ? 1 : 0;
            if ($leftPenalty !== $rightPenalty) {
                return $leftPenalty <=> $rightPenalty;
            }

            return roiWearRank((string)($left['wear']['name'] ?? '')) <=> roiWearRank((string)($right['wear']['name'] ?? ''));
        });

        $selected = $variants[0];
        $marketHashName = roiNormalizeMarketHash($selected);
        $baseName = roiStripWear($marketHashName);
        $wear = trim((string)($selected['wear']['name'] ?? ''));
        $image = trim((string)($selected['image'] ?? ''));
        $meta = roiWeaponCategory(
            (string)($selected['weapon']['name'] ?? ''),
            (string)($selected['category']['name'] ?? ''),
            $marketHashName
        );
        $nameColor = roiNameColor((array)($selected['rarity'] ?? []));
        $preferredImage = roiPreferredImage($manifestIndex, $marketHashName, $baseName, $image);
        $typeNote = roiSkinTypeNote($selected);

        $items[$marketHashName] = [
            'market_hash_name' => $marketHashName,
            'display_name' => $baseName,
            'selected_wear' => $wear,
            'image' => $preferredImage['image'],
            'category' => $meta['category'],
            'type_note' => $typeNote,
            'name_color' => $nameColor,
        ];
    }

    return $items;
}

function roiBuildGenericCatalog(array $manifestIndex, string $fileName, string $category, string $categoryLabel): array
{
    $rows = roiCatalogFetchJson($fileName);
    $items = [];

    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }

        $marketHashName = roiNormalizeMarketHash($row);
        if ($marketHashName === '') {
            continue;
        }

        $baseName = roiStripWear($marketHashName);
        $image = trim((string)($row['image'] ?? ''));
        $preferredImage = roiPreferredImage($manifestIndex, $marketHashName, $baseName, $image);

        $items[$marketHashName] = [
            'market_hash_name' => $marketHashName,
            'display_name' => trim((string)($row['name'] ?? $marketHashName)),
            'selected_wear' => '',
            'image' => $preferredImage['image'],
            'category' => $category,
            'type_note' => roiGenericTypeNote($row, $categoryLabel),
            'name_color' => roiNameColor((array)($row['rarity'] ?? [])),
        ];
    }

    return $items;
}

function roiBuildCatalog(): array
{
    if (!is_file(STEAM_MARKET_CATALOG_PATH)) {
        throw new RuntimeException('Steam market catalog is missing. Run sync_steam_market_catalog.php first.');
    }

    $decoded = json_decode((string)file_get_contents(STEAM_MARKET_CATALOG_PATH), true);
    $sourceItems = is_array($decoded['items'] ?? null) ? $decoded['items'] : [];
    $manifestIndex = roiManifestIndexes(steamImageManifestLoad());
    $catalogIndex = roiIndexCatalogEntries($sourceItems);
    $skinIndex = roiBuildSkinLookup($manifestIndex);
    $inventoryIndex = roiBuildInventoryLookup($manifestIndex);
    $pricingRows = roiFetchPricingRows();
    $itemsByGroup = [];

    foreach ($pricingRows as $pricingRow) {
        $marketHashName = trim((string)($pricingRow['market_hash_name'] ?? ''));
        $quotes = is_array($pricingRow['quotes'] ?? null) ? $pricingRow['quotes'] : [];
        if ($marketHashName === '') {
            continue;
        }

        if (roiIsCatalogTokenItem($marketHashName)) {
            continue;
        }

        $meta = roiResolveCatalogMeta($marketHashName, $catalogIndex, $skinIndex, $inventoryIndex);
        $item = roiBuildPricingCatalogEntry($marketHashName, $quotes, $meta);
        if (!in_array((string)($item['category'] ?? 'other'), ROI_ALLOWED_MARKET_CATEGORIES, true)) {
            continue;
        }

        $groupKey = roiCatalogGroupKey($item);
        if (!isset($itemsByGroup[$groupKey]) || roiPreferCatalogEntry($item, $itemsByGroup[$groupKey])) {
            $itemsByGroup[$groupKey] = $item;
        }
    }

    $supplemented = roiSupplementCatalogIndexes(
        $itemsByGroup,
        $skinIndex,
        $inventoryIndex,
        $catalogIndex,
        $manifestIndex
    );

    if (PHP_SAPI === 'cli' && $supplemented > 0) {
        fwrite(STDERR, 'Supplemented ' . $supplemented . " items from game DB / Steam cache / CSGOSKINS.GG.\n");
    }

    $items = array_values($itemsByGroup);

    usort($items, static function (array $left, array $right): int {
        $leftName = (string)($left['display_name'] ?? $left['market_hash_name'] ?? '');
        $rightName = (string)($right['display_name'] ?? $right['market_hash_name'] ?? '');
        $nameCompare = strcasecmp($leftName, $rightName);
        if ($nameCompare !== 0) {
            return $nameCompare;
        }

        $wearCompare = roiWearRank((string)($left['selected_wear'] ?? '')) <=> roiWearRank((string)($right['selected_wear'] ?? ''));
        if ($wearCompare !== 0) {
            return $wearCompare;
        }

        return strcasecmp((string)($left['market_hash_name'] ?? ''), (string)($right['market_hash_name'] ?? ''));
    });

    return $items;
}

function roiCatalogSave(array $items): array
{
    steamImageEnsureCacheDir();
    $payload = [
        'updated_at' => gmdate(DATE_ATOM),
        'total_count' => count($items),
        'items' => $items,
    ];

    file_put_contents(
        ROI_CATALOG_OUTPUT,
        json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );

    return $payload;
}

function roiCatalogMain(): void
{
    roiSaveSkinOriginLookup(roiBuildSkinOriginLookup());
    roiSaveSkinDescriptionLookup(roiBuildSkinDescriptionLookup());
    $payload = roiCatalogSave(roiBuildCatalog());

    if (PHP_SAPI === 'cli') {
        echo json_encode([
            'success' => true,
            'output' => str_replace(__DIR__ . '/', '', ROI_CATALOG_OUTPUT),
            'total_count' => $payload['total_count'],
            'updated_at' => $payload['updated_at'],
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
        return;
    }

    respondJson([
        'success' => true,
        'output' => str_replace(__DIR__ . '/', '', ROI_CATALOG_OUTPUT),
        'total_count' => $payload['total_count'],
        'updated_at' => $payload['updated_at'],
    ]);
}

$directCliEntry = PHP_SAPI === 'cli'
    && isset($_SERVER['SCRIPT_FILENAME'])
    && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__;
$directWebEntry = PHP_SAPI !== 'cli'
    && realpath(__FILE__) === realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? ''));

if ($directCliEntry || $directWebEntry) {
    try {
        roiCatalogMain();
    } catch (Throwable $exception) {
        if (PHP_SAPI === 'cli') {
            fwrite(STDERR, $exception->getMessage() . PHP_EOL);
            exit(1);
        }

        respondJson(['error' => $exception->getMessage()], 500);
    }
}
