<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';

function roiCacheFilePath(string $name): string
{
    $normalized = preg_replace('/[^a-z0-9_.-]+/i', '_', strtolower($name)) ?: 'roi_cache.json';
    return rtrim(sys_get_temp_dir(), '\\/') . DIRECTORY_SEPARATOR . 'csgo_price_tracker_' . $normalized;
}

function loadRoiCache(string $name, int $ttlSeconds): ?array
{
    $path = roiCacheFilePath($name);
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

function saveRoiCache(string $name, array $payload): void
{
    @file_put_contents(roiCacheFilePath($name), json_encode($payload));
}

function parseRoiPayload(): array
{
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $rawBody = (string)file_get_contents('php://input');
        if ($rawBody !== '') {
            $decoded = json_decode($rawBody, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }
    }

    return $_GET;
}

function requestedCaseNames(array $payload): array
{
    $names = $payload['market_hash_names'] ?? [];
    if (is_string($names)) {
        $names = array_map('trim', explode(',', $names));
    }

    if (!is_array($names)) {
        return [];
    }

    $result = [];
    foreach ($names as $name) {
        $trimmed = trim((string)$name);
        if ($trimmed === '') {
            continue;
        }

        $result[] = $trimmed;
    }

    return array_values(array_unique($result));
}

function normalizeRoiSource(string $value): string
{
    return match (strtolower(trim($value))) {
        'skinport' => 'skinport',
        default => 'steam',
    };
}

function normalizeRoiRange(string $value): string
{
    return match (strtolower(trim($value))) {
        '7d', '7', '1w' => '7d',
        '90d', '90', '3m' => '90d',
        '1y', '365d', '12m', 'year' => '1y',
        default => '30d',
    };
}

function roiRangeDays(string $range): int
{
    return match ($range) {
        '7d' => 7,
        '90d' => 90,
        '1y' => 365,
        default => 30,
    };
}

function roiRangeLabel(string $range): string
{
    return match ($range) {
        '7d' => '7D',
        '90d' => '90D',
        '1y' => '1Y',
        default => '30D',
    };
}

function formatEuro(?float $value): string
{
    if ($value === null || !is_finite($value)) {
        return '—';
    }

    return '€' . number_format($value, 2, '.', '');
}

function formatSignedPercent(?float $value): string
{
    if ($value === null || !is_finite($value)) {
        return '—';
    }

    return sprintf('%s%.2f%%', $value > 0 ? '+' : '', $value);
}

function formatSignedEuro(?float $value): string
{
    if ($value === null || !is_finite($value)) {
        return '—';
    }

    return sprintf('%s€%s', $value > 0 ? '+' : '', number_format($value, 2, '.', ''));
}

function formatCompactInteger(?int $value): string
{
    if ($value === null) {
        return '—';
    }

    return number_format($value);
}

function slugKey(string $value): string
{
    $normalized = preg_replace('/[^a-z0-9]+/i', '-', strtolower(trim($value))) ?: 'item';
    return trim($normalized, '-');
}

function steamMarketListingUrlLocal(string $marketHashName, int $appId = 730): string
{
    return sprintf(
        'https://steamcommunity.com/market/listings/%d/%s',
        $appId,
        rawurlencode($marketHashName)
    );
}

function multiFetchTextRequests(array $urls, array $headers, int $timeoutSeconds = 25): array
{
    $multi = curl_multi_init();
    $handles = [];

    foreach ($urls as $key => $url) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_CONNECTTIMEOUT => min(10, $timeoutSeconds),
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_USERAGENT => 'Mozilla/5.0',
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

    $responses = [];
    foreach ($handles as $entry) {
        $curl = $entry['handle'];
        $responses[$entry['key']] = [
            'status' => (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE),
            'body' => curl_multi_getcontent($curl),
            'error' => curl_error($curl),
        ];

        curl_multi_remove_handle($multi, $curl);
        curl_close($curl);
    }

    curl_multi_close($multi);

    return $responses;
}

function steamPriceOverviewUrl(string $marketHashName): string
{
    return sprintf(
        'https://steamcommunity.com/market/priceoverview/?appid=730&currency=3&market_hash_name=%s',
        rawurlencode($marketHashName)
    );
}

function parseSteamPriceOverview(string $marketHashName, string $json): ?array
{
    $data = json_decode($json, true);
    if (!is_array($data) || empty($data['success'])) {
        return null;
    }

    $parsePrice = static function (?string $s): ?float {
        if ($s === null || $s === '') {
            return null;
        }
        $clean = preg_replace('/[^\d.,]/', '', $s);
        // European format: "1.234,56" — trailing comma group is decimal
        if (preg_match('/,\d{1,2}$/', $clean)) {
            $clean = str_replace('.', '', $clean);
            $clean = str_replace(',', '.', $clean);
        } else {
            $clean = str_replace(',', '', $clean);
        }
        return is_numeric($clean) ? round((float)$clean, 2) : null;
    };

    $currentPrice = $parsePrice($data['median_price'] ?? null) ?? $parsePrice($data['lowest_price'] ?? null);
    if ($currentPrice === null) {
        return null;
    }

    $volume = null;
    if (isset($data['volume'])) {
        $volStr = preg_replace('/[^\d]/', '', (string)$data['volume']);
        $volume = $volStr !== '' ? (int)$volStr : null;
    }

    return [
        'market_hash_name' => $marketHashName,
        'market_url' => steamMarketListingUrlLocal($marketHashName),
        'current_price' => $currentPrice,
        'sell_orders' => $volume,
        'buy_orders' => null,
        'history' => [],
        'updated_at' => gmdate(DATE_ATOM),
    ];
}

function loadSteamCaseSnapshots(array $caseNames): array
{
    $snapshots = [];
    $missing = [];

    foreach ($caseNames as $name) {
        $cacheKey = 'steam_case_roi_' . slugKey($name) . '.json';
        $cached = loadRoiCache($cacheKey, 3600);
        if (is_array($cached)) {
            $snapshots[$name] = $cached;
            continue;
        }

        $missing[] = $name;
    }

    foreach (array_chunk($missing, 8) as $chunk) {
        $responses = multiFetchTextRequests(
            array_combine(
                $chunk,
                array_map(static fn (string $name): string => steamPriceOverviewUrl($name), $chunk)
            ),
            ['Accept: application/json']
        );

        foreach ($responses as $name => $response) {
            if (($response['status'] ?? 500) >= 400 || !empty($response['error'])) {
                continue;
            }

            $snapshot = parseSteamPriceOverview($name, (string)($response['body'] ?? ''));
            if ($snapshot === null) {
                continue;
            }

            $snapshots[$name] = $snapshot;
            saveRoiCache('steam_case_roi_' . slugKey($name) . '.json', $snapshot);
        }
    }

    return $snapshots;
}

function historyBaselineForRange(array $history, int $requestedDays, ?float $currentPrice = null): array
{
    if (!$history) {
        return [
            'current_price' => $currentPrice,
            'baseline_price' => null,
            'change_pct' => null,
            'change_abs' => null,
            'effective_days' => 0,
        ];
    }

    $latestPoint = $history[count($history) - 1];
    $latestTime = (int)$latestPoint['time'];
    $current = $currentPrice !== null ? $currentPrice : round((float)$latestPoint['price'], 2);
    $targetTime = $latestTime - ($requestedDays * 86400);
    $baselinePoint = $history[0];

    foreach ($history as $point) {
        if ((int)$point['time'] <= $targetTime) {
            $baselinePoint = $point;
            continue;
        }
        break;
    }

    $baselinePrice = round((float)$baselinePoint['price'], 2);
    $effectiveDays = max(0, (int)round(($latestTime - (int)$baselinePoint['time']) / 86400));
    $changePct = $baselinePrice > 0 ? round((($current - $baselinePrice) / $baselinePrice) * 100, 2) : null;
    $changeAbs = $baselinePrice > 0 ? round($current - $baselinePrice, 2) : null;

    return [
        'current_price' => $current,
        'baseline_price' => $baselinePrice,
        'change_pct' => $changePct,
        'change_abs' => $changeAbs,
        'effective_days' => $effectiveDays,
    ];
}

function sampleSparkline(array $values, int $maxPoints = 24): array
{
    $series = array_values(array_filter(array_map(static function (mixed $value): ?float {
        return is_numeric($value) ? round((float)$value, 4) : null;
    }, $values), static fn (?float $value): bool => $value !== null));

    $count = count($series);
    if ($count <= $maxPoints) {
        return $series;
    }

    $sampled = [];
    for ($index = 0; $index < $maxPoints; $index += 1) {
        $position = (int)round(($index / max(1, $maxPoints - 1)) * ($count - 1));
        $sampled[] = $series[$position];
    }

    return $sampled;
}

function buildSteamCaseRecord(string $marketHashName, array $snapshot, string $range): array
{
    $rangeDays = roiRangeDays($range);
    $history = is_array($snapshot['history'] ?? null) ? $snapshot['history'] : [];
    $baseline = historyBaselineForRange($history, $rangeDays, isset($snapshot['current_price']) ? (float)$snapshot['current_price'] : null);
    $sparkline = sampleSparkline(array_map(static fn (array $point): float => (float)$point['price'], $history));
    $rangeNotice = '';

    if (($baseline['effective_days'] ?? 0) > 0 && ($baseline['effective_days'] ?? 0) + 2 < $rangeDays) {
        $rangeNotice = sprintf(
            'Steam history for this item currently covers %d days, so the nearest available range is being used.',
            (int)$baseline['effective_days']
        );
    }

    return [
        'market_hash_name' => $marketHashName,
        'source' => 'steam',
        'source_label' => 'Steam Market',
        'range_requested' => $range,
        'range_used' => ($baseline['effective_days'] ?? 0) + 2 < $rangeDays && ($baseline['effective_days'] ?? 0) > 0
            ? sprintf('%dD', (int)$baseline['effective_days'])
            : roiRangeLabel($range),
        'range_notice' => $rangeNotice,
        'current_price' => $baseline['current_price'],
        'current_price_display' => formatEuro($baseline['current_price']),
        'baseline_price' => $baseline['baseline_price'],
        'baseline_price_display' => formatEuro($baseline['baseline_price']),
        'roi_pct' => $baseline['change_pct'],
        'roi_display' => formatSignedPercent($baseline['change_pct']),
        'profit_abs' => $baseline['change_abs'],
        'profit_display' => formatSignedEuro($baseline['change_abs']),
        'listings' => isset($snapshot['sell_orders']) ? (int)$snapshot['sell_orders'] : null,
        'listings_display' => formatCompactInteger(isset($snapshot['sell_orders']) ? (int)$snapshot['sell_orders'] : null),
        'secondary_metric_label' => 'Active listings',
        'secondary_metric_value' => isset($snapshot['buy_orders']) ? (int)$snapshot['buy_orders'] : null,
        'secondary_metric_display' => formatCompactInteger(isset($snapshot['buy_orders']) ? (int)$snapshot['buy_orders'] : null),
        'market_url' => (string)($snapshot['market_url'] ?? steamMarketListingUrlLocal($marketHashName)),
        'sparkline' => $sparkline,
        'updated_at' => (string)($snapshot['updated_at'] ?? ''),
    ];
}

function resolvePythonExecutable(): string
{
    $override = trim((string)getenv('PYTHON_BIN'));
    if ($override !== '') {
        return $override;
    }

    $localAppData = getenv('LOCALAPPDATA');
    if (is_string($localAppData) && $localAppData !== '') {
        $matches = glob($localAppData . DIRECTORY_SEPARATOR . 'Python' . DIRECTORY_SEPARATOR . 'pythoncore-*' . DIRECTORY_SEPARATOR . 'python.exe');
        if (is_array($matches) && $matches) {
            rsort($matches);
            return $matches[0];
        }

        $binPython = $localAppData . DIRECTORY_SEPARATOR . 'Python' . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'python.exe';
        if (is_file($binPython)) {
            return $binPython;
        }
    }

    return 'python';
}

function fetchSkinportCasePayload(array $caseNames): array
{
    $cacheKey = 'skinport_case_roi_' . md5(json_encode($caseNames));
    $cached = loadRoiCache($cacheKey, 900);
    if (is_array($cached)) {
        return $cached;
    }

    $cfg = function_exists('appConfig') ? (appConfig()['skinport'] ?? []) : [];
    $clientId = trim((string)($cfg['client_id'] ?? ''));
    $clientSecret = trim((string)($cfg['client_secret'] ?? ''));
    $authHeader = ($clientId !== '' && $clientSecret !== '')
        ? base64_encode($clientId . ':' . $clientSecret)
        : '';

    $pythonScript = <<<'PY'
import base64
import json
import sys
import requests

names = json.loads(base64.b64decode(sys.argv[1]).decode('utf-8'))
auth_b64 = sys.argv[2] if len(sys.argv) > 2 else ''
headers = {'Accept-Encoding': 'br', 'Accept': 'application/json'}
if auth_b64:
    headers['Authorization'] = 'Basic ' + auth_b64

history_response = requests.get(
    'https://api.skinport.com/v1/sales/history',
    params={
        'app_id': 730,
        'currency': 'EUR',
        'market_hash_name': ','.join(names),
    },
    headers=headers,
    timeout=60,
)
history_response.raise_for_status()
history_rows = history_response.json()

items_response = requests.get(
    'https://api.skinport.com/v1/items',
    params={
        'app_id': 730,
        'currency': 'EUR',
        'tradable': 1,
    },
    headers=headers,
    timeout=60,
)
items_response.raise_for_status()
items_rows = items_response.json()

wanted = set(names)
filtered_history = {
    row.get('market_hash_name'): row
    for row in history_rows
    if isinstance(row, dict) and row.get('market_hash_name') in wanted
}
filtered_items = {
    row.get('market_hash_name'): row
    for row in items_rows
    if isinstance(row, dict) and row.get('market_hash_name') in wanted
}

print(json.dumps({'history': filtered_history, 'items': filtered_items}))
PY;

    $command = sprintf(
        '%s - %s %s',
        escapeshellarg(resolvePythonExecutable()),
        escapeshellarg(base64_encode(json_encode($caseNames, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))),
        escapeshellarg($authHeader)
    );

    $descriptorSpec = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $process = function_exists('proc_open') ? proc_open($command, $descriptorSpec, $pipes) : null;
    if (!is_resource($process)) {
        throw new RuntimeException('Could not start Python process for Skinport ROI request (process functions are disabled on this host).');
    }

    fwrite($pipes[0], $pythonScript);
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[2]);
    $exitCode = proc_close($process);

    if ($exitCode !== 0) {
        throw new RuntimeException('Skinport ROI request failed: ' . trim($stderr ?: $stdout));
    }

    $decoded = json_decode((string)$stdout, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Skinport ROI request returned malformed JSON.');
    }

    saveRoiCache($cacheKey, $decoded);

    return $decoded;
}

function chooseSkinportPrice(array $itemRow, array $historyRow): ?float
{
    foreach (['median_price', 'mean_price', 'min_price', 'suggested_price'] as $key) {
        if (isset($itemRow[$key]) && is_numeric($itemRow[$key])) {
            return round((float)$itemRow[$key], 2);
        }
    }

    foreach (['median', 'avg', 'min'] as $key) {
        if (isset($historyRow['last_24_hours'][$key]) && is_numeric($historyRow['last_24_hours'][$key])) {
            return round((float)$historyRow['last_24_hours'][$key], 2);
        }
    }

    return null;
}

function skinportHistoryBucket(string $range): string
{
    return match ($range) {
        '7d' => 'last_7_days',
        '90d', '1y' => 'last_90_days',
        default => 'last_30_days',
    };
}

function buildSkinportCaseRecord(string $marketHashName, ?array $itemRow, ?array $historyRow, string $range): array
{
    $itemRow ??= [];
    $historyRow ??= [];
    $bucket = skinportHistoryBucket($range);
    $currentPrice = chooseSkinportPrice($itemRow, $historyRow);
    $baselinePrice = null;

    foreach (['median', 'avg', 'min'] as $key) {
        if (isset($historyRow[$bucket][$key]) && is_numeric($historyRow[$bucket][$key])) {
            $baselinePrice = round((float)$historyRow[$bucket][$key], 2);
            break;
        }
    }

    $roiPct = ($currentPrice !== null && $baselinePrice !== null && $baselinePrice > 0)
        ? round((($currentPrice - $baselinePrice) / $baselinePrice) * 100, 2)
        : null;
    $profitAbs = ($currentPrice !== null && $baselinePrice !== null)
        ? round($currentPrice - $baselinePrice, 2)
        : null;
    $sparkline = sampleSparkline([
        isset($historyRow['last_90_days']['median']) ? (float)$historyRow['last_90_days']['median'] : null,
        isset($historyRow['last_30_days']['median']) ? (float)$historyRow['last_30_days']['median'] : null,
        isset($historyRow['last_7_days']['median']) ? (float)$historyRow['last_7_days']['median'] : null,
        isset($historyRow['last_24_hours']['median']) ? (float)$historyRow['last_24_hours']['median'] : null,
    ]);

    return [
        'market_hash_name' => $marketHashName,
        'source' => 'skinport',
        'source_label' => 'Skinport',
        'range_requested' => $range,
        'range_used' => $range === '1y' ? '90D' : roiRangeLabel($range),
        'range_notice' => $range === '1y'
            ? 'Skinport public sales history currently tops out at 90D, so 1Y uses the nearest live range.'
            : '',
        'current_price' => $currentPrice,
        'current_price_display' => formatEuro($currentPrice),
        'baseline_price' => $baselinePrice,
        'baseline_price_display' => formatEuro($baselinePrice),
        'roi_pct' => $roiPct,
        'roi_display' => formatSignedPercent($roiPct),
        'profit_abs' => $profitAbs,
        'profit_display' => formatSignedEuro($profitAbs),
        'listings' => isset($itemRow['quantity']) ? (int)$itemRow['quantity'] : null,
        'listings_display' => formatCompactInteger(isset($itemRow['quantity']) ? (int)$itemRow['quantity'] : null),
        'secondary_metric_label' => '24h sales',
        'secondary_metric_value' => isset($historyRow['last_24_hours']['volume']) ? (int)$historyRow['last_24_hours']['volume'] : null,
        'secondary_metric_display' => formatCompactInteger(isset($historyRow['last_24_hours']['volume']) ? (int)$historyRow['last_24_hours']['volume'] : null),
        'market_url' => (string)($itemRow['market_page'] ?? $historyRow['market_page'] ?? ''),
        'sparkline' => $sparkline,
        'updated_at' => isset($itemRow['updated_at']) && is_numeric($itemRow['updated_at'])
            ? gmdate(DATE_ATOM, (int)$itemRow['updated_at'])
            : gmdate(DATE_ATOM),
    ];
}

try {
    $payload = parseRoiPayload();
    $caseNames = requestedCaseNames($payload);
    if (!$caseNames) {
        throw new RuntimeException('No item names were provided.');
    }

    $source = normalizeRoiSource((string)($payload['source'] ?? 'steam'));
    $range = normalizeRoiRange((string)($payload['range'] ?? '1y'));
    $records = [];

    if ($source === 'skinport') {
        $skinportPayload = fetchSkinportCasePayload($caseNames);
        $historyRows = is_array($skinportPayload['history'] ?? null) ? $skinportPayload['history'] : [];
        $itemRows = is_array($skinportPayload['items'] ?? null) ? $skinportPayload['items'] : [];

        foreach ($caseNames as $caseName) {
            $records[] = buildSkinportCaseRecord(
                $caseName,
                is_array($itemRows[$caseName] ?? null) ? $itemRows[$caseName] : null,
                is_array($historyRows[$caseName] ?? null) ? $historyRows[$caseName] : null,
                $range
            );
        }
    } else {
        $snapshots = loadSteamCaseSnapshots($caseNames);
        foreach ($caseNames as $caseName) {
            if (!is_array($snapshots[$caseName] ?? null)) {
                $records[] = [
                    'market_hash_name' => $caseName,
                    'source' => 'steam',
                    'source_label' => 'Steam Market',
                    'range_requested' => $range,
                    'range_used' => roiRangeLabel($range),
                    'range_notice' => 'Steam market data is temporarily unavailable for this item.',
                    'current_price' => null,
                    'current_price_display' => '—',
                    'baseline_price' => null,
                    'baseline_price_display' => '—',
                    'roi_pct' => null,
                    'roi_display' => '—',
                    'profit_abs' => null,
                    'profit_display' => '—',
                    'listings' => null,
                    'listings_display' => '—',
                    'secondary_metric_label' => 'Buy orders',
                    'secondary_metric_value' => null,
                    'secondary_metric_display' => '—',
                    'market_url' => steamMarketListingUrlLocal($caseName),
                    'sparkline' => [],
                    'updated_at' => '',
                ];
                continue;
            }

            $records[] = buildSteamCaseRecord($caseName, $snapshots[$caseName], $range);
        }
    }

    respondJson([
        'success' => true,
        'source' => $source,
        'range' => $range,
        'range_label' => roiRangeLabel($range),
        'items' => $records,
        'cases' => $records,
        'updated_at' => gmdate(DATE_ATOM),
    ]);
} catch (Throwable $exception) {
    respondJson([
        'success' => false,
        'error' => $exception->getMessage(),
    ], 500);
}
