<?php

declare(strict_types=1);

function marketSnapshotUsdToEur(): float
{
    $config = appConfig();
    $rate = $config['dmarket']['usd_to_eur']
        ?? $config['shadowpay']['usd_to_eur']
        ?? $config['waxpeer']['usd_to_eur']
        ?? $config['mannco']['usd_to_eur']
        ?? 0.92;

    return max(0.01, (float)$rate);
}

function marketSnapshotLoadCatalog(): ?array
{
    $catalogPath = __DIR__ . '/assets/steam-market-cache/catalog.json';
    if (!is_file($catalogPath)) {
        return null;
    }

    $catalog = json_decode((string)file_get_contents($catalogPath), true);
    return is_array($catalog) ? $catalog : null;
}

function marketSnapshotLoadHomeRoi(): array
{
    $cacheFile = __DIR__ . '/assets/steam-market-cache/roi_home_cache.json';
    if (!is_file($cacheFile)) {
        return ['trending' => [], 'declining' => [], 'updated_at' => null];
    }

    $payload = json_decode((string)file_get_contents($cacheFile), true);
    if (!is_array($payload)) {
        return ['trending' => [], 'declining' => [], 'updated_at' => null];
    }

    return [
        'trending' => array_values(array_filter(is_array($payload['trending'] ?? null) ? $payload['trending'] : [], 'is_array')),
        'declining' => array_values(array_filter(is_array($payload['declining'] ?? null) ? $payload['declining'] : [], 'is_array')),
        'updated_at' => isset($payload['updated_at']) ? (string)$payload['updated_at'] : null,
    ];
}

function marketSnapshotAverageTrend(array $trending, array $declining): ?float
{
    $values = [];
    foreach (array_merge($trending, $declining) as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        if (!is_numeric($entry['roi_pct'] ?? null)) {
            continue;
        }
        $values[] = (float)$entry['roi_pct'];
    }

    if (!$values) {
        return null;
    }

    return round(array_sum($values) / count($values), 2);
}

function marketSnapshotMedian(array $values): ?float
{
    if (!$values) {
        return null;
    }

    sort($values, SORT_NUMERIC);
    $count = count($values);
    $mid = intdiv($count, 2);
    if ($count % 2 === 1) {
        return round((float)$values[$mid], 2);
    }

    return round(((float)$values[$mid - 1] + (float)$values[$mid]) / 2, 2);
}

function marketSnapshotSteamMetricsCachePath(): string
{
    return __DIR__ . '/assets/steam-market-cache/market_snapshot_steam_metrics_v3.json';
}

function marketSnapshotParseTimestamp(mixed $value): ?int
{
    if ($value === null || $value === false || $value === '') {
        return null;
    }

    if (is_numeric($value)) {
        $n = (float)$value;
        if ($n <= 0) {
            return null;
        }
        // Steam listing JSON sometimes emits milliseconds.
        if ($n >= 1.0e12) {
            $n /= 1000.0;
        }
        $ts = (int)round($n);
        return $ts > 0 ? $ts : null;
    }

    $raw = trim((string)$value);
    if ($raw === '') {
        return null;
    }

    if (preg_match('/^(\d{4}-\d{2}-\d{2})/', $raw, $matches)) {
        $dt = DateTimeImmutable::createFromFormat('!Y-m-d', $matches[1], new DateTimeZone('UTC'));
        return $dt instanceof DateTimeImmutable ? $dt->getTimestamp() : null;
    }

    $time = strtotime($raw . (str_contains($raw, 'UTC') || str_contains($raw, '+') ? '' : ' UTC'));
    if ($time === false || $time <= 0) {
        return null;
    }

    return $time;
}

function marketSnapshotParsePriceHistory(mixed $raw): array
{
    if ($raw === null || $raw === '') {
        return [];
    }

    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            return [];
        }
        $raw = $decoded;
    }

    if (!is_array($raw)) {
        return [];
    }

    $points = [];
    foreach ($raw as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $price = null;
        foreach (['price', 'median_price', 'value'] as $key) {
            if (isset($entry[$key]) && is_numeric($entry[$key])) {
                $price = (float)$entry[$key];
                break;
            }
        }
        if ($price === null && isset($entry[1]) && is_numeric($entry[1])) {
            $price = (float)$entry[1];
        }
        if ($price === null || $price <= 0) {
            continue;
        }

        $time = marketSnapshotParseTimestamp($entry['time'] ?? $entry['date'] ?? $entry[0] ?? null);
        if ($time === null) {
            continue;
        }

        $volume = 0;
        foreach (['volume', 'quantity'] as $key) {
            if (isset($entry[$key]) && is_numeric($entry[$key])) {
                $volume = (int)$entry[$key];
                break;
            }
        }
        if ($volume <= 0 && isset($entry[2]) && is_numeric($entry[2])) {
            $volume = (int)$entry[2];
        }

        $points[] = [
            'time' => $time,
            'price' => $price,
            'volume' => max(0, $volume),
        ];
    }

    usort($points, static fn(array $a, array $b): int => $a['time'] <=> $b['time']);
    return $points;
}

/**
 * @return array{price:float,time:int,current:float,current_time:int,span_days:float}|null
 */
function marketSnapshotHistoryBaseline(
    array $history,
    int $days = 30,
    float $minSpanDays = 20.0,
    ?float $maxSpanDays = null,
    bool $requireTargetHit = false
): ?array {
    if (count($history) < 2) {
        return null;
    }

    $latest = $history[count($history) - 1];
    $current = (float)$latest['price'];
    if ($current <= 0) {
        return null;
    }

    $targetTime = (int)$latest['time'] - ($days * 86400);
    $baseline = $history[0];
    $foundAtOrBeforeTarget = false;
    foreach ($history as $point) {
        if ((int)$point['time'] <= $targetTime) {
            $baseline = $point;
            $foundAtOrBeforeTarget = true;
        } else {
            break;
        }
    }
    // 24H/7D/1Y must have a point at or before the window. 30D still allows
    // the earliest point when history is slightly shorter than 30 days.
    if (!$foundAtOrBeforeTarget && ($requireTargetHit || $days <= 7)) {
        return null;
    }

    $basePrice = (float)$baseline['price'];
    if ($basePrice <= 0) {
        return null;
    }

    $spanDays = ((int)$latest['time'] - (int)$baseline['time']) / 86400.0;
    if ($spanDays < $minSpanDays) {
        return null;
    }
    if ($maxSpanDays !== null && $spanDays > $maxSpanDays) {
        return null;
    }

    return [
        'price' => $basePrice,
        'time' => (int)$baseline['time'],
        'current' => $current,
        'current_time' => (int)$latest['time'],
        'span_days' => $spanDays,
    ];
}

function marketSnapshotHistoryTrendPct(
    array $history,
    int $days = 30,
    float $minSpanDays = 20.0,
    ?float $maxSpanDays = null,
    bool $requireTargetHit = false
): ?float {
    $baseline = marketSnapshotHistoryBaseline($history, $days, $minSpanDays, $maxSpanDays, $requireTargetHit);
    if ($baseline === null) {
        return null;
    }

    return round((($baseline['current'] - $baseline['price']) / $baseline['price']) * 100, 2);
}

/**
 * @return array{days:int,min_span:float,max_span:?float,require_target:bool}
 */
function marketSnapshotTrendWindowSpec(string $key): array
{
    return match ($key) {
        '24h' => ['days' => 1, 'min_span' => 0.5, 'max_span' => 1.75, 'require_target' => true],
        '7d' => ['days' => 7, 'min_span' => 5.0, 'max_span' => 10.0, 'require_target' => true],
        '30d' => ['days' => 30, 'min_span' => 20.0, 'max_span' => null, 'require_target' => false],
        '1y' => ['days' => 365, 'min_span' => 330.0, 'max_span' => null, 'require_target' => true],
        default => ['days' => 30, 'min_span' => 20.0, 'max_span' => null, 'require_target' => false],
    };
}

function marketSnapshotWeightedIndexPct(float $currentWeighted, float $baselineWeighted, int $samples, int $minSamples = 10): ?float
{
    if ($samples < $minSamples || $baselineWeighted <= 0) {
        return null;
    }

    return round((($currentWeighted - $baselineWeighted) / $baselineWeighted) * 100, 2);
}

function marketSnapshotLatestHistoryVolume(array $history): int
{
    if (!$history) {
        return 0;
    }

    $latest = $history[count($history) - 1];
    return isset($latest['volume']) ? max(0, (int)$latest['volume']) : 0;
}

/**
 * Aggregate 24H turnover + volume-weighted index trends from Steam roi-price-cache files.
 *
 * Each trend is (sum(current_price × volume) / sum(price_N_ago × volume)) − 1
 * using the same 24H volume weights. Missing history is omitted, not zero-filled.
 *
 * @return array{
 *   volume_24h:?float,
 *   volume_24h_estimated:bool,
 *   volume_sample_count:int,
 *   trend_pct:?float,
 *   trend_pct_24h:?float,
 *   trend_pct_7d:?float,
 *   trend_pct_30d:?float,
 *   trend_pct_1y:?float,
 *   trend_estimated:bool,
 *   trend_sample_count:int,
 *   trend_sample_count_24h:int,
 *   trend_sample_count_7d:int,
 *   trend_sample_count_30d:int,
 *   trend_sample_count_1y:int,
 *   updated_at:string
 * }
 */
function marketSnapshotBuildSteamMetrics(bool $allowCached = true): array
{
    $cachePath = marketSnapshotSteamMetricsCachePath();
    $cacheTtl = 3600;

    if ($allowCached && is_file($cachePath) && (@filemtime($cachePath) ?: 0) >= time() - $cacheTtl) {
        $cached = json_decode((string)@file_get_contents($cachePath), true);
        if (
            is_array($cached)
            && array_key_exists('trend_pct_24h', $cached)
            && array_key_exists('trend_pct_1y', $cached)
            && array_key_exists('trend_pct', $cached)
        ) {
            return $cached;
        }
    }

    $dir = __DIR__ . '/assets/roi-price-cache';
    $files = is_dir($dir) ? (glob($dir . DIRECTORY_SEPARATOR . 'steam_*.json') ?: []) : [];

    $windowKeys = ['24h', '7d', '30d', '1y'];
    $windows = [];
    foreach ($windowKeys as $key) {
        $windows[$key] = marketSnapshotTrendWindowSpec($key);
    }

    $volumeUsd = 0.0;
    $volumeSamples = 0;
    $acc = [];
    foreach ($windowKeys as $key) {
        $acc[$key] = ['current' => 0.0, 'baseline' => 0.0, 'samples' => 0];
    }

    foreach ($files as $file) {
        $base = basename((string)$file);
        if (!preg_match('/^steam_[a-f0-9]{32}\.json$/', $base)) {
            continue;
        }

        $data = json_decode((string)@file_get_contents($file), true);
        if (!is_array($data)) {
            continue;
        }

        $price = isset($data['current_price']) && is_numeric($data['current_price'])
            ? (float)$data['current_price']
            : 0.0;
        if ($price <= 0) {
            continue;
        }

        $history = marketSnapshotParsePriceHistory($data['price_history'] ?? null);
        $volume = 0;
        if (isset($data['volume_24h']) && is_numeric($data['volume_24h']) && (int)$data['volume_24h'] > 0) {
            $volume = (int)$data['volume_24h'];
        } elseif ($history) {
            $volume = marketSnapshotLatestHistoryVolume($history);
        }

        if ($volume > 0) {
            $volumeUsd += $price * $volume;
            $volumeSamples++;
        }

        if (!$history || $volume <= 0) {
            continue;
        }

        foreach ($windowKeys as $key) {
            $spec = $windows[$key];
            $baseline = marketSnapshotHistoryBaseline(
                $history,
                $spec['days'],
                $spec['min_span'],
                $spec['max_span'],
                (bool)$spec['require_target']
            );
            if ($baseline === null) {
                continue;
            }
            $acc[$key]['current'] += $price * $volume;
            $acc[$key]['baseline'] += $baseline['price'] * $volume;
            $acc[$key]['samples']++;
        }
    }

    $usdToEur = marketSnapshotUsdToEur();
    $trendPct24h = marketSnapshotWeightedIndexPct($acc['24h']['current'], $acc['24h']['baseline'], $acc['24h']['samples']);
    $trendPct7d = marketSnapshotWeightedIndexPct($acc['7d']['current'], $acc['7d']['baseline'], $acc['7d']['samples']);
    $trendPct30d = marketSnapshotWeightedIndexPct($acc['30d']['current'], $acc['30d']['baseline'], $acc['30d']['samples']);
    $trendPct1y = marketSnapshotWeightedIndexPct($acc['1y']['current'], $acc['1y']['baseline'], $acc['1y']['samples']);

    $metrics = [
        'volume_24h' => $volumeSamples > 0 ? round($volumeUsd * $usdToEur, 2) : null,
        'volume_24h_estimated' => true,
        'volume_sample_count' => $volumeSamples,
        'trend_pct' => $trendPct30d,
        'trend_pct_24h' => $trendPct24h,
        'trend_pct_7d' => $trendPct7d,
        'trend_pct_30d' => $trendPct30d,
        'trend_pct_1y' => $trendPct1y,
        'trend_estimated' => true,
        'trend_sample_count' => $acc['30d']['samples'],
        'trend_sample_count_24h' => $acc['24h']['samples'],
        'trend_sample_count_7d' => $acc['7d']['samples'],
        'trend_sample_count_30d' => $acc['30d']['samples'],
        'trend_sample_count_1y' => $acc['1y']['samples'],
        'updated_at' => gmdate(DATE_ATOM),
    ];

    @file_put_contents(
        $cachePath,
        json_encode($metrics, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
    );

    return $metrics;
}

/**
 * Lightweight CS2 market stats for the AI chat snapshot strip.
 *
 * @return array{success:bool,snapshot?:array,error?:string,cached?:bool}
 */
function marketSnapshotBuild(bool $allowCached = true): array
{
    $cachePath = rtrim(sys_get_temp_dir(), '\\/') . DIRECTORY_SEPARATOR . 'cs2_market_snapshot_v4.json';
    $cacheTtl = 900;

    if ($allowCached && is_file($cachePath) && (@filemtime($cachePath) ?: 0) >= time() - $cacheTtl) {
        $cached = json_decode((string)@file_get_contents($cachePath), true);
        if (
            is_array($cached)
            && isset($cached['snapshot'])
            && is_array($cached['snapshot'])
            && array_key_exists('trend_pct_24h', $cached['snapshot'])
            && array_key_exists('trend_pct_1y', $cached['snapshot'])
        ) {
            return [
                'success' => true,
                'snapshot' => $cached['snapshot'],
                'cached' => true,
            ];
        }
    }

    $catalog = marketSnapshotLoadCatalog();
    if ($catalog === null) {
        return [
            'success' => false,
            'error' => 'Steam market catalog cache is unavailable.',
        ];
    }

    $usdToEur = marketSnapshotUsdToEur();
    $marketCapUsd = 0.0;
    $pricedRows = 0;
    $activeListings = 0;

    foreach ($catalog['items'] as $item) {
        if (!is_array($item)) {
            continue;
        }

        $price = isset($item['sell_price']) && is_numeric($item['sell_price'])
            ? (float)$item['sell_price']
            : 0.0;
        $listings = isset($item['sell_listings']) && is_numeric($item['sell_listings'])
            ? (int)$item['sell_listings']
            : 0;

        if ($price <= 0 || $listings <= 0) {
            continue;
        }

        $pricedRows++;
        $activeListings += $listings;
        $marketCapUsd += $price * $listings;
    }

    $homeRoi = marketSnapshotLoadHomeRoi();
    $steamMetrics = marketSnapshotBuildSteamMetrics($allowCached);

    $trendPct24h = $steamMetrics['trend_pct_24h'] ?? null;
    $trendPct7d = $steamMetrics['trend_pct_7d'] ?? null;
    $trendPct30d = $steamMetrics['trend_pct_30d'] ?? $steamMetrics['trend_pct'] ?? null;
    $trendPct1y = $steamMetrics['trend_pct_1y'] ?? null;
    $trendEstimated = (bool)($steamMetrics['trend_estimated'] ?? true);
    $trendSampleCount24h = (int)($steamMetrics['trend_sample_count_24h'] ?? 0);
    $trendSampleCount7d = (int)($steamMetrics['trend_sample_count_7d'] ?? 0);
    $trendSampleCount30d = (int)($steamMetrics['trend_sample_count_30d'] ?? $steamMetrics['trend_sample_count'] ?? 0);
    $trendSampleCount1y = (int)($steamMetrics['trend_sample_count_1y'] ?? 0);
    $trendUpdatedAt = $steamMetrics['updated_at'] ?? null;

    if ($trendPct30d === null) {
        $trendPct30d = marketSnapshotAverageTrend($homeRoi['trending'], $homeRoi['declining']);
        if ($trendPct30d !== null) {
            $trendEstimated = true;
            $trendSampleCount30d = count($homeRoi['trending']) + count($homeRoi['declining']);
            $trendUpdatedAt = $homeRoi['updated_at'];
        }
    }

    $snapshot = [
        'market_cap' => round($marketCapUsd * $usdToEur, 2),
        'market_cap_label' => 'Steam listing value',
        'volume_24h' => $steamMetrics['volume_24h'] ?? null,
        'volume_24h_label' => '24H Steam turnover',
        'volume_24h_estimated' => (bool)($steamMetrics['volume_24h_estimated'] ?? true),
        'volume_sample_count' => (int)($steamMetrics['volume_sample_count'] ?? 0),
        'trend_pct' => $trendPct30d,
        'trend_pct_24h' => $trendPct24h,
        'trend_pct_7d' => $trendPct7d,
        'trend_pct_30d' => $trendPct30d,
        'trend_pct_1y' => $trendPct1y,
        'trend_label' => '30D trend',
        'trend_period' => '30D',
        'trend_estimated' => $trendEstimated,
        'trend_sample_count' => $trendSampleCount30d,
        'trend_sample_count_24h' => $trendSampleCount24h,
        'trend_sample_count_7d' => $trendSampleCount7d,
        'trend_sample_count_30d' => $trendSampleCount30d,
        'trend_sample_count_1y' => $trendSampleCount1y,
        'items_tracked' => isset($catalog['total_count']) && is_numeric($catalog['total_count'])
            ? (int)$catalog['total_count']
            : count($catalog['items']),
        'priced_rows' => $pricedRows,
        'active_listings' => $activeListings,
        'currency' => 'EUR',
        'updated_at' => (string)($catalog['updated_at'] ?? gmdate(DATE_ATOM)),
        'trend_updated_at' => $trendUpdatedAt,
        'steam_metrics_updated_at' => $steamMetrics['updated_at'] ?? null,
    ];

    @file_put_contents($cachePath, json_encode(['snapshot' => $snapshot], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

    return [
        'success' => true,
        'snapshot' => $snapshot,
        'cached' => false,
    ];
}
