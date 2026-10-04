<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';

header('Content-Type: application/json; charset=utf-8');

function detailRespond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function detailCachePath(string $name): string
{
    $normalized = preg_replace('/[^a-z0-9_.-]+/i', '_', strtolower($name)) ?: 'detail.json';
    return rtrim(sys_get_temp_dir(), '\\/') . DIRECTORY_SEPARATOR . 'csgo_price_tracker_detail_v4_' . $normalized;
}

function detailLoadCache(string $name, int $ttlSeconds): ?array
{
    $path = detailCachePath($name);
    if (!is_file($path)) {
        return null;
    }

    $modifiedAt = @filemtime($path);
    if ($modifiedAt === false || $modifiedAt < time() - $ttlSeconds) {
        return null;
    }

    $decoded = json_decode((string)@file_get_contents($path), true);
    return is_array($decoded) ? $decoded : null;
}

function detailSaveCache(string $name, array $payload): void
{
    @file_put_contents(detailCachePath($name), json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
}

function detailFetchJson(string $url, int $timeoutSeconds = 25): ?array
{
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeoutSeconds,
        CURLOPT_CONNECTTIMEOUT => min(10, $timeoutSeconds),
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
            . '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);

    $body = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);

    if ($body === false || $status >= 400 || $body === '') {
        return null;
    }

    $decoded = json_decode((string)$body, true);
    return is_array($decoded) ? $decoded : null;
}

function detailNormalizeName(string $name): string
{
    return strtolower(trim(preg_replace('/\s+/', ' ', $name)));
}

function detailFloatOrNull(mixed $value): ?float
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_numeric($value)) {
        return null;
    }
    $floatValue = (float)$value;
    return is_finite($floatValue) ? $floatValue : null;
}

function detailNormalizeFloatRange(mixed $value): ?float
{
    $floatValue = detailFloatOrNull($value);
    if ($floatValue === null) {
        return null;
    }
    if ($floatValue > 1.0) {
        $floatValue /= 100.0;
    }
    return max(0.0, min(1.0, round($floatValue, 4)));
}

function detailFormatFloatRange(?float $min, ?float $max): string
{
    $lo = $min ?? 0.0;
    $hi = $max ?? 1.0;
    return sprintf('%.2f - %.2f', $lo, $hi);
}

function detailAbsoluteUrl(string $url): string
{
    $url = trim($url);
    if ($url === '') {
        return '';
    }
    if (str_starts_with($url, '//')) {
        return 'https:' . $url;
    }
    if (str_starts_with($url, 'http://') || str_starts_with($url, 'https://')) {
        return $url;
    }
    return $url;
}

function detailRarityCss(string $rarity): string
{
    $normalized = str_replace([' ', '-'], '_', trim($rarity));

    return match ($normalized) {
        'Covert', 'Extraordinary' => 'covert',
        'Classified', 'Exotic' => 'classified',
        'Restricted', 'Remarkable' => 'restricted',
        'Mil_Spec', 'High_Grade', 'HighGrade' => 'milspec',
        'Industrial' => 'industrial',
        'Consumer', 'Base_Grade', 'BaseGrade' => 'consumer',
        'Contraband' => 'covert',
        default => 'milspec',
    };
}

function detailRarityBadge(string $rarity): string
{
    $normalized = str_replace([' ', '-'], '_', trim($rarity));

    return match ($normalized) {
        'Covert' => 'Covert',
        'Extraordinary' => 'Extraordinary',
        'Classified' => 'Classified',
        'Exotic' => 'Exotic',
        'Restricted' => 'Restricted',
        'Remarkable' => 'Remarkable',
        'Mil_Spec' => 'Mil-Spec',
        'High_Grade', 'HighGrade' => 'High Grade',
        'Industrial' => 'Industrial Grade',
        'Consumer' => 'Consumer Grade',
        'Base_Grade', 'BaseGrade' => 'Base Grade',
        'Contraband' => 'Contraband',
        default => str_replace('_', ' ', $rarity),
    };
}

function detailRarityRank(string $rarity): int
{
    $normalized = str_replace([' ', '-'], '_', trim($rarity));

    return match ($normalized) {
        'Contraband' => 0,
        'Covert', 'Extraordinary' => 1,
        'Classified', 'Exotic' => 2,
        'Restricted', 'Remarkable' => 3,
        'Mil_Spec', 'High_Grade', 'HighGrade' => 4,
        'Industrial' => 5,
        'Consumer', 'Base_Grade', 'BaseGrade' => 6,
        default => 7,
    };
}

function detailParseWeaponSkin(string $name): array
{
    $parts = array_map('trim', explode('|', $name, 2));
    if (count($parts) === 2 && $parts[0] !== '' && $parts[1] !== '') {
        return ['weapon' => $parts[0], 'skin' => $parts[1]];
    }

    return ['weapon' => $name, 'skin' => $name];
}

function detailBuildItems(array $detail): array
{
    $itemsMeta = is_array($detail['Items'] ?? null) ? $detail['Items'] : [];
    $costGroups = is_array($detail['ItemCosts'] ?? null) ? $detail['ItemCosts'] : [];
    $items = [];

    foreach ($costGroups as $rarity => $groupItems) {
        if (!is_array($groupItems) || !$groupItems) {
            continue;
        }

        foreach ($groupItems as $name => $priceValues) {
            $meta = is_array($itemsMeta[$name] ?? null) ? $itemsMeta[$name] : [];
            $parsed = detailParseWeaponSkin((string)$name);
            $floatMin = detailNormalizeFloatRange($meta['FloatMin'] ?? null);
            $floatMax = detailNormalizeFloatRange($meta['FloatMax'] ?? null);
            $weapon = (string)$parsed['weapon'];
            $skin = (string)$parsed['skin'];
            $isNonWear = (bool)preg_match(
                '/^(Sticker|Patch|Charm|Agent|Pin|Music Kit|Sealed Graffiti|Graffiti)\b/i',
                $weapon
            ) || (bool)preg_match(
                '/^(Sticker|Patch|Charm|Agent|Pin|Music Kit|Sealed Graffiti|Graffiti)\s*\|/i',
                (string)$name
            );

            $flatName = '';
            if ($isNonWear) {
                $flatName = (string)$name;
                if ($weapon !== '' && $skin !== '' && !str_contains($flatName, '|')) {
                    $flatName = $weapon . ' | ' . $skin;
                }
            }

            $items[] = [
                'weapon' => $weapon,
                'skin' => $skin,
                'rarity' => detailRarityCss((string)$rarity),
                'badge' => detailRarityBadge((string)$rarity),
                'img' => detailAbsoluteUrl((string)($meta['ImageUrl'] ?? '')),
                'float' => $isNonWear ? '' : detailFormatFloatRange($floatMin, $floatMax),
                'noWear' => $isNonWear,
                'flatName' => $flatName,
                'market_hash_name' => (string)$name,
                '_rarity_rank' => detailRarityRank((string)$rarity),
            ];
        }
    }

    usort($items, static function (array $left, array $right): int {
        $leftRank = (int)($left['_rarity_rank'] ?? 99);
        $rightRank = (int)($right['_rarity_rank'] ?? 99);
        if ($leftRank !== $rightRank) {
            return $leftRank <=> $rightRank;
        }

        return strcmp((string)($left['skin'] ?? ''), (string)($right['skin'] ?? ''));
    });

    foreach ($items as &$item) {
        unset($item['_rarity_rank']);
    }
    unset($item);

    return $items;
}

function detailStripArticle(string $name): string
{
    return preg_replace('/^the\s+/i', '', detailNormalizeName($name)) ?? detailNormalizeName($name);
}

function detailFindCatalogEntry(array $catalog, string $query): ?array
{
    $needle = detailNormalizeName($query);
    if ($needle === '') {
        return null;
    }

    $needleLoose = detailStripArticle($needle);

    foreach ($catalog as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $name = detailNormalizeName((string)($entry['Name'] ?? ''));
        if ($name === $needle || detailStripArticle($name) === $needleLoose) {
            return $entry;
        }
    }

    foreach ($catalog as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $name = detailNormalizeName((string)($entry['Name'] ?? ''));
        $nameLoose = detailStripArticle($name);
        if ($name !== '' && (
            str_contains($name, $needle)
            || str_contains($needle, $name)
            || str_contains($nameLoose, $needleLoose)
            || str_contains($needleLoose, $nameLoose)
        )) {
            return $entry;
        }
    }

    return null;
}

/**
 * One-way aliases: collection pages whose skins are catalogued only under
 * a StatTrak drop container. Does not rewrite terminal/case queries.
 */
function detailCollectionItemSource(string $query): string
{
    static $aliases = [
        'the genesis collection' => 'Sealed Genesis Terminal',
        'genesis collection' => 'Sealed Genesis Terminal',
    ];

    $needle = detailNormalizeName($query);
    $loose = detailStripArticle($needle);

    return $aliases[$needle] ?? $aliases[$loose] ?? $query;
}

function detailCatalogCachePath(): string
{
    return __DIR__ . '/assets/cache/allTrackedCases.json';
}

function detailLoadCatalog(): ?array
{
    $cachePath = detailCatalogCachePath();
    $ttlSeconds = 86400;

    if (is_file($cachePath)) {
        $modifiedAt = @filemtime($cachePath);
        if ($modifiedAt !== false && $modifiedAt >= time() - $ttlSeconds) {
            $cached = json_decode((string)@file_get_contents($cachePath), true);
            if (is_array($cached) && $cached) {
                return $cached;
            }
        }
    }

    $catalog = detailFetchJson('https://csroi.com/pastData/allTrackedCases.json', 30);
    if (!is_array($catalog) || !$catalog) {
        return null;
    }

    $cacheDir = dirname($cachePath);
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0775, true);
    }
    @file_put_contents($cachePath, json_encode($catalog, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

    return $catalog;
}

function detailCapsuleLookupPath(): string
{
    return __DIR__ . '/assets/data/capsule-contents-lookup.json';
}

function detailLoadCapsuleLookup(): ?array
{
    static $lookup = null;
    if (is_array($lookup)) {
        return $lookup;
    }

    $path = detailCapsuleLookupPath();
    if (!is_file($path)) {
        $lookup = [];
        return $lookup;
    }

    $decoded = json_decode((string)@file_get_contents($path), true);
    $lookup = is_array($decoded) ? $decoded : [];
    return $lookup;
}

/**
 * @return list<array<string, mixed>>
 */
function detailFindCapsuleItems(string $query): array
{
    $lookup = detailLoadCapsuleLookup();
    if (!$lookup) {
        return [];
    }

    $needle = detailNormalizeName($query);
    if ($needle === '') {
        return [];
    }

    $aliases = [$needle];
    $aliases[] = str_replace('holo-foil', 'holo/foil', $needle);
    $aliases[] = str_replace('holo/foil', 'holo-foil', $needle);
    $aliases = array_values(array_unique(array_filter($aliases)));

    foreach ($lookup as $key => $items) {
        if (!is_array($items) || count($items) < 2) {
            continue;
        }
        $keyNorm = detailNormalizeName((string)$key);
        if (in_array($keyNorm, $aliases, true)) {
            return array_values($items);
        }
    }

    foreach ($lookup as $key => $items) {
        if (!is_array($items) || count($items) < 2) {
            continue;
        }
        $keyNorm = detailNormalizeName((string)$key);
        if ($keyNorm !== '' && (
            str_contains($keyNorm, $needle)
            || str_contains($needle, $keyNorm)
        )) {
            return array_values($items);
        }
    }

    return [];
}

function detailRespondCapsuleItems(string $name, array $items): never
{
    $payload = [
        'success' => true,
        'name' => $name,
        'matched' => true,
        'source' => 'capsule_lookup',
        'items' => $items,
        'items_count' => count($items),
        'updated_at' => time(),
    ];
    detailSaveCache('detail_items_' . md5(detailNormalizeName($name)) . '.json', $payload);
    detailRespond($payload);
}

$name = trim((string)($_GET['name'] ?? ''));
if ($name === '') {
    detailRespond(['success' => false, 'error' => 'Missing name parameter.'], 400);
}

$cacheKey = 'detail_items_' . md5(detailNormalizeName($name)) . '.json';
$cached = detailLoadCache($cacheKey, 3600);
if ($cached !== null) {
    detailRespond($cached);
}

$catalog = detailLoadCatalog();
if (!is_array($catalog)) {
    $capsuleItems = detailFindCapsuleItems($name);
    if (count($capsuleItems) >= 2) {
        detailRespondCapsuleItems($name, $capsuleItems);
    }
    detailRespond(['success' => false, 'error' => 'Unable to load catalog.'], 500);
}

$entry = detailFindCatalogEntry($catalog, $name);
if (!is_array($entry) || (int)($entry['CollectionId'] ?? 0) <= 0) {
    $itemSource = detailCollectionItemSource($name);
    if ($itemSource !== $name) {
        $entry = detailFindCatalogEntry($catalog, $itemSource);
    }
}
$collectionId = is_array($entry) ? (int)($entry['CollectionId'] ?? 0) : 0;
if ($collectionId <= 0) {
    $capsuleItems = detailFindCapsuleItems($name);
    if (count($capsuleItems) >= 2) {
        detailRespondCapsuleItems($name, $capsuleItems);
    }
    detailRespond([
        'success' => true,
        'name' => $name,
        'items' => [],
        'matched' => false,
    ]);
}

$detail = detailFetchJson(sprintf('https://csroi.com/case/steam/%d/data.json', $collectionId), 30);
if (!is_array($detail)) {
    detailRespond(['success' => false, 'error' => 'Unable to load item data.'], 500);
}

$items = detailBuildItems($detail);
$payload = [
    'success' => true,
    'name' => (string)($entry['Name'] ?? $name),
    'collection_id' => $collectionId,
    'matched' => true,
    'items' => $items,
    'items_count' => count($items),
    'updated_at' => time(),
];

detailSaveCache($cacheKey, $payload);
detailRespond($payload);
