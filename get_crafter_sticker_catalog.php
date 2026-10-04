<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/lib/craft_econ_lookup.php';

$limit = max(50, min(20000, (int)($_GET['limit'] ?? 900)));
$kind = strtolower(trim((string)($_GET['kind'] ?? 'stickers')));
$query = trim((string)($_GET['q'] ?? ''));
if ($query !== '' && preg_match('/\btexas\b/i', $query) && !preg_match('/\baustin\b/i', $query)) {
    $query = (string)preg_replace('/\btexas\b/iu', 'austin', $query);
}
$queryNeedle = $query !== '' ? mb_strtolower($query) : '';

/**
 * @param array<string, mixed> $item
 */
function crafterCatalogMatchesQuery(array $item, string $needle): bool
{
    if ($needle === '') {
        return true;
    }
    $haystacks = [
        (string)($item['market_hash_name'] ?? ''),
        (string)($item['display_name'] ?? ''),
        (string)($item['type_note'] ?? ''),
    ];
    foreach ($haystacks as $haystack) {
        if ($haystack !== '' && str_contains(mb_strtolower($haystack), $needle)) {
            return true;
        }
    }
    return false;
}

/**
 * Serve the prebuilt full sticker set (avoids the old top-900-by-listings blind spot).
 *
 * @return array{items: array<int, array<string, mixed>>, total: int}|null
 */
function loadPrebuiltCrafterStickerCatalog(int $limit, string $queryNeedle): ?array
{
    $catalogFile = __DIR__ . '/assets/data/crafter-sticker-catalog.json';
    if (!is_file($catalogFile)) {
        return null;
    }

    $decoded = json_decode((string)file_get_contents($catalogFile), true);
    $all = is_array($decoded['items'] ?? null) ? $decoded['items'] : [];
    if (!$all) {
        return null;
    }

    $matched = [];
    foreach ($all as $item) {
        if (!is_array($item)) {
            continue;
        }
        $name = trim((string)($item['market_hash_name'] ?? ''));
        $image = trim((string)($item['image'] ?? ''));
        if ($name === '' || $image === '') {
            continue;
        }
        if ($queryNeedle !== '' && !crafterCatalogMatchesQuery($item, $queryNeedle)) {
            continue;
        }
        $matched[] = [
            'market_hash_name' => $name,
            'display_name' => trim((string)($item['display_name'] ?? $name)) ?: $name,
            'image' => $image,
            'category' => 'stickers',
            'type_note' => trim((string)($item['type_note'] ?? 'Sticker')) ?: 'Sticker',
            'seed_sell_price' => is_numeric($item['seed_sell_price'] ?? null) ? (float)$item['seed_sell_price'] : null,
            'seed_sell_listings' => is_numeric($item['seed_sell_listings'] ?? null) ? (int)$item['seed_sell_listings'] : 0,
            'sticker_id' => is_numeric($item['sticker_id'] ?? null) && (int)$item['sticker_id'] > 0
                ? (int)$item['sticker_id']
                : null,
            'def_index' => null,
            'highlight_reel' => null,
            'paint_kit' => null,
        ];
    }

    $total = count($matched);
    return [
        'items' => array_slice($matched, 0, $limit),
        'total' => $total,
    ];
}

if ($kind !== 'pendants') {
    $prebuilt = loadPrebuiltCrafterStickerCatalog($limit, $queryNeedle);
    if (is_array($prebuilt)) {
        respondJson([
            'items' => $prebuilt['items'],
            'total' => $prebuilt['total'],
            'kind' => 'stickers',
            'query' => $query !== '' ? $query : null,
            'source' => 'crafter-sticker-catalog',
        ]);
        exit;
    }
}

$catalogFile = __DIR__ . '/assets/steam-market-cache/roi_catalog.json';
if (!is_file($catalogFile)) {
    respondJson(['items' => [], 'total' => 0]);
    exit;
}

$data = json_decode((string)file_get_contents($catalogFile), true);
$all = is_array($data['items'] ?? null) ? $data['items'] : [];
$stickers = [];

foreach ($all as $item) {
    if (!is_array($item)) {
        continue;
    }

    $name = trim((string)($item['market_hash_name'] ?? ''));
    if ($name === '') {
        continue;
    }

    if ($kind === 'pendants') {
        $isCharm = str_starts_with($name, 'Charm |') || str_starts_with($name, 'Souvenir Charm |');
        $isSlab = str_starts_with($name, 'Sticker Slab |');
        if (!$isCharm && !$isSlab) {
            continue;
        }
    } else {
        if (!str_starts_with($name, 'Sticker |')) {
            continue;
        }
        if (str_starts_with($name, 'Sticker Slab |')) {
            continue;
        }
    }

    // Prefer Steam CDN over local cache — some local sticker PNGs are slab case art.
    $steamImage = trim((string)($item['steam_image_url'] ?? ''));
    $rawImage = trim((string)($item['image'] ?? ''));
    $localImage = trim((string)($item['local_path'] ?? ''));
    $image = '';
    foreach ([$steamImage, $rawImage, $localImage] as $candidate) {
        if ($candidate === '') {
            continue;
        }
        if (preg_match('#^https?://#i', $candidate) === 1) {
            $image = $candidate;
            break;
        }
        if ($image === '') {
            $image = $candidate;
        }
    }
    if ($image === '') {
        continue;
    }

    $rowProbe = [
        'market_hash_name' => $name,
        'display_name' => trim((string)($item['display_name'] ?? $name)),
        'type_note' => trim((string)($item['type_note'] ?? 'Sticker')),
    ];
    if ($queryNeedle !== '' && !crafterCatalogMatchesQuery($rowProbe, $queryNeedle)) {
        continue;
    }

    $listings = is_numeric($item['seed_sell_listings'] ?? null) ? (int)$item['seed_sell_listings'] : 0;
    $price = is_numeric($item['seed_sell_price'] ?? null) ? (float)$item['seed_sell_price'] : null;

    $resolvedSticker = null;
    $resolvedKeychain = null;
    if ($kind === 'pendants') {
        $resolvedKeychain = resolveCraftKeychainEcon($name);
        if (!$resolvedKeychain) {
            $resolvedSticker = resolveCraftStickerEcon($name);
        }
    } else {
        $resolvedSticker = resolveCraftStickerEcon($name);
    }
    $stickers[] = [
        'market_hash_name' => $name,
        'display_name' => trim((string)($item['display_name'] ?? $name)),
        'image' => $image,
        'category' => 'stickers',
        'type_note' => trim((string)($item['type_note'] ?? 'Sticker')),
        'seed_sell_price' => $price,
        'seed_sell_listings' => $listings,
        'sticker_id' => $resolvedKeychain
            ? (int)$resolvedKeychain['def_index']
            : ($resolvedSticker ? (int)$resolvedSticker['sticker_id'] : null),
        'def_index' => $resolvedKeychain ? (int)$resolvedKeychain['def_index'] : null,
        'highlight_reel' => $resolvedKeychain && isset($resolvedKeychain['highlight_reel'])
            ? (int)$resolvedKeychain['highlight_reel']
            : null,
        'paint_kit' => $resolvedKeychain && isset($resolvedKeychain['paint_kit'])
            ? (int)$resolvedKeychain['paint_kit']
            : null,
        '_listings' => $listings,
    ];
}

if ($kind === 'pendants') {
    $stickerPriceIndex = [];
    foreach ($all as $item) {
        if (!is_array($item)) {
            continue;
        }
        $stickerName = trim((string)($item['market_hash_name'] ?? ''));
        if ($stickerName === '' || !str_starts_with($stickerName, 'Sticker |') || str_starts_with($stickerName, 'Sticker Slab |')) {
            continue;
        }
        $stickerPrice = is_numeric($item['seed_sell_price'] ?? null) ? (float)$item['seed_sell_price'] : 0.0;
        if ($stickerPrice > 0) {
            $stickerKey = mb_strtolower((string)preg_replace('/\s+/u', ' ', $stickerName));
            $stickerPriceIndex[$stickerKey] = $stickerPrice;
        }
    }
    foreach ($stickers as &$pendantRow) {
        if (is_numeric($pendantRow['seed_sell_price'] ?? null) && (float)$pendantRow['seed_sell_price'] > 0) {
            continue;
        }
        $pendantName = trim((string)($pendantRow['market_hash_name'] ?? ''));
        if (!str_starts_with($pendantName, 'Sticker Slab |')) {
            continue;
        }
        $wrappedSticker = trim((string)preg_replace('/^Sticker Slab\s*\|/u', 'Sticker |', $pendantName));
        $wrappedKey = mb_strtolower((string)preg_replace('/\s+/u', ' ', $wrappedSticker));
        if ($wrappedSticker !== '' && isset($stickerPriceIndex[$wrappedKey])) {
            $pendantRow['seed_sell_price'] = $stickerPriceIndex[$wrappedKey];
        }
    }
    unset($pendantRow);
}

usort($stickers, static function (array $left, array $right): int {
    $leftListings = (int)($left['_listings'] ?? 0);
    $rightListings = (int)($right['_listings'] ?? 0);
    if ($leftListings !== $rightListings) {
        return $rightListings <=> $leftListings;
    }

    return strcasecmp((string)($left['market_hash_name'] ?? ''), (string)($right['market_hash_name'] ?? ''));
});

$total = count($stickers);

if ($kind === 'pendants') {
    $collectionCharms = [];
    $slabs = [];
    $souvenirCharms = [];
    $highlightBySeries = [
        'austin' => [],
        'budapest' => [],
        'cologne' => [],
    ];

    foreach ($stickers as $item) {
        $name = (string)($item['market_hash_name'] ?? '');
        if (str_starts_with($name, 'Souvenir Charm |')) {
            if (preg_match('/Souvenir Charm \|\s*Austin 2025 Highlight\b/i', $name)) {
                $highlightBySeries['austin'][] = $item;
            } elseif (preg_match('/Souvenir Charm \|\s*Budapest 2025 Highlight\b/i', $name)) {
                $highlightBySeries['budapest'][] = $item;
            } elseif (preg_match('/Souvenir Charm \|\s*Cologne 2026 Highlight\b/i', $name)) {
                $highlightBySeries['cologne'][] = $item;
            }
            $souvenirCharms[] = $item;
            continue;
        }
        if (str_starts_with($name, 'Sticker Slab |')) {
            $slabs[] = $item;
            continue;
        }
        $collectionCharms[] = $item;
    }

    $sortByListings = static function (array $left, array $right): int {
        $leftListings = (int)($left['_listings'] ?? 0);
        $rightListings = (int)($right['_listings'] ?? 0);
        if ($leftListings !== $rightListings) {
            return $rightListings <=> $leftListings;
        }

        return strcasecmp((string)($left['market_hash_name'] ?? ''), (string)($right['market_hash_name'] ?? ''));
    };

    usort($collectionCharms, $sortByListings);
    usort($slabs, $sortByListings);
    usort($souvenirCharms, $sortByListings);
    foreach ($highlightBySeries as &$seriesRows) {
        usort($seriesRows, $sortByListings);
    }
    unset($seriesRows);

    // Always surface Austin / Budapest / Cologne highlight souvenirs (Texas = Austin).
    $forcedHighlights = [];
    $perSeries = 40;
    foreach (['austin', 'budapest', 'cologne'] as $seriesKey) {
        foreach (array_slice($highlightBySeries[$seriesKey], 0, $perSeries) as $row) {
            $forcedHighlights[] = $row;
        }
    }

    $souvenirReserve = min(240, count($souvenirCharms));
    $forcedCount = count($forcedHighlights);
    $slabCap = min(count($slabs), max(0, $limit - count($collectionCharms) - $souvenirReserve - $forcedCount));
    $remaining = max(0, $limit - count($collectionCharms) - $slabCap - $forcedCount);

    $forcedNames = [];
    foreach ($forcedHighlights as $row) {
        $forcedNames[(string)($row['market_hash_name'] ?? '')] = true;
    }
    $extraSouvenirs = [];
    foreach (array_slice($souvenirCharms, 0, $remaining + $forcedCount) as $row) {
        $name = (string)($row['market_hash_name'] ?? '');
        if (isset($forcedNames[$name])) {
            continue;
        }
        $extraSouvenirs[] = $row;
        if (count($extraSouvenirs) >= $remaining) {
            break;
        }
    }

    $items = array_merge(
        $forcedHighlights,
        $collectionCharms,
        array_slice($slabs, 0, $slabCap),
        $extraSouvenirs
    );
    $total = count($collectionCharms) + count($slabs) + count($souvenirCharms);
} else {
    $items = array_slice($stickers, 0, $limit);
}
$charmModelManifest = [];
$charmManifestFile = __DIR__ . '/assets/models/keychains/manifest.json';
if (is_file($charmManifestFile)) {
    $manifestRaw = (string)file_get_contents($charmManifestFile);
    // PowerShell UTF-8 writes may include a BOM that breaks json_decode.
    if (str_starts_with($manifestRaw, "\xEF\xBB\xBF")) {
        $manifestRaw = substr($manifestRaw, 3);
    }
    $decodedManifest = json_decode($manifestRaw, true);
    if (is_array($decodedManifest['items'] ?? null)) {
        $charmModelManifest = $decodedManifest['items'];
    }
}

$items = array_map(static function (array $item) use ($kind, $charmModelManifest): array {
    unset($item['_listings']);
    if ($kind === 'pendants') {
        $name = (string)($item['market_hash_name'] ?? '');
        if (str_starts_with($name, 'Sticker Slab |')) {
            $item['category'] = 'slabs';
            $item['type_note'] = 'Sticker Slab';
            $slabMapped = $charmModelManifest['Sticker Slab']
                ?? $charmModelManifest['__sticker_slab__']
                ?? null;
            if (is_array($slabMapped)) {
                $modelUrl = trim((string)($slabMapped['model_url'] ?? ''));
                if ($modelUrl !== '') {
                    $item['model_url'] = $modelUrl;
                }
            }
        } else {
            $item['category'] = 'charms';
            $item['type_note'] = str_starts_with($name, 'Souvenir Charm |') ? 'Souvenir Charm' : 'Charm';
            $mapped = $charmModelManifest[$name] ?? null;
            // Tournament highlight moments share one GLTF per event (Austin/Budapest/Cologne).
            if (!is_array($mapped)) {
                if (preg_match('/\bAustin 2025 Highlight\b/i', $name)) {
                    $mapped = $charmModelManifest['Charm | Austin 2025 Highlight']
                        ?? $charmModelManifest['Souvenir Charm | Austin 2025 Highlight']
                        ?? null;
                } elseif (preg_match('/\bBudapest 2025 Highlight\b/i', $name)) {
                    $mapped = $charmModelManifest['Charm | Budapest 2025 Highlight']
                        ?? $charmModelManifest['Souvenir Charm | Budapest 2025 Highlight']
                        ?? null;
                } elseif (preg_match('/\bCologne 2026 Highlight\b/i', $name)) {
                    $mapped = $charmModelManifest['Charm | Cologne 2026 Highlight']
                        ?? $charmModelManifest['Souvenir Charm | Cologne 2026 Highlight']
                        ?? null;
                }
            }
            if (is_array($mapped)) {
                $modelUrl = trim((string)($mapped['model_url'] ?? ''));
                if ($modelUrl !== '') {
                    $item['model_url'] = $modelUrl;
                    $token = trim((string)($mapped['token'] ?? ''));
                    if ($token !== '') {
                        $item['model_token'] = $token;
                    }
                }
            }
        }
    }
    return $item;
}, $items);

if ($kind === 'pendants' && $charmModelManifest) {
    $have = [];
    foreach ($items as $row) {
        $have[mb_strtolower((string) ($row['market_hash_name'] ?? ''))] = true;
    }
    foreach ($charmModelManifest as $name => $mapped) {
        if (!is_array($mapped) || str_starts_with((string) $name, '__') || $name === 'Sticker Slab') {
            continue;
        }
        $image = trim((string) ($mapped['image'] ?? $mapped['icon'] ?? ''));
        $modelUrl = trim((string) ($mapped['model_url'] ?? ''));
        if ($image === '' || $modelUrl === '') {
            continue;
        }
        $key = mb_strtolower((string) $name);
        if (isset($have[$key])) {
            continue;
        }
        $extraRow = [
            'market_hash_name' => $name,
            'display_name' => trim((string) ($mapped['display_name'] ?? $name)) ?: $name,
            'image' => $image,
            'category' => 'charms',
            'type_note' => 'Charm',
        ];
        if ($queryNeedle !== '' && !crafterCatalogMatchesQuery($extraRow, $queryNeedle)) {
            continue;
        }
        $items[] = array_merge($extraRow, [
            'seed_sell_price' => null,
            'seed_sell_listings' => 0,
            'sticker_id' => null,
            'def_index' => null,
            'highlight_reel' => null,
            'paint_kit' => null,
            'model_url' => $modelUrl,
            'model_token' => trim((string) ($mapped['token'] ?? '')),
        ]);
        $total++;
    }
}

respondJson([
    'items' => $items,
    'total' => $total,
    'kind' => $kind === 'pendants' ? 'pendants' : 'stickers',
    'query' => $query !== '' ? $query : null,
    'source' => 'roi_catalog',
]);
