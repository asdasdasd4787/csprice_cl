<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';

set_time_limit(120);

header('Content-Type: application/json; charset=utf-8');

function armoryRespond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function armoryCachePath(string $name): string
{
    $normalized = preg_replace('/[^a-z0-9_.-]+/i', '_', strtolower($name)) ?: 'armory.json';
    return rtrim(sys_get_temp_dir(), '\\/') . DIRECTORY_SEPARATOR . 'csgo_price_tracker_' . $normalized;
}

function armoryLoadCache(string $name, int $ttlSeconds): ?array
{
    $path = armoryCachePath($name);
    if (!is_file($path)) {
        return null;
    }

    $modifiedAt = @filemtime($path);
    if ($modifiedAt === false || $modifiedAt < time() - $ttlSeconds) {
        return null;
    }

    $decoded = armoryDecodeJson((string)@file_get_contents($path));
    return is_array($decoded) ? $decoded : null;
}

function armorySaveCache(string $name, array $payload): void
{
    @file_put_contents(
        armoryCachePath($name),
        json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );
}

function armoryDecodeJson(string $raw): ?array
{
    $value = preg_replace('/^\xEF\xBB\xBF/', '', $raw) ?? $raw;
    $decoded = json_decode($value, true);
    return is_array($decoded) ? $decoded : null;
}

function armoryFetchJson(string $url, array $headers = [], int $timeoutSeconds = 25): ?array
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

    if (!is_string($body) || $body === '' || $status >= 400) {
        return null;
    }

    return armoryDecodeJson($body);
}

function armoryLoadRemoteOrFallback(string $cacheName, string $url, string $fallbackFile, int $ttlSeconds = 1800): array
{
    $cached = armoryLoadCache($cacheName, $ttlSeconds);
    if (is_array($cached)) {
        return $cached;
    }

    $remote = armoryFetchJson($url);
    if (is_array($remote)) {
        armorySaveCache($cacheName, $remote);
        return $remote;
    }

    if (is_file($fallbackFile)) {
        $fallback = armoryDecodeJson((string)file_get_contents($fallbackFile));
        if (is_array($fallback)) {
            return $fallback;
        }
    }

    throw new RuntimeException('Unable to load required armory data.');
}

function armoryFloatOrNull(mixed $value): ?float
{
    if ($value === null || $value === '' || !is_numeric($value)) {
        return null;
    }

    $floatValue = (float)$value;
    return is_finite($floatValue) ? $floatValue : null;
}

function armoryAbsoluteUrl(?string $url): string
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

function armoryEncodeMarketUrl(string $name): string
{
    return 'https://steamcommunity.com/market/listings/730/' . rawurlencode($name);
}

function armoryCollectionLogo(string $name, string $fallbackImage = ''): string
{
    $map = [
        'The Harlequin Collection' => 'assets/collections/source2/harlequin-source2.svg',
        'The Ascent Collection' => 'assets/collections/source2/ascent-source2.svg',
        'The Achroma Collection' => 'assets/collections/source2/achroma-source2.svg',
        'The Radiant Collection' => 'assets/collections/source2/radiant-source2.svg',
        'The Boreal Collection' => 'assets/collections/source2/boreal-source2.svg',
        'The Genesis Collection' => 'assets/collections/source2/genesis-source2.svg',
        'The Train 2025 Collection' => 'assets/collections/source2/train-2025-source2.svg',
        'The Overpass 2024 Collection' => 'assets/collections/source2/overpass-2024-source2.svg',
    ];

    return $map[$name] ?? $fallbackImage;
}

function armoryAgeTag(?int $releaseTimestampMs): string
{
    if ($releaseTimestampMs === null || $releaseTimestampMs <= 0) {
        return 'NEW';
    }

    $ageSeconds = max(0, time() - (int)floor($releaseTimestampMs / 1000));
    $monthSeconds = 30 * 24 * 60 * 60;
    $yearSeconds = 365 * 24 * 60 * 60;

    if ($ageSeconds < $monthSeconds) {
        $weeks = max(1, (int)round($ageSeconds / (7 * 24 * 60 * 60)));
        return $weeks . 'W';
    }

    if ($ageSeconds < $yearSeconds) {
        $months = max(1, (int)round($ageSeconds / $monthSeconds));
        return $months . 'M';
    }

    $years = round($ageSeconds / $yearSeconds, 1);
    return number_format($years, 1, '.', '') . 'Y';
}

function armoryTimerLabel(?int $deadlineMs): ?string
{
    if ($deadlineMs === null || $deadlineMs <= 0) {
        return null;
    }

    $remainingSeconds = (int)floor($deadlineMs / 1000) - time();
    if ($remainingSeconds <= 0) {
        return null;
    }

    $days = max(1, (int)ceil($remainingSeconds / 86400));
    return $days . ' days remaining';
}

function armoryStarsFromLabel(string $label): int
{
    if (preg_match('/(\d+)/', $label, $matches)) {
        return (int)$matches[1];
    }

    return 0;
}

function armoryProviderMap(): array
{
    return [
        'steam' => [
            'label' => 'Steam Market',
            'roi' => 'SteamROI',
            'profit' => 'ProfitSteam',
            'price' => 'CollectionPriceSteam',
            'invest' => 'SteamiROI',
            'invest_6m' => 'Steam6MiROI',
            'invest_1m' => 'Steam1MiROI',
            'fee_pct' => 15.0,
        ],
        'skinport' => [
            'label' => 'Skinport',
            'roi' => 'SkinportROI',
            'profit' => 'ProfitSkinport',
            'price' => 'CollectionPriceSkinport',
            'invest' => 'SkinportiROI',
            'invest_6m' => 'Skinport6MiROI',
            'invest_1m' => 'Skinport1MiROI',
            'fee_pct' => 0.0,
        ],
        'csfloat' => [
            'label' => 'CSFloat',
            'roi' => 'CSFloatROI',
            'profit' => 'ProfitCSFloat',
            'price' => 'CollectionPriceCSFloat',
            'invest' => 'CSFloatiROI',
            'invest_6m' => 'CSFloat6MiROI',
            'invest_1m' => 'CSFloat1MiROI',
            'fee_pct' => 2.5,
        ],
    ];
}

function armoryBuildProviderMetrics(array $entry, int $stars, float $starCost, int $starsPerHour): array
{
    $providers = armoryProviderMap();
    $metrics = [];

    foreach ($providers as $providerId => $provider) {
        $roiRatio = armoryFloatOrNull($entry[$provider['roi']] ?? null);
        $profitRatio = armoryFloatOrNull($entry[$provider['profit']] ?? null);
        $marketPrice = armoryFloatOrNull($entry[$provider['price']] ?? null);
        $investRoi = armoryFloatOrNull($entry[$provider['invest']] ?? null);
        $investRoi6m = armoryFloatOrNull($entry[$provider['invest_6m']] ?? null);
        $investRoi1m = armoryFloatOrNull($entry[$provider['invest_1m']] ?? null);
        $afterFees = $marketPrice !== null
            ? $marketPrice * (1 - ((float)$provider['fee_pct'] / 100))
            : null;
        $avgReturn = $roiRatio !== null ? ($starCost * $roiRatio) : null;
        $avgProfit = $avgReturn !== null ? ($avgReturn - $starCost) : null;
        $hourlyAverageProfit = ($avgProfit !== null && $stars > 0)
            ? ($avgProfit * ($starsPerHour / $stars))
            : null;
        $hourlyDirectProfit = ($afterFees !== null && $stars > 0)
            ? (($afterFees - $starCost) * ($starsPerHour / $stars))
            : null;

        $metrics[$providerId] = [
            'label' => $provider['label'],
            'roi_pct' => $roiRatio !== null ? ($roiRatio * 100) : null,
            'profit_pct' => $profitRatio !== null ? ($profitRatio * 100) : null,
            'market_price' => $marketPrice,
            'after_fees_price' => $afterFees,
            'average_return' => $avgReturn,
            'average_profit' => $avgProfit,
            'hourly_average_profit' => $hourlyAverageProfit,
            'hourly_direct_profit' => $hourlyDirectProfit,
            'invest_roi_pct' => $investRoi,
            'invest_roi_6m_pct' => $investRoi6m,
            'invest_roi_1m_pct' => $investRoi1m,
        ];
    }

    return $metrics;
}

function armoryBuildTile(array $entry, array $layoutMeta = [], bool $preferLogo = false): array
{
    $starLabel = trim((string)($layoutMeta['starsLabel'] ?? ''));
    $stars = armoryStarsFromLabel($starLabel);
    $starCost = round($stars * 0.35, 2);
    $releaseTimestamp = isset($layoutMeta['releaseTimestamp']) ? (int)$layoutMeta['releaseTimestamp'] : null;
    $timerDeadline = isset($layoutMeta['timerDeadline']) ? (int)$layoutMeta['timerDeadline'] : null;
    $image = armoryAbsoluteUrl((string)($entry['Image'] ?? ''));
    $logoImage = armoryCollectionLogo((string)($entry['Name'] ?? ''), $image);
    $finalImage = $preferLogo ? $logoImage : $image;
    $collectionType = (string)($entry['CollectionType'] ?? '');
    $dropType = (string)($entry['DropType'] ?? '');
    $name = (string)($entry['Name'] ?? '');
    $title = trim((string)($layoutMeta['title'] ?? $name));
    $updatedAt = isset($entry['UpdatedAt']) && is_numeric($entry['UpdatedAt'])
        ? (int)$entry['UpdatedAt']
        : null;

    return [
        'id' => md5($name),
        'name' => $name,
        'title' => $title,
        'url_name' => (string)($entry['UrlName'] ?? ''),
        'href' => str_contains($name, '|')
            ? ('item_page.php?lookup_name=' . rawurlencode($name) . '&display_name=' . rawurlencode($name))
            : '#',
        'steam_url' => armoryEncodeMarketUrl($name),
        'image' => $finalImage,
        'image_source' => $image,
        'logo_image' => $logoImage,
        'image_kind' => $preferLogo ? 'logo' : (($collectionType === 'Collection' || str_contains($collectionType, 'Armory')) ? 'art' : 'item'),
        'collection_type' => $collectionType,
        'drop_type' => $dropType,
        'stars' => $stars,
        'star_label' => $starLabel,
        'star_cost' => $starCost,
        'stars_per_open' => $stars,
        'age_tag' => armoryAgeTag($releaseTimestamp),
        'timer_label' => armoryTimerLabel($timerDeadline),
        'release_timestamp' => $releaseTimestamp,
        'timer_deadline' => $timerDeadline,
        'updated_at' => $updatedAt,
        'updated_iso' => $updatedAt !== null ? gmdate(DATE_ATOM, $updatedAt) : null,
        'num_listings' => isset($entry['NumListings']) && is_numeric($entry['NumListings'])
            ? (int)$entry['NumListings']
            : 0,
        'image_offset' => trim((string)($layoutMeta['customImageOffset'] ?? '')),
        'metrics' => armoryBuildProviderMetrics($entry, $stars, $starCost, 12),
        'rankings' => [],
    ];
}

function armoryApplyRanks(array $tiles): array
{
    $providers = array_keys(armoryProviderMap());
    foreach ($providers as $providerId) {
        $sortable = $tiles;
        usort($sortable, static function (array $left, array $right) use ($providerId): int {
            $leftValue = $left['metrics'][$providerId]['profit_pct'] ?? -INF;
            $rightValue = $right['metrics'][$providerId]['profit_pct'] ?? -INF;
            if ($leftValue === $rightValue) {
                return strcmp((string)$left['name'], (string)$right['name']);
            }
            return $rightValue <=> $leftValue;
        });

        $rankMap = [];
        foreach ($sortable as $index => $tile) {
            $rankMap[$tile['id']] = $index + 1;
        }

        foreach ($tiles as $index => $tile) {
            $tiles[$index]['rankings'][$providerId] = [
                'profit_rank' => $rankMap[$tile['id']] ?? null,
            ];
        }
    }

    return $tiles;
}

function armoryBuildRiskCards(array $tiles): array
{
    $byName = [];
    foreach ($tiles as $tile) {
        $byName[$tile['name']] = $tile;
    }

    $pickBest = static function (array $items, string $providerId = 'steam', string $metric = 'hourly_average_profit'): ?array {
        $best = null;
        foreach ($items as $item) {
            $value = $item['metrics'][$providerId][$metric] ?? null;
            if ($value === null) {
                continue;
            }
            if ($best === null || $value > ($best['metrics'][$providerId][$metric] ?? -INF)) {
                $best = $item;
            }
        }
        return $best;
    };

    $allTiles = array_values($tiles);
    $oneStar = array_values(array_filter($allTiles, static fn(array $tile): bool => ($tile['stars'] ?? 0) === 1));
    $threeToFourStar = array_values(array_filter($allTiles, static fn(array $tile): bool => in_array((int)($tile['stars'] ?? 0), [3, 4], true)));
    $highStar = array_values(array_filter($allTiles, static fn(array $tile): bool => ((int)($tile['stars'] ?? 0)) > 4));

    return [
        [
            'id' => 'no-risk',
            'label' => 'No Risk',
            'description' => 'Direct market flip based on the guaranteed reward itself.',
            'metric_key' => 'hourly_direct_profit',
            'item' => $byName['Fever Case'] ?? $pickBest($allTiles, 'steam', 'hourly_direct_profit'),
        ],
        [
            'id' => 'low-risk',
            'label' => 'Low Risk',
            'description' => 'Lower star cost openings with the best current expected return.',
            'metric_key' => 'hourly_average_profit',
            'item' => $pickBest($oneStar),
        ],
        [
            'id' => 'medium-risk',
            'label' => 'Medium Risk',
            'description' => 'Balanced 3★ to 4★ armory routes ranked by expected hourly edge.',
            'metric_key' => 'hourly_average_profit',
            'item' => $pickBest($threeToFourStar),
        ],
        [
            'id' => 'high-risk',
            'label' => 'High Risk',
            'description' => 'Premium armory picks with the strongest upside per hour.',
            'metric_key' => 'hourly_average_profit',
            'item' => $pickBest($highStar),
        ],
    ];
}

function armoryBuildCaseFarmTiles(array $entries): array
{
    $tiles = [];
    foreach ($entries as $entry) {
        $name = (string)($entry['Name'] ?? '');
        $collectionType = (string)($entry['CollectionType'] ?? '');
        $preferLogo = $collectionType === 'Collection';
        $tile = armoryBuildTile($entry, [], $preferLogo);

        foreach ($tile['metrics'] as $providerId => $metric) {
            $marketPrice = $metric['market_price'];
            $roiPct = $metric['roi_pct'];
            $expectedValue = ($marketPrice !== null && $roiPct !== null)
                ? round($marketPrice * ($roiPct / 100), 4)
                : null;
            $tile['metrics'][$providerId]['expected_value'] = $expectedValue;
        }

        $tile['title'] = $name;
        $tile['href'] = '#';
        $tiles[] = $tile;
    }

    return $tiles;
}

function armoryBuildCaseFarmRanks(array $tiles): array
{
    $providers = array_keys(armoryProviderMap());
    foreach ($providers as $providerId) {
        $sortable = $tiles;
        usort($sortable, static function (array $left, array $right) use ($providerId): int {
            $leftValue = $left['metrics'][$providerId]['expected_value'] ?? -INF;
            $rightValue = $right['metrics'][$providerId]['expected_value'] ?? -INF;
            if ($leftValue === $rightValue) {
                return strcmp((string)$left['name'], (string)$right['name']);
            }
            return $rightValue <=> $leftValue;
        });

        $rankMap = [];
        foreach ($sortable as $index => $tile) {
            $rankMap[$tile['id']] = $index + 1;
        }

        foreach ($tiles as $index => $tile) {
            $tiles[$index]['rankings'][$providerId] = [
                'expected_rank' => $rankMap[$tile['id']] ?? null,
            ];
        }
    }

    return $tiles;
}

try {
    $layoutRows = armoryLoadRemoteOrFallback(
        'armory_layout.json',
        'https://csroi.com/pastData/armoryLayout.json',
        __DIR__ . '/tmp_armory_layout.json'
    );

    $trackedEntries = armoryLoadRemoteOrFallback(
        'all_tracked_cases.json',
        'https://csroi.com/pastData/allTrackedCases.json',
        __DIR__ . '/tmp_allTrackedCases.json'
    );

    $trackedByName = [];
    foreach ($trackedEntries as $entry) {
        $name = trim((string)($entry['Name'] ?? ''));
        if ($name !== '') {
            $trackedByName[$name] = $entry;
        }
    }

    $armoryTiles = [];
    foreach ($layoutRows as $layoutRow) {
        $rowItems = is_array($layoutRow['items'] ?? null) ? $layoutRow['items'] : [];
        foreach ($rowItems as $layoutItem) {
            $name = trim((string)($layoutItem['name'] ?? ''));
            if ($name === '' || !isset($trackedByName[$name])) {
                continue;
            }

            $armoryTiles[] = armoryBuildTile($trackedByName[$name], $layoutItem, false);
        }
    }

    $armoryTiles = armoryApplyRanks($armoryTiles);

    $manualArmoryLayout = [
        ['name' => 'AK-47 | Aphrodite (Limited Edition)', 'span' => 'xl'],
        ['name' => 'Dr. Boom Charms', 'span' => 'md'],
        ['name' => 'Missing Link Community Charms', 'span' => 'md'],
        ['name' => 'Missing Link Charms', 'span' => 'lg'],
        ['name' => 'Small Arms Charms', 'span' => 'lg'],
        ['name' => 'The Train 2025 Collection', 'span' => 'md'],
        ['name' => 'The Overpass 2024 Collection', 'span' => 'md'],
        ['name' => 'The Sport & Field Collection', 'span' => 'md'],
        ['name' => 'Fever Case', 'span' => 'sm'],
        ['name' => '2025 Community Sticker Collection', 'span' => 'sm'],
        ['name' => 'Sugarface 2 Sticker Collection', 'span' => 'sm'],
        ['name' => 'Elemental Craft Stickers Collection', 'span' => 'sm'],
    ];

    $armoryMap = [];
    foreach ($armoryTiles as $tile) {
        $armoryMap[$tile['name']] = $tile;
    }

    $orderedArmoryTiles = [];
    foreach ($manualArmoryLayout as $slot) {
        if (!isset($armoryMap[$slot['name']])) {
            continue;
        }
        $tile = $armoryMap[$slot['name']];
        $tile['layout_span'] = $slot['span'];
        $orderedArmoryTiles[] = $tile;
    }

    $activeDropEntries = array_values(array_filter(
        $trackedEntries,
        static fn(array $entry): bool => in_array((string)($entry['DropType'] ?? ''), ['Active Drop', 'Rare Drop'], true)
    ));

    $caseFarmTiles = armoryBuildCaseFarmTiles($activeDropEntries);
    $caseFarmTiles = armoryBuildCaseFarmRanks($caseFarmTiles);

    $manualCaseFarmOrder = [
        'The Harlequin Collection',
        'The Ascent Collection',
        'The Achroma Collection',
        'The Radiant Collection',
        'The Boreal Collection',
        'Dreams & Nightmares Case',
        'Revolution Case',
        'Kilowatt Case',
        'Sealed Dead Hand Terminal',
        'Sealed Genesis Terminal',
    ];

    $caseFarmMap = [];
    foreach ($caseFarmTiles as $tile) {
        $caseFarmMap[$tile['name']] = $tile;
    }

    $orderedCaseFarmTiles = [];
    foreach ($manualCaseFarmOrder as $name) {
        if (!isset($caseFarmMap[$name])) {
            continue;
        }

        $tile = $caseFarmMap[$name];
        $tile['layout_span'] = in_array($tile['collection_type'], ['Collection', 'Terminal'], true) ? 'md' : 'md';
        $orderedCaseFarmTiles[] = $tile;
    }

    $maxUpdatedAt = 0;
    foreach ($trackedEntries as $entry) {
        $updatedAt = isset($entry['UpdatedAt']) && is_numeric($entry['UpdatedAt'])
            ? (int)$entry['UpdatedAt']
            : 0;
        $maxUpdatedAt = max($maxUpdatedAt, $updatedAt);
    }

    armoryRespond([
        'fetched_at' => gmdate(DATE_ATOM),
        'source_updated_at' => $maxUpdatedAt > 0 ? gmdate(DATE_ATOM, $maxUpdatedAt) : null,
        'star_cost_eur' => 0.35,
        'default_stars_per_hour' => 12,
        'stars_per_hour_options' => [
            ['value' => 8, 'label' => '8★ Casual'],
            ['value' => 9, 'label' => '9★ Deathmatch'],
            ['value' => 10, 'label' => '10★ Competitive'],
            ['value' => 11, 'label' => '11★ Arms Race'],
            ['value' => 12, 'label' => '12★ Wingman'],
        ],
        'providers' => array_map(
            static fn(string $providerId, array $provider): array => [
                'id' => $providerId,
                'label' => $provider['label'],
            ],
            array_keys(armoryProviderMap()),
            array_values(armoryProviderMap())
        ),
        'armory' => [
            'risk_cards' => armoryBuildRiskCards($orderedArmoryTiles),
            'tiles' => $orderedArmoryTiles,
            'stats' => [
                'count' => count($orderedArmoryTiles),
                'premium_count' => count(array_filter($orderedArmoryTiles, static fn(array $tile): bool => ((int)$tile['stars']) >= 4)),
                'sticker_count' => count(array_filter($orderedArmoryTiles, static fn(array $tile): bool => str_contains((string)$tile['collection_type'], 'Armory') && str_contains(strtolower((string)$tile['name']), 'sticker'))),
                'charm_count' => count(array_filter($orderedArmoryTiles, static fn(array $tile): bool => str_contains(strtolower((string)$tile['name']), 'charms'))),
            ],
        ],
        'case_farming' => [
            'tiles' => $orderedCaseFarmTiles,
            'leaderboard' => array_slice(
                array_values(array_filter($caseFarmTiles, static fn(array $tile): bool => ($tile['metrics']['steam']['expected_value'] ?? 0) > 0)),
                0,
                10
            ),
            'stats' => [
                'count' => count($orderedCaseFarmTiles),
                'collections_count' => count(array_filter($orderedCaseFarmTiles, static fn(array $tile): bool => $tile['collection_type'] === 'Collection')),
                'cases_count' => count(array_filter($orderedCaseFarmTiles, static fn(array $tile): bool => $tile['collection_type'] === 'Case')),
                'terminals_count' => count(array_filter($orderedCaseFarmTiles, static fn(array $tile): bool => $tile['collection_type'] === 'Terminal')),
            ],
        ],
    ]);
} catch (Throwable $exception) {
    armoryRespond([
        'success' => false,
        'message' => 'Unable to build armory data.',
        'error' => $exception->getMessage(),
    ], 500);
}
