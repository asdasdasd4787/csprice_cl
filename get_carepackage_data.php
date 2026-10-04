<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';

set_time_limit(120);

header('Content-Type: application/json; charset=utf-8');

function carePackageRespond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($status === 200) {
        carePackageWarmDropCharts($payload);
    }
    exit;
}

function carePackageSiteBase(): string
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'
        || (int)($_SERVER['SERVER_PORT'] ?? 0) === 443;
    return ($https ? 'https' : 'http') . '://' . (string)($_SERVER['HTTP_HOST'] ?? 'localhost')
        . rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
}

/**
 * Every item the "Price drop comparison" chart can show: the case / terminal
 * / graffiti / tool catalog rewards plus every skin inside the collection
 * rewards (the board and the roll history are random picks from these).
 */
function carePackageChartCandidateNames(array $payload): array
{
    $names = [];
    $add = static function (mixed $value) use (&$names): void {
        $name = trim((string)$value);
        if ($name !== '' && !isset($names[$name])) {
            $names[$name] = true;
        }
    };
    foreach ((array)($payload['sources'] ?? []) as $source) {
        foreach ((array)($source['catalog'] ?? []) as $entries) {
            foreach ((array)$entries as $entry) {
                $add($entry['market_hash_name'] ?? $entry['name'] ?? '');
            }
        }
        foreach ((array)($source['rewards'] ?? []) as $reward) {
            $add($reward['market_hash_name'] ?? '');
            foreach ((array)($reward['items'] ?? []) as $item) {
                $add($item['market_hash_name'] ?? $item['name'] ?? '');
            }
        }
    }
    return array_keys($names);
}

/** Chart-bundle query for one drop name, exactly as the page requests it. */
function carePackageChartQuery(string $name): array
{
    $lookup = $name;
    $wear = '';
    foreach (['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'] as $candidate) {
        if (str_ends_with($name, " ($candidate)")) {
            $wear = $candidate;
            $lookup = substr($name, 0, -strlen(" ($candidate)"));
            break;
        }
    }
    return ['lookup_name' => $lookup, 'display_name' => $lookup, 'wear' => $wear, 'range' => '1Y', 'source' => 'steam'];
}

/**
 * The chart reads each drop's 1Y chart bundle. A cold bundle takes 5–25 s to
 * build on the host, a cached one ~0.1 s, so after the JSON is sent one
 * detached self-request (?warm_charts=1) builds whatever is missing or stale.
 * One 300 ms hang-up, at most every 10 minutes: the visitor never waits.
 */
function carePackageWarmDropCharts(array $payload): void
{
    $cacheLib = __DIR__ . '/market_chart_bundle_cache.php';
    if (!is_file($cacheLib) || !function_exists('curl_init')) {
        return;
    }
    require_once $cacheLib;
    if (!function_exists('cacheSpawnBackgroundRefresh')) {
        return;
    }
    $lock = carePackageCachePath('chart_warm.lock');
    if (is_file($lock) && (time() - (int)filemtime($lock)) < 600) {
        return;
    }
    @touch($lock);
    @ignore_user_abort(true);
    @ob_flush();
    @flush();
    // cacheSpawnBackgroundRefresh() keeps its own short-lived lock file; the
    // 10-minute lock above is the real throttle.
    cacheSpawnBackgroundRefresh(carePackageSiteBase() . '/get_carepackage_data.php?warm_charts=1', null, $lock . '.spawn');
}

/**
 * Detached worker (see above): builds missing / stale chart bundles for the
 * chart candidates, sequentially, newest cache first skipped. Stops after the
 * time budget; the next page view continues where it left off.
 */
function carePackageRunChartWarm(): never
{
    @ignore_user_abort(true);
    @set_time_limit(0);
    header('Content-Type: text/plain; charset=utf-8');
    $cacheLib = __DIR__ . '/market_chart_bundle_cache.php';
    if (!is_file($cacheLib) || !function_exists('curl_init')) {
        echo "no cache lib\n";
        exit;
    }
    require_once $cacheLib;
    $payload = carePackageLoadCache('carepackage_bundle_v7.json', 86400);
    if (!is_array($payload)) {
        echo "no cached payload\n";
        exit;
    }
    // Small budget on purpose: this worker holds one of the host's few PHP
    // processes, so it builds a handful of bundles and stops. The next page
    // view (10 minutes later at the earliest) continues where it left off.
    $base = carePackageSiteBase();
    $deadline = time() + 45;
    $maxBuilds = 6;
    $built = 0;
    $skipped = 0;
    foreach (carePackageChartCandidateNames($payload) as $name) {
        if (time() > $deadline || $built >= $maxBuilds) {
            break;
        }
        $query = carePackageChartQuery($name);
        $file = marketChartBundleCachePath($query);
        if (is_file($file) && (time() - (int)filemtime($file)) <= MARKET_CHART_CACHE_FRESH_TTL) {
            $skipped++;
            continue;
        }
        $ch = curl_init($base . '/get_market_chart_bundle.php?' . http_build_query($query));
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_USERAGENT => 'CSPRICE care-package chart warm',
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
        ]);
        curl_exec($ch);
        curl_close($ch);
        $built++;
    }
    echo "warm done: built=$built skipped=$skipped\n";
    exit;
}

if (isset($_GET['warm_charts']) && (string)$_GET['warm_charts'] === '1') {
    carePackageRunChartWarm();
}

/**
 * Detached self-request that rebuilds the feed (?refresh=1). One at a time:
 * the lock is left for 10 minutes, which covers the slowest rebuild seen.
 */
function carePackageSpawnRefresh(): void
{
    $cacheLib = __DIR__ . '/market_chart_bundle_cache.php';
    if (!is_file($cacheLib) || !function_exists('curl_init')) {
        return;
    }
    require_once $cacheLib;
    if (!function_exists('cacheSpawnBackgroundRefresh')) {
        return;
    }
    $lock = carePackageCachePath('feed_refresh.lock');
    if (is_file($lock) && (time() - (int)filemtime($lock)) < 600) {
        return;
    }
    @touch($lock);
    cacheSpawnBackgroundRefresh(carePackageSiteBase() . '/get_carepackage_data.php?refresh=1', null, $lock . '.spawn');
}

function carePackageCachePath(string $name): string
{
    $normalized = preg_replace('/[^a-z0-9_.-]+/i', '_', strtolower($name)) ?: 'carepackage.json';
    return rtrim(sys_get_temp_dir(), '\\/') . DIRECTORY_SEPARATOR . 'csgo_price_tracker_' . $normalized;
}

function carePackageLoadCache(string $name, int $ttlSeconds): ?array
{
    $path = carePackageCachePath($name);
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

function carePackageSaveCache(string $name, array $payload): void
{
    @file_put_contents(carePackageCachePath($name), json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
}

function carePackageFetchJson(string $url, array $headers = [], int $timeoutSeconds = 25): ?array
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
        CURLOPT_HTTPHEADER => array_merge(['Accept: application/json'], $headers),
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

function carePackageMultiFetchJson(array $requests, array $headers = [], int $timeoutSeconds = 25): array
{
    $multi = curl_multi_init();
    $handles = [];

    foreach ($requests as $key => $url) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_CONNECTTIMEOUT => min(10, $timeoutSeconds),
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                . '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            CURLOPT_HTTPHEADER => array_merge(['Accept: application/json'], $headers),
        ]);

        curl_multi_add_handle($multi, $curl);
        $handles[(int)$curl] = [
            'key' => (string)$key,
            'handle' => $curl,
        ];
    }

    do {
        $status = curl_multi_exec($multi, $running);
        if ($running) {
            curl_multi_select($multi, 1.0);
        }
    } while ($running && $status === CURLM_OK);

    $results = [];
    foreach ($handles as $entry) {
        $curl = $entry['handle'];
        $body = curl_multi_getcontent($curl);
        $statusCode = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $decoded = null;
        if ($statusCode < 400 && is_string($body) && $body !== '') {
            $parsed = json_decode($body, true);
            if (is_array($parsed)) {
                $decoded = $parsed;
            }
        }

        $results[$entry['key']] = $decoded;
        curl_multi_remove_handle($multi, $curl);
        curl_close($curl);
    }

    curl_multi_close($multi);

    return $results;
}

function carePackageSlug(string $value): string
{
    $normalized = preg_replace('/[^a-z0-9]+/i', '-', strtolower(trim($value))) ?: 'reward';
    return trim($normalized, '-');
}

function carePackageAbsoluteUrl(?string $url): string
{
    $value = trim((string)$url);
    if ($value === '') {
        return '';
    }

    if (preg_match('/^https?:\/\//i', $value)) {
        return $value;
    }

    if (str_starts_with($value, '//')) {
        return 'https:' . $value;
    }

    if (str_starts_with($value, '/')) {
        return 'https://csroi.com' . $value;
    }

    return 'https://csroi.com/' . ltrim($value, '/');
}

function carePackageFloatOrNull(mixed $value): ?float
{
    if ($value === null || $value === '' || !is_numeric($value)) {
        return null;
    }

    $floatValue = (float)$value;
    return is_finite($floatValue) ? $floatValue : null;
}

function carePackageIntOrNull(mixed $value): ?int
{
    if ($value === null || $value === '' || !is_numeric($value)) {
        return null;
    }

    return (int)$value;
}

function carePackageFormatEuro(?float $value): ?string
{
    if ($value === null || !is_finite($value)) {
        return null;
    }

    return '€' . number_format($value, 2, '.', '');
}

function carePackageNormalizeFloatRange(mixed $value): ?float
{
    $floatValue = carePackageFloatOrNull($value);
    if ($floatValue === null) {
        return null;
    }

    if ($floatValue > 1.0) {
        $floatValue /= 100.0;
    }

    if ($floatValue < 0.0) {
        return 0.0;
    }

    if ($floatValue > 1.0) {
        return 1.0;
    }

    return round($floatValue, 6);
}

function carePackageRewardKind(array $summary, array $detail): string
{
    $type = strtolower(trim((string)($summary['CollectionType'] ?? $detail['Type'] ?? '')));
    $name = strtolower(trim((string)($summary['Name'] ?? $detail['Case'] ?? '')));

    if ($type !== '') {
        if (str_contains($type, 'terminal')) {
            return 'terminal';
        }
        if (str_contains($type, 'collection')) {
            return 'collection';
        }
        if (str_contains($type, 'case')) {
            return 'case';
        }
    }

    if (str_contains($name, 'terminal')) {
        return 'terminal';
    }
    if (str_contains($name, 'collection')) {
        return 'collection';
    }
    if (str_contains($name, 'case')) {
        return 'case';
    }

    return 'reward';
}

function carePackageRarityRank(string $rarity): int
{
    return match ($rarity) {
        'Contraband' => 0,
        'Covert' => 1,
        'Classified' => 2,
        'Restricted' => 3,
        'Mil_Spec' => 4,
        'Industrial' => 5,
        'Consumer' => 6,
        default => 7,
    };
}

function carePackagePreferredItemValue(array $item): ?float
{
    foreach ([
        'price_total',
        'price_factory_new',
        'price_minimal_wear',
        'price_field_tested',
        'price_well_worn',
        'price_battle_scarred',
    ] as $key) {
        $value = carePackageFloatOrNull($item[$key] ?? null);
        if ($value !== null && $value > 0) {
            return $value;
        }
    }

    return null;
}

function carePackageBuildItems(array $detail): array
{
    $itemsMeta = is_array($detail['Items'] ?? null) ? $detail['Items'] : [];
    $costGroups = is_array($detail['ItemCosts'] ?? null) ? $detail['ItemCosts'] : [];
    $chanceGroups = is_array($detail['PercentReceive'] ?? null) ? $detail['PercentReceive'] : [];

    $items = [];
    foreach ($costGroups as $rarity => $groupItems) {
        if (!is_array($groupItems) || !$groupItems) {
            continue;
        }

        $chance = carePackageFloatOrNull($chanceGroups[$rarity] ?? null) ?? 0.0;
        $count = count($groupItems);
        $perItemChance = $count > 0 ? ($chance / $count) : 0.0;

        foreach ($groupItems as $name => $priceValues) {
            $meta = is_array($itemsMeta[$name] ?? null) ? $itemsMeta[$name] : [];
            $prices = is_array($priceValues) ? $priceValues : [];

            $items[] = [
                'name' => (string)$name,
                'image' => carePackageAbsoluteUrl($meta['ImageUrl'] ?? ''),
                'rarity' => (string)$rarity,
                'rarity_rank' => carePackageRarityRank((string)$rarity),
                'float_min' => carePackageNormalizeFloatRange($meta['FloatMin'] ?? null),
                'float_max' => carePackageNormalizeFloatRange($meta['FloatMax'] ?? null),
                'drop_chance' => round($perItemChance, 8),
                'drop_chance_pct' => round($perItemChance * 100, 4),
                'price_factory_new' => carePackageFloatOrNull($prices['FactoryNew'] ?? null),
                'price_minimal_wear' => carePackageFloatOrNull($prices['MinimalWear'] ?? null),
                'price_field_tested' => carePackageFloatOrNull($prices['FieldTested'] ?? null),
                'price_well_worn' => carePackageFloatOrNull($prices['WellWorn'] ?? null),
                'price_battle_scarred' => carePackageFloatOrNull($prices['BattleScarred'] ?? null),
                'price_total' => carePackageFloatOrNull($prices['totalItemValue'] ?? null),
            ];
        }
    }

    usort($items, static function (array $left, array $right): int {
        $leftValue = carePackagePreferredItemValue($left) ?? -INF;
        $rightValue = carePackagePreferredItemValue($right) ?? -INF;
        if ($leftValue !== $rightValue) {
            return $rightValue <=> $leftValue;
        }

        $leftRank = (int)($left['rarity_rank'] ?? 99);
        $rightRank = (int)($right['rarity_rank'] ?? 99);
        if ($leftRank !== $rightRank) {
            return $leftRank <=> $rightRank;
        }

        return strcmp((string)($left['name'] ?? ''), (string)($right['name'] ?? ''));
    });

    return $items;
}

function carePackageBuildRarityBreakdown(array $detail): array
{
    $costGroups = is_array($detail['ItemCosts'] ?? null) ? $detail['ItemCosts'] : [];
    $chanceGroups = is_array($detail['PercentReceive'] ?? null) ? $detail['PercentReceive'] : [];
    $breakdown = [];

    foreach ($costGroups as $rarity => $groupItems) {
        if (!is_array($groupItems) || !$groupItems) {
            continue;
        }

        $total = 0.0;
        $count = 0;
        foreach ($groupItems as $prices) {
            if (!is_array($prices)) {
                continue;
            }
            $value = carePackageFloatOrNull($prices['totalItemValue'] ?? null);
            if ($value === null || $value <= 0) {
                continue;
            }
            $total += $value;
            $count++;
        }

        $breakdown[] = [
            'rarity' => (string)$rarity,
            'chance' => round((carePackageFloatOrNull($chanceGroups[$rarity] ?? null) ?? 0.0) * 100, 4),
            'count' => count($groupItems),
            'average_value' => $count > 0 ? round($total / $count, 4) : null,
            'average_value_display' => $count > 0 ? carePackageFormatEuro(round($total / $count, 4)) : null,
            'rarity_rank' => carePackageRarityRank((string)$rarity),
        ];
    }

    usort($breakdown, static fn (array $left, array $right): int => ((int)$left['rarity_rank']) <=> ((int)$right['rarity_rank']));

    return $breakdown;
}

function carePackageExpectedItemValue(array $items): ?float
{
    if (!$items) {
        return null;
    }

    $total = 0.0;
    $hasValue = false;
    foreach ($items as $item) {
        $chance = carePackageFloatOrNull($item['drop_chance'] ?? null);
        $value = carePackagePreferredItemValue($item);
        if ($chance === null || $chance <= 0 || $value === null || $value <= 0) {
            continue;
        }

        $total += $chance * $value;
        $hasValue = true;
    }

    return $hasValue ? round($total, 4) : null;
}

function carePackageBuildReward(array $summary, array $detail, string $source): array
{
    $id = carePackageIntOrNull($summary['CollectionId'] ?? null) ?? 0;
    $name = trim((string)($summary['Name'] ?? $detail['Case'] ?? ('Reward ' . $id)));
    $kind = carePackageRewardKind($summary, $detail);
    $items = carePackageBuildItems($detail);
    $expectedValue = carePackageExpectedItemValue($items);

    $sourcePrefix = ucfirst($source);
    $summarySourcePrice = carePackageFloatOrNull($summary['CollectionPrice' . $sourcePrefix] ?? null);
    $detailSourcePrice = carePackageFloatOrNull($detail['CaseCost'] ?? null);
    $sourcePrice = match ($kind) {
        'case' => $summarySourcePrice ?? $detailSourcePrice,
        'terminal' => $detailSourcePrice ?? $summarySourcePrice,
        default => $summarySourcePrice ?? $detailSourcePrice,
    };

    $listings = null;
    foreach ([
        $summary['NumListings'] ?? null,
        $detail['NumListings'] ?? null,
        $detail['NumSteamListings'] ?? null,
        $detail['NumSkinportListings'] ?? null,
    ] as $candidate) {
        $listings = carePackageIntOrNull($candidate);
        if ($listings !== null) {
            break;
        }
    }

    $image = carePackageAbsoluteUrl($summary['Image'] ?? '') ?: carePackageAbsoluteUrl($detail['ImageUrl'] ?? '');
    $liveValue = $kind === 'collection' ? $expectedValue : $sourcePrice;
    $liveValueLabel = $kind === 'collection' ? 'Expected skin value' : 'Live market value';

    return [
        'id' => $id,
        'name' => $name,
        'slug' => carePackageSlug($name),
        'kind' => $kind,
        'drop_type' => (string)($summary['DropType'] ?? 'Active Drop'),
        'image' => $image,
        'source' => $source,
        'market_price' => $sourcePrice,
        'market_price_display' => carePackageFormatEuro($sourcePrice),
        'live_value' => $liveValue,
        'live_value_display' => carePackageFormatEuro($liveValue),
        'live_value_label' => $liveValueLabel,
        'expected_value' => $expectedValue,
        'expected_value_display' => carePackageFormatEuro($expectedValue),
        'listings' => $listings,
        'items_count' => count($items),
        'top_items' => array_slice($items, 0, 4),
        'items' => $items,
        'rarity_breakdown' => carePackageBuildRarityBreakdown($detail),
        'updated_at' => (int)($summary['UpdatedAt'] ?? time()),
    ];
}

function carePackageBuildSyntheticReward(
    int $id,
    string $name,
    string $kind,
    string $source,
    ?float $price,
    string $image,
    ?int $listings = null
): array {
    return [
        'id' => $id,
        'name' => $name,
        'slug' => carePackageSlug($name),
        'kind' => $kind,
        'drop_type' => 'Active Drop',
        'image' => $image,
        'source' => $source,
        'market_price' => $price,
        'market_price_display' => carePackageFormatEuro($price),
        'live_value' => $price,
        'live_value_display' => carePackageFormatEuro($price),
        'live_value_label' => 'Live market value',
        'expected_value' => $price,
        'expected_value_display' => carePackageFormatEuro($price),
        'listings' => $listings,
        'items_count' => 0,
        'top_items' => [],
        'items' => [],
        'rarity_breakdown' => [],
        'updated_at' => time(),
    ];
}

function carePackageLoadMarketCatalogByCategory(string $category): array
{
    $catalogPath = __DIR__ . '/assets/steam-market-cache/roi_catalog.json';
    if (!is_file($catalogPath)) {
        return [];
    }

    $decoded = json_decode((string)file_get_contents($catalogPath), true);
    $items = is_array($decoded['items'] ?? null) ? $decoded['items'] : [];
    $target = strtolower(trim($category));

    $results = [];
    foreach ($items as $item) {
        if (!is_array($item) || strtolower(trim((string)($item['category'] ?? ''))) !== $target) {
            continue;
        }

        $typeNote = trim((string)($item['type_note'] ?? ''));
        if (
            $target === 'graffiti'
            && strtolower($typeNote) !== 'base grade graffiti'
        ) {
            continue;
        }

        $name = trim((string)($item['display_name'] ?? $item['market_hash_name'] ?? ''));
        $image = trim((string)($item['image'] ?? ''));
        if ($name === '' || $image === '') {
            continue;
        }

        $sellPrice = carePackageFloatOrNull($item['sell_price'] ?? null);
        $seedPrice = carePackageFloatOrNull($item['seed_sell_price'] ?? null);
        $sellListings = carePackageIntOrNull($item['sell_listings'] ?? null);
        $seedListings = carePackageIntOrNull($item['seed_sell_listings'] ?? null);
        $price = $sellPrice ?? $seedPrice;
        $listings = $sellListings ?? $seedListings;

        if ($target === 'graffiti') {
            if ($price === null || $price <= 0) {
                $price = 0.03;
            }

            // Seeded spray values can spike into nonsense when there are no live listings.
            if (($listings ?? 0) <= 0 && $price > 1.0) {
                $price = 0.03;
            }
        }

        $results[] = [
            'id' => carePackageIntOrNull($item['id'] ?? null) ?? (100000 + count($results)),
            'name' => $name,
            'market_hash_name' => trim((string)($item['market_hash_name'] ?? $name)),
            'image' => $image,
            'category' => $target,
            'type_note' => $typeNote,
            'price' => $price,
            'price_display' => carePackageFormatEuro($price),
            'listings' => $listings,
        ];
    }

    usort($results, static function (array $left, array $right): int {
        $leftValue = carePackageFloatOrNull($left['price'] ?? null) ?? -INF;
        $rightValue = carePackageFloatOrNull($right['price'] ?? null) ?? -INF;
        if ($leftValue !== $rightValue) {
            return $rightValue <=> $leftValue;
        }

        return strcmp((string)($left['name'] ?? ''), (string)($right['name'] ?? ''));
    });

    return $results;
}

function carePackageBuildCatalogReward(array $item, string $kind, string $source, int $offset): array
{
    $price = carePackageFloatOrNull($item['price'] ?? null);
    $name = trim((string)($item['name'] ?? ''));

    return [
        'id' => 200000 + $offset,
        'name' => $name,
        'slug' => carePackageSlug($name),
        'kind' => $kind,
        'drop_type' => 'Catalog',
        'image' => trim((string)($item['image'] ?? '')),
        'source' => $source,
        'market_hash_name' => trim((string)($item['market_hash_name'] ?? $name)),
        'market_price' => $price,
        'market_price_display' => carePackageFormatEuro($price),
        'live_value' => $price,
        'live_value_display' => carePackageFormatEuro($price),
        'live_value_label' => 'Live market value',
        'expected_value' => $price,
        'expected_value_display' => carePackageFormatEuro($price),
        'listings' => carePackageIntOrNull($item['listings'] ?? null),
        'items_count' => 0,
        'top_items' => [],
        'items' => [],
        'rarity_breakdown' => [],
        'catalog_only' => true,
        'catalog_subtitle' => trim((string)($item['type_note'] ?? '')) ?: 'Sealed Graffiti',
        'updated_at' => time(),
    ];
}

function carePackageBuildSourceSummary(array $rewards): array
{
    $liveValues = [];
    $bestReward = null;
    $cases = 0;
    $collections = 0;
    $terminals = 0;
    $graffitis = 0;
    $tools = 0;

    foreach ($rewards as $reward) {
        $kind = (string)($reward['kind'] ?? '');
        if ($kind === 'case') {
            $cases++;
        } elseif ($kind === 'collection') {
            $collections++;
        } elseif ($kind === 'terminal') {
            $terminals++;
        } elseif ($kind === 'graffiti') {
            $graffitis++;
        } elseif ($kind === 'tool') {
            $tools++;
        }

        if (!empty($reward['catalog_only']) || !empty($reward['sim_only'])) {
            continue;
        }

        $value = carePackageFloatOrNull($reward['live_value'] ?? null);
        if ($value !== null && $value > 0) {
            $liveValues[] = $value;
            if ($bestReward === null || $value > (carePackageFloatOrNull($bestReward['live_value'] ?? null) ?? 0)) {
                $bestReward = $reward;
            }
        }
    }

    $averageLive = $liveValues ? round(array_sum($liveValues) / count($liveValues), 4) : null;

    return [
        'reward_count' => count($rewards),
        'case_count' => $cases,
        'collection_count' => $collections,
        'terminal_count' => $terminals,
        'graffiti_count' => $graffitis,
        'tool_count' => $tools,
        'average_live_value' => $averageLive,
        'average_live_value_display' => carePackageFormatEuro($averageLive),
        'best_reward_name' => $bestReward['name'] ?? null,
        'best_reward_value' => $bestReward['live_value'] ?? null,
        'best_reward_value_display' => carePackageFormatEuro(carePackageFloatOrNull($bestReward['live_value'] ?? null)),
    ];
}

$refresh = isset($_GET['refresh']) && (string)$_GET['refresh'] === '1';
$cacheKey = 'carepackage_bundle_v7.json';

if ($refresh) {
    // Spawned below with a 300 ms hang-up: keep building after the caller is gone.
    @ignore_user_abort(true);
    @set_time_limit(180);
}

if (!$refresh) {
    $cached = carePackageLoadCache($cacheKey, 1800);
    if ($cached !== null) {
        carePackageRespond($cached);
    }
    // Past the 30-minute TTL but still on disk: answer with it right away and
    // rebuild behind the scenes. A cold rebuild pulls the whole csroi feed
    // plus every collection detail (25 s timeouts each) and could outlast the
    // proxy, so the visitor who happened to expire the cache got "Care package
    // feed unavailable" instead of a page.
    $stale = carePackageLoadCache($cacheKey, 7 * 86400);
    if ($stale !== null) {
        carePackageSpawnRefresh();
        carePackageRespond($stale);
    }
}

$catalog = carePackageFetchJson('https://csroi.com/pastData/allTrackedCases.json');
if (!is_array($catalog)) {
    carePackageRespond([
        'success' => false,
        'error' => 'Unable to load care package source data.',
    ], 500);
}

$activeEntries = array_values(array_filter($catalog, static function ($row): bool {
    return is_array($row)
        && strtolower(trim((string)($row['DropType'] ?? ''))) === 'active drop'
        && carePackageIntOrNull($row['CollectionId'] ?? null) !== null;
}));

usort($activeEntries, static fn (array $left, array $right): int => strcmp((string)($left['Name'] ?? ''), (string)($right['Name'] ?? '')));

$requests = [];
foreach (['steam', 'skinport'] as $source) {
    foreach ($activeEntries as $entry) {
        $id = carePackageIntOrNull($entry['CollectionId'] ?? null);
        if ($id === null) {
            continue;
        }
        $requests[$source . ':' . $id] = sprintf('https://csroi.com/case/%s/%d/data.json', $source, $id);
    }
}

$details = carePackageMultiFetchJson($requests);
$sources = [
    'steam' => ['label' => 'Steam Market', 'rewards' => [], 'catalog' => []],
    'skinport' => ['label' => 'Skinport', 'rewards' => [], 'catalog' => []],
];

$graffitiCatalog = carePackageLoadMarketCatalogByCategory('graffiti');
$graffitiValues = array_values(array_filter(
    array_map(static fn (array $item): ?float => carePackageFloatOrNull($item['price'] ?? null), $graffitiCatalog),
    static fn (?float $value): bool => $value !== null && $value > 0
));
$graffitiAveragePrice = $graffitiValues
    ? round(array_sum($graffitiValues) / count($graffitiValues), 4)
    : 0.03;

$syntheticRewards = [
    [
        'id' => 9001,
        'name' => 'Graffiti Drop',
        'kind' => 'graffiti',
        'image' => trim((string)($graffitiCatalog[0]['image'] ?? '')),
        'prices' => [
            'steam' => $graffitiAveragePrice,
            'skinport' => $graffitiAveragePrice,
        ],
        'listings' => [
            'steam' => null,
            'skinport' => null,
        ],
        'sim_only' => true,
    ],
    [
        'id' => 9002,
        'name' => 'Charm Detachment Pack',
        'kind' => 'tool',
        'image' => 'https://csroi.com/assets/keychain_remove_tool_pack_png.png',
        'prices' => [
            'steam' => 0.0,
            'skinport' => 0.0,
        ],
        'listings' => [
            'steam' => null,
            'skinport' => null,
        ],
        'sim_only' => false,
    ],
];

foreach ($activeEntries as $entry) {
    $id = carePackageIntOrNull($entry['CollectionId'] ?? null);
    if ($id === null) {
        continue;
    }

    foreach (array_keys($sources) as $source) {
        $detail = $details[$source . ':' . $id] ?? null;
        if (!is_array($detail)) {
            $detail = [];
        }

        $sources[$source]['rewards'][] = carePackageBuildReward($entry, $detail, $source);
    }
}

foreach (array_keys($sources) as $source) {
    foreach ($syntheticRewards as $reward) {
        $synthetic = carePackageBuildSyntheticReward(
            $reward['id'],
            $reward['name'],
            $reward['kind'],
            $source,
            $reward['prices'][$source] ?? null,
            $reward['image'],
            $reward['listings'][$source] ?? null
        );
        $synthetic['sim_only'] = (bool)($reward['sim_only'] ?? false);
        $sources[$source]['rewards'][] = $synthetic;
    }

    $sources[$source]['catalog']['graffiti'] = [];
    foreach ($graffitiCatalog as $index => $item) {
        $sources[$source]['catalog']['graffiti'][] = carePackageBuildCatalogReward($item, 'graffiti', $source, $index);
    }
}

$kindOrder = ['collection' => 0, 'case' => 1, 'terminal' => 2, 'graffiti' => 3, 'tool' => 4, 'reward' => 5];
foreach ($sources as $source => $sourcePayload) {
    $rewards = $sourcePayload['rewards'];
    usort($rewards, static function (array $left, array $right) use ($kindOrder): int {
        $leftKind = $kindOrder[(string)($left['kind'] ?? 'reward')] ?? 99;
        $rightKind = $kindOrder[(string)($right['kind'] ?? 'reward')] ?? 99;
        if ($leftKind !== $rightKind) {
            return $leftKind <=> $rightKind;
        }

        $leftValue = carePackageFloatOrNull($left['live_value'] ?? null) ?? -INF;
        $rightValue = carePackageFloatOrNull($right['live_value'] ?? null) ?? -INF;
        if ($leftValue !== $rightValue) {
            return $rightValue <=> $leftValue;
        }

        return strcmp((string)($left['name'] ?? ''), (string)($right['name'] ?? ''));
    });

    $sources[$source]['rewards'] = $rewards;
    $sources[$source]['summary'] = carePackageBuildSourceSummary($rewards);
}

$payload = [
    'success' => true,
    'generated_at' => gmdate(DATE_ATOM),
    'pool' => [
        'reward_count' => count($activeEntries) + count($syntheticRewards),
        'collection_count' => count(array_filter($activeEntries, static fn (array $entry): bool => strtolower((string)($entry['CollectionType'] ?? '')) === 'collection')),
        'case_count' => count(array_filter($activeEntries, static fn (array $entry): bool => strtolower((string)($entry['CollectionType'] ?? '')) === 'case')),
        'terminal_count' => count(array_filter($activeEntries, static fn (array $entry): bool => strtolower((string)($entry['CollectionType'] ?? '')) === 'terminal')),
        'graffiti_count' => 1,
        'tool_count' => 1,
    ],
    'sources' => $sources,
];

carePackageSaveCache($cacheKey, $payload);
carePackageRespond($payload);
