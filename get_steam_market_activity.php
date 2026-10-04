<?php
declare(strict_types=1);

require_once __DIR__ . '/steam_auth_helpers.php';
require_once __DIR__ . '/lib/steam_circuit.php';

function marketActivityCachePath(string $marketHashName, int $appId): string
{
    $key = md5(strtolower($appId . '|' . trim($marketHashName)));
    return rtrim(sys_get_temp_dir(), '\\/') . DIRECTORY_SEPARATOR . 'csgo_market_activity_' . $key . '.json';
}

function loadMarketActivityCache(string $marketHashName, int $appId, int $ttlSeconds = 900): ?array
{
    $path = marketActivityCachePath($marketHashName, $appId);
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

function marketActivityHistoryLastDate(array $history): string
{
    if (!$history) {
        return '';
    }
    $last = $history[array_key_last($history)];
    $date = substr((string)($last['date'] ?? ''), 0, 10);
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) ? $date : '';
}

function marketActivityHistoryIsCurrent(array $history, int $maxAgeDays = 2): bool
{
    $lastDate = marketActivityHistoryLastDate($history);
    if ($lastDate === '') {
        return false;
    }
    $cutoff = (new DateTimeImmutable('today', new DateTimeZone('UTC')))
        ->sub(new DateInterval('P' . max(0, $maxAgeDays) . 'D'))
        ->format('Y-m-d');
    return $lastDate >= $cutoff;
}

/** Unix seconds from Steam pricehistory / listing timestamps. */
function parseSteamMarketTimestamp(mixed $timeValue): int
{
    if ($timeValue === null || $timeValue === false || $timeValue === '') {
        return 0;
    }

    if (is_numeric($timeValue)) {
        $n = (float)$timeValue;
        if ($n <= 0) {
            return 0;
        }
        // Listing JSON sometimes emits milliseconds (13+ digits).
        if ($n >= 1.0e12) {
            $n /= 1000.0;
        }
        $ts = (int)round($n);
        return $ts > 0 ? $ts : 0;
    }

    $raw = trim((string)$timeValue);
    if ($raw === '') {
        return 0;
    }

    if (preg_match('/^(\d{4}-\d{2}-\d{2})/', $raw, $matches)) {
        $dt = DateTimeImmutable::createFromFormat('!Y-m-d', $matches[1], new DateTimeZone('UTC'));
        return $dt instanceof DateTimeImmutable ? $dt->getTimestamp() : 0;
    }

    // Steam: "Dec 24 2025 01: +0" — strtotime fails on the bare "HH: +0" offset.
    $normalized = preg_replace('/: \+(\d+)/', ':00 +$1', $raw) ?? $raw;
    $normalized = preg_replace('/\s+\+0$/', ' +0000', $normalized) ?? $normalized;
    $normalized = preg_replace('/\s+\+00$/', ' +0000', $normalized) ?? $normalized;
    $ts = strtotime($normalized);
    if (is_int($ts) && $ts > 0) {
        return $ts;
    }

    if (preg_match('/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/', $raw, $matches)) {
        $dt = DateTimeImmutable::createFromFormat(
            '!M j Y',
            $matches[1] . ' ' . $matches[2] . ' ' . $matches[3],
            new DateTimeZone('UTC')
        );
        if ($dt instanceof DateTimeImmutable) {
            return $dt->getTimestamp();
        }
    }

    $ts = strtotime($raw);
    return (is_int($ts) && $ts > 0) ? $ts : 0;
}

function loadMarketActivityCacheAnyAge(string $marketHashName, int $appId): ?array
{
    $path = marketActivityCachePath($marketHashName, $appId);
    if (!is_file($path)) {
        return null;
    }

    $decoded = json_decode((string)@file_get_contents($path), true);
    return is_array($decoded) ? $decoded : null;
}

function resolveSteamMarketHistoryPoints(string $marketHashName, int $appId = 730, int $maxPoints = 3500): array
{
    $marketHashName = trim($marketHashName);
    if ($marketHashName === '') {
        return [];
    }

    $listingHtml = steamFetchMarketListingHtml($marketHashName, $appId);
    $steamPageHistory = marketActivityMergeHistorySources(
        extractSteamMarketPriceHistoryFromListingHtml($listingHtml, $marketHashName),
        extractSteamLine1HistoryFromHtml($listingHtml)
    );
    $apiHistory = steamFetchPriceHistoryApi($marketHashName, $appId);
    $dbHistory = loadRealMarketActivityHistory($marketHashName);

    $merged = marketActivityMergeHistorySources($dbHistory, $steamPageHistory, $apiHistory);
    if (count($merged) >= 2) {
        persistSteamHistoryToRoiCache($marketHashName, $merged);
        return marketActivityHistoryForRange($merged, 0, $maxPoints);
    }

    $cachedPayload = loadMarketActivityCacheAnyAge($marketHashName, $appId);
    if (is_array($cachedPayload) && (int)($cachedPayload['history_schema'] ?? 0) >= 14) {
        $byRange = $cachedPayload['sales_history_by_range'] ?? [];
        $history = is_array($byRange['all'] ?? null) ? $byRange['all'] : ($cachedPayload['sales_history'] ?? []);
        if (is_array($history) && count($history) >= 180) {
            return marketActivityHistoryForRange($history, 0, $maxPoints);
        }
    }

    $realHistory = loadRealMarketActivityHistory($marketHashName);
    if (count($realHistory) < 2) {
        return [];
    }

    return marketActivityHistoryForRange($realHistory, 0, $maxPoints);
}

function saveMarketActivityCache(string $marketHashName, int $appId, array $payload): void
{
    @file_put_contents(marketActivityCachePath($marketHashName, $appId), json_encode($payload));
}

function steamMarketPriceOverviewUrl(string $marketHashName, int $appId = 730, int $currency = 3): string
{
    return sprintf(
        'https://steamcommunity.com/market/priceoverview/?appid=%d&currency=%d&market_hash_name=%s',
        $appId,
        $currency,
        rawurlencode($marketHashName)
    );
}

function steamFetchPriceOverview(string $marketHashName, int $appId = 730, int $currency = 3): array
{
    if (steamCircuitOpen()) {
        return [];
    }
    try {
        $response = httpTextRequestWithStatus(
            steamMarketPriceOverviewUrl($marketHashName, $appId, $currency),
            ['User-Agent: Mozilla/5.0', 'Accept: application/json, text/plain, */*'],
            25
        );
        if (steamCircuitNote((int)($response['status'] ?? 0), (string)($response['body'] ?? ''))) {
            return [];
        }

        $payload = json_decode((string)($response['body'] ?? ''), true);
        return is_array($payload) ? $payload : [];
    } catch (Throwable) {
        // Steam often rate-limits priceoverview with an HTML 429 page. Keep the
        // endpoint alive so the listing page/order-book fallback can still price it.
        return [];
    }
}

function steamSessionCookieHeader(): ?string
{
    $cookie = trim((string)(appConfig()['steam_session']['login_secure'] ?? ''));
    return $cookie === '' ? null : ('Cookie: steamLoginSecure=' . $cookie);
}

function steamFetchMarketListingHtml(string $marketHashName, int $appId = 730): string
{
    $url = steamMarketListingUrl($marketHashName, $appId);
    $baseHeaders = ['User-Agent: Mozilla/5.0', 'Accept: text/html,*/*;q=0.8'];
    $cookieHeader = steamSessionCookieHeader();

    if ($cookieHeader !== null) {
        try {
            $headers = $baseHeaders;
            $headers[] = $cookieHeader;
            $response = httpTextRequestWithStatus($url, $headers, 25);
            if (($response['status'] ?? 500) < 400) {
                return (string)($response['body'] ?? '');
            }
        } catch (Throwable) {
            // An expired/invalid steamLoginSecure cookie makes Steam bounce the
            // request through login.steampowered.com/jwt/refresh forever (curl
            // keeps resending the stale cookie on every hop until it hits the
            // redirect cap). Fall back to an anonymous request below — the
            // public listing page works fine without a session.
        }
    }

    $response = httpTextRequestWithStatus($url, $baseHeaders, 25);
    if (($response['status'] ?? 500) >= 400) {
        return '';
    }

    return (string)($response['body'] ?? '');
}

function normalizeEscapedMarketHtml(string $html): string
{
    $normalized = preg_replace('/\\\\+"/', '"', $html);
    return is_string($normalized) ? $normalized : $html;
}

function extractEscapedInteger(string $html, string $key): ?int
{
    $normalized = normalizeEscapedMarketHtml($html);
    $patterns = [
        '/"' . preg_quote($key, '/') . '":([0-9]+)/',
        '/' . preg_quote($key, '/') . '":([0-9]+)/',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $normalized, $matches)) {
            return (int)$matches[1];
        }
    }

    return null;
}

function extractCompactOrderPairs(string $html, string $key): array
{
    $normalized = normalizeEscapedMarketHtml($html);
    $patterns = [
        '/"' . preg_quote($key, '/') . '":\[([0-9,]+)\]/',
        '/' . preg_quote($key, '/') . '":\[([0-9,]+)\]/',
    ];

    $rawSeries = null;
    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $normalized, $matches)) {
            $rawSeries = $matches[1];
            break;
        }
    }

    if ($rawSeries === null) {
        return [];
    }

    $numbers = array_values(array_filter(array_map('trim', explode(',', $rawSeries)), static fn ($value) => $value !== ''));
    $pairs = [];

    for ($index = 0; $index + 1 < count($numbers); $index += 2) {
        $priceCents = (int)$numbers[$index];
        $quantity = (int)$numbers[$index + 1];

        $pairs[] = [
            'price_cents' => $priceCents,
            'price' => round($priceCents / 100, 2),
            'quantity' => $quantity,
        ];
    }

    return $pairs;
}

function formatEuroPrice(?float $value): string
{
    if ($value === null || !is_finite($value)) {
        return '—';
    }

    return '€' . number_format($value, 2, '.', '');
}

function buildSyntheticSalesHistory(
    string $seedText,
    array $sellOrders,
    ?float $suggestedPrice,
    ?float $startingPrice,
    int $points = 16,
    int $intervalDays = 1,
    float $trendFactor = 0.0
): array {
    $baseline = $suggestedPrice ?? $startingPrice ?? null;
    if ($baseline === null || $baseline <= 0) {
        return [];
    }

    $orderLevels = array_values(array_map(
        static fn (array $entry): float => (float)($entry['price'] ?? 0),
        array_slice($sellOrders, 0, max(6, $points))
    ));

    if (!$orderLevels) {
        $orderLevels = [$baseline];
    }

    $seed = abs((int)crc32($seedText));
    $today = new DateTimeImmutable('today');
    $history = [];

    for ($index = 0; $index < $points; $index += 1) {
        $sourceIndex = min(count($orderLevels) - 1, (int)floor(($index / max(1, $points - 1)) * (count($orderLevels) - 1)));
        $sourcePrice = $orderLevels[$sourceIndex] > 0 ? $orderLevels[$sourceIndex] : $baseline;
        $wave = sin(($index + ($seed % 7)) / 2.8) * 0.012 + cos(($index + ($seed % 11)) / 4.1) * 0.008;
        $rawPrice = max(0.03, round(($baseline * 0.58) + ($sourcePrice * 0.42) + ($baseline * $wave), 2));

        // Apply trend: earlier points use a lower/higher multiplier
        $progress = $points > 1 ? ($index / ($points - 1)) : 1.0;
        $trendMultiplier = 1.0 - $trendFactor * (1.0 - $progress);
        $price = max(0.03, round($rawPrice * $trendMultiplier, 2));

        $quantitySource = $sellOrders[$sourceIndex]['quantity'] ?? (($seed % 12) + 3);
        $quantity = max(1, min(48, (int)round($quantitySource / max(1, (($seed + $index) % 9) + 2))));
        $totalDaysBack = ($points - 1 - $index) * $intervalDays;
        $date = $today->sub(new DateInterval('P' . $totalDaysBack . 'D'));

        $label = $intervalDays >= 30
            ? $date->format('M \'y')
            : ($intervalDays >= 7
                ? $date->format('j M')
                : $date->format('j M'));

        $history[] = [
            'label' => $label,
            'date'  => $date->format('Y-m-d'),
            'price' => $price,
            'price_display' => formatEuroPrice($price),
            'quantity' => $quantity,
        ];
    }

    return $history;
}

function buildLatestSalesRows(array $history, int $rows = 8): array
{
    if (!$history) {
        return [];
    }

    $latestPoints = array_reverse(array_slice($history, -$rows));
    $sales = [];

    foreach ($latestPoints as $point) {
        $timestamp = new DateTimeImmutable((string)($point['date'] ?? 'now'), new DateTimeZone('UTC'));
        $quantity = max(1, (int)($point['quantity'] ?? 1));
        $sales[] = [
            'sold_at' => $timestamp->format('M j, Y'),
            'price' => (float)$point['price'],
            'price_display' => formatEuroPrice((float)$point['price']),
            'quantity' => $quantity,
            'quantity_display' => number_format($quantity) . ' sold',
        ];
    }

    return $sales;
}

function normalizeMarketActivityHistoryPoint($timeValue, $priceValue, $quantityValue = null): ?array
{
    $rawPrice = is_numeric($priceValue) ? (float)$priceValue : null;
    if ($rawPrice === null || $rawPrice <= 0) {
        return null;
    }
    $price = round($rawPrice, $rawPrice < 1 ? 4 : 2);

    $timestamp = parseSteamMarketTimestamp($timeValue);

    if ($timestamp <= 0) {
        return null;
    }

    $date = (new DateTimeImmutable('@' . $timestamp))->setTimezone(new DateTimeZone('UTC'));
    $quantity = is_numeric($quantityValue) ? max(1, (int)$quantityValue) : 1;

    return [
        'label' => $date->format('j M'),
        'date' => $date->format('Y-m-d'),
        'price' => $price,
        'price_display' => formatEuroPrice($price),
        'quantity' => $quantity,
    ];
}

function normalizeMarketActivityHistory(array $rows): array
{
    $byDate = [];

    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }

        $point = normalizeMarketActivityHistoryPoint(
            $row['time'] ?? $row['recorded_at'] ?? $row['date'] ?? ($row[0] ?? null),
            $row['price'] ?? $row['value'] ?? ($row[1] ?? null),
            $row['quantity'] ?? $row['volume'] ?? ($row[2] ?? null)
        );

        if ($point === null) {
            continue;
        }

        $dateKey = $point['date'];
        if (!isset($byDate[$dateKey])) {
            $byDate[$dateKey] = [
                'date' => $dateKey,
                'label' => $point['label'],
                'weighted_sum' => 0.0,
                'quantity' => 0,
            ];
        }

        // Volume-weighted average — do NOT expand quantity into N price copies
        // (high-volume cases OOMed the old median-of-duplicates approach).
        $weight = max(1, (int)($point['quantity'] ?? 1));
        $byDate[$dateKey]['weighted_sum'] += (float)$point['price'] * $weight;
        $byDate[$dateKey]['quantity'] += $weight;
    }

    ksort($byDate);
    $todayKey = (new DateTimeImmutable('today', new DateTimeZone('UTC')))->format('Y-m-d');
    $history = [];
    foreach ($byDate as $entry) {
        if ((string)($entry['date'] ?? '') > $todayKey) {
            continue;
        }
        $quantity = max(1, (int)($entry['quantity'] ?? 0));
        $weightedSum = (float)($entry['weighted_sum'] ?? 0);
        if ($weightedSum <= 0) {
            continue;
        }

        $price = $weightedSum / $quantity;
        $price = round($price, $price < 1 ? 4 : 2);

        $history[] = [
            'label' => (string)$entry['label'],
            'date' => (string)$entry['date'],
            'price' => $price,
            'price_display' => formatEuroPrice($price),
            'quantity' => $quantity,
        ];
    }

    return $history;
}

function marketActivityMergeHistorySources(array ...$sources): array
{
    $byDate = [];

    foreach ($sources as $source) {
        if (!is_array($source) || !$source) {
            continue;
        }

        foreach (normalizeMarketActivityHistory($source) as $point) {
            $date = (string)($point['date'] ?? '');
            if ($date === '') {
                continue;
            }
            $byDate[$date] = $point;
        }
    }

    if (count($byDate) < 2) {
        return [];
    }

    ksort($byDate);
    return array_values($byDate);
}

function steamPriceHistoryApiUrl(string $marketHashName, int $appId = 730, int $currency = 3): string
{
    return sprintf(
        'https://steamcommunity.com/market/pricehistory/?appid=%d&currency=%d&market_hash_name=%s',
        $appId,
        $currency,
        rawurlencode($marketHashName)
    );
}

function steamFetchPriceHistoryApi(string $marketHashName, int $appId = 730, int $currency = 3): array
{
    if (steamCircuitOpen()) {
        return [];
    }
    try {
        $url = steamPriceHistoryApiUrl($marketHashName, $appId, $currency);
        $listingUrl = steamMarketListingUrl($marketHashName, $appId);
        $headers = [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept: application/json, text/javascript, */*;q=0.8',
            'Accept-Language: en-US,en;q=0.9',
            'Referer: ' . $listingUrl,
        ];
        $cookieHeader = steamSessionCookieHeader();
        if ($cookieHeader !== null) {
            $headers[] = $cookieHeader;
        }
        $response = httpTextRequestWithStatus($url, $headers, 25);
        if (steamCircuitNote((int)($response['status'] ?? 0), (string)($response['body'] ?? ''))) {
            return [];
        }
        $payload = json_decode((string)($response['body'] ?? ''), true);
        if (!is_array($payload) || empty($payload['success']) || !is_array($payload['prices'] ?? null)) {
            return [];
        }

        $rows = [];
        foreach ($payload['prices'] as $entry) {
            if (!is_array($entry) || count($entry) < 2) {
                continue;
            }

            $rows[] = [
                'time' => $entry[0],
                'price' => $entry[1],
                'quantity' => $entry[2] ?? 1,
            ];
        }

        return normalizeMarketActivityHistory($rows);
    } catch (Throwable) {
        return [];
    }
}


function extractSteamLine1HistoryFromHtml(string $html): array
{
    if (trim($html) === '') {
        return [];
    }

    $blobs = [$html, decodeSteamListingEmbeddedJson($html)];
    foreach ($blobs as $text) {
        if (!is_string($text) || $text === '') {
            continue;
        }

        $offset = 0;
        while (($pos = strpos($text, 'line1', $offset)) !== false) {
            $bracket = strpos($text, '[', $pos);
            if ($bracket === false || $bracket > $pos + 24) {
                $offset = $pos + 5;
                continue;
            }
            $literal = extractJsonArrayLiteral($text, $bracket);
            $offset = $pos + 5;
            if ($literal === null) {
                continue;
            }
            $points = json_decode($literal, true);
            if (!is_array($points) || count($points) < 2) {
                continue;
            }
            $rows = [];
            foreach ($points as $point) {
                if (!is_array($point) || count($point) < 2) {
                    continue;
                }
                $rows[] = [
                    'time' => $point[0] ?? $point['time'] ?? null,
                    'price' => $point[1] ?? $point['price'] ?? $point['price_median'] ?? null,
                    'quantity' => $point[2] ?? $point['quantity'] ?? $point['purchases'] ?? 1,
                ];
            }
            $normalized = normalizeMarketActivityHistory($rows);
            if (count($normalized) >= 2) {
                return $normalized;
            }
        }
    }

    return [];
}

function persistSteamHistoryToRoiCache(string $marketHashName, array $history): void
{
    $points = [];
    foreach ($history as $point) {
        if (!is_array($point)) {
            continue;
        }
        $date = substr((string)($point['date'] ?? ''), 0, 10);
        $price = (float)($point['price'] ?? 0);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || $price <= 0) {
            continue;
        }
        $points[] = [
            'date' => $date,
            'price' => round($price, $price < 1 ? 4 : 2),
            'volume' => max(1, (int)($point['quantity'] ?? $point['volume'] ?? 1)),
        ];
    }
    if (count($points) < 2 || !marketActivityHistoryIsCurrent($points, 14)) {
        return;
    }

    $dir = __DIR__ . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'roi-price-cache';
    if (!is_dir($dir)) {
        @mkdir($dir, 0777, true);
    }
    $path = $dir . DIRECTORY_SEPARATOR . 'steam_' . md5($marketHashName) . '.json';
    $last = $points[array_key_last($points)];
    if (is_file($path)) {
        $existing = json_decode((string)@file_get_contents($path), true);
        $existingHist = is_array($existing['price_history'] ?? null) ? $existing['price_history'] : [];
        $existingLast = '';
        if ($existingHist) {
            $er = $existingHist[array_key_last($existingHist)];
            $existingLast = substr((string)($er['date'] ?? ''), 0, 10);
        }
        if ($existingLast >= (string)$last['date'] && count($existingHist) > (int)(count($points) * 1.05)) {
            return;
        }
    }

    $payload = [
        'market_hash_name' => $marketHashName,
        'current_price' => $last['price'],
        'sell_orders' => $last['volume'],
        'buy_orders' => null,
        'price_history' => $points,
        'updated_at' => gmdate('c'),
        'source' => 'steam_pricehistory',
    ];
    @file_put_contents($path, json_encode($payload));
}

function resolveMarketActivityRealHistory(string $marketHashName, array $steamPageHistory): array
{
    $apiHistory = steamFetchPriceHistoryApi($marketHashName);
    if (count($apiHistory) >= 2) {
        return $apiHistory;
    }

    if (count($steamPageHistory) >= 2) {
        return $steamPageHistory;
    }

    return loadRealMarketActivityHistory($marketHashName);
}

function decodeSteamListingEmbeddedJson(string $html): string
{
    $decoded = html_entity_decode($html, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    for ($pass = 0; $pass < 8; $pass++) {
        $decoded = stripcslashes($decoded);
        $decoded = html_entity_decode($decoded, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    return $decoded;
}

function extractJsonArrayLiteral(string $text, int $startPos): ?string
{
    $length = strlen($text);
    if ($startPos < 0 || $startPos >= $length || $text[$startPos] !== '[') {
        return null;
    }

    $depth = 0;
    $inString = false;
    $escaped = false;

    for ($index = $startPos; $index < $length; $index++) {
        $char = $text[$index];

        if ($inString) {
            if ($escaped) {
                $escaped = false;
                continue;
            }
            if ($char === '\\') {
                $escaped = true;
                continue;
            }
            if ($char === '"') {
                $inString = false;
            }
            continue;
        }

        if ($char === '"') {
            $inString = true;
            continue;
        }

        if ($char === '[') {
            $depth++;
            continue;
        }

        if ($char === ']') {
            $depth--;
            if ($depth === 0) {
                return substr($text, $startPos, $index - $startPos + 1);
            }
        }
    }

    return null;
}

function extractSteamMarketPriceHistoryFromListingHtml(string $html, string $marketHashName = ''): array
{
    if (trim($html) === '') {
        return [];
    }

    $decoded = decodeSteamListingEmbeddedJson($html);
    $targetName = trim($marketHashName);
    $searchFrom = 0;
    $matchedRows = [];

    while (($keyPos = strpos($decoded, '"queryKey":["market","description",', $searchFrom)) !== false) {
        if (!preg_match(
            '/"queryKey":\["market","description",(\d+),"((?:\\\\.|[^"\\\\])*)"\]/',
            $decoded,
            $keyMatch,
            0,
            $keyPos
        )) {
            $searchFrom = $keyPos + 1;
            continue;
        }

        $entryName = stripcslashes((string)$keyMatch[2]);
        $pricesPos = strpos($decoded, '"prices":[', $keyPos);
        if ($pricesPos === false || $pricesPos > ($keyPos + 1200)) {
            $searchFrom = $keyPos + 1;
            continue;
        }

        $arrayStart = $pricesPos + strlen('"prices":');
        $arrayLiteral = extractJsonArrayLiteral($decoded, $arrayStart);
        if ($arrayLiteral === null) {
            $searchFrom = $keyPos + 1;
            continue;
        }

        $points = json_decode($arrayLiteral, true);
        if (!is_array($points) || !$points) {
            $searchFrom = $keyPos + 1;
            continue;
        }

        $rows = [];
        foreach ($points as $point) {
            if (!is_array($point)) {
                continue;
            }

            $rows[] = [
                'time' => $point['time'] ?? null,
                'price' => $point['price_median'] ?? $point['price'] ?? null,
                'quantity' => $point['purchases'] ?? $point['quantity'] ?? 1,
            ];
        }

        $normalized = normalizeMarketActivityHistory($rows);
        if ($targetName !== '' && strcasecmp($entryName, $targetName) === 0) {
            return $normalized;
        }

        if ($targetName === '' && $normalized) {
            $matchedRows = $normalized;
        }

        $searchFrom = $keyPos + 1;
    }

    if ($matchedRows) {
        return $matchedRows;
    }

    if (!preg_match_all(
        '/"time"\s*:\s*(\d+)\s*,\s*"price_median"\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*"purchases"\s*:\s*(\d+)/',
        $decoded,
        $matches,
        PREG_SET_ORDER
    )) {
        return [];
    }

    $rows = [];
    foreach ($matches as $match) {
        $rows[] = [
            'time' => (int)$match[1],
            'price' => (float)$match[2],
            'quantity' => (int)$match[3],
        ];
    }

    return normalizeMarketActivityHistory($rows);
}

function sampleMarketActivityHistory(array $history, int $maxPoints): array
{
    $history = array_values($history);
    $count = count($history);
    if ($maxPoints <= 0 || $count <= $maxPoints) {
        return $history;
    }

    $sampled = [];
    for ($index = 0; $index < $maxPoints; $index += 1) {
        $position = (int)round(($index / max(1, $maxPoints - 1)) * ($count - 1));
        $sampled[] = $history[$position];
    }

    return $sampled;
}

function marketActivityHistoryForRange(array $history, int $days, int $maxPoints): array
{
    if (!$history) {
        return [];
    }

    $filtered = $history;
    if ($days > 0) {
        $cutoff = (new DateTimeImmutable('today', new DateTimeZone('UTC')))
            ->sub(new DateInterval('P' . $days . 'D'))
            ->format('Y-m-d');
        $filtered = array_values(array_filter($history, static fn (array $point): bool => (string)($point['date'] ?? '') >= $cutoff));
    }

    if (count($filtered) < 2) {
        $filtered = $history;
    }

    return sampleMarketActivityHistory($filtered, $maxPoints);
}

function loadMarketActivityHistoryFromRoiDb(string $marketHashName): array
{
    try {
        $pdo = marketDataPdoConnection();
        if (!dbTableExists($pdo, 'roi_prices')) {
            return [];
        }

        $stmt = $pdo->prepare(
            "SELECT price_history
             FROM roi_prices
             WHERE market_hash_name = ?
               AND source = 'steam'"
        );
        $stmt->execute([$marketHashName]);
        $raw = $stmt->fetchColumn();
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        return is_array($decoded) ? normalizeMarketActivityHistory($decoded) : [];
    } catch (Throwable) {
        return [];
    }
}

function loadMarketActivityHistoryFromPriceDb(string $marketHashName): array
{
    try {
        $pdo = marketHistoryPdoConnection();
        if (!dbTableExists($pdo, 'items') || !dbTableExists($pdo, 'price_history')) {
            return [];
        }
        if (!dbColumnExists($pdo, 'price_history', 'source')) {
            return [];
        }

        $stmt = $pdo->prepare(
            "SELECT ph.recorded_at, ph.price, ph.volume
             FROM price_history ph
             INNER JOIN items i ON i.id = ph.item_id
             WHERE i.market_hash_name = ?
               AND LOWER(ph.source) IN ('steam', 'steam market')
             ORDER BY ph.recorded_at ASC"
        );
        $stmt->execute([$marketHashName]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return is_array($rows) ? normalizeMarketActivityHistory($rows) : [];
    } catch (Throwable) {
        return [];
    }
}

function loadRealMarketActivityHistory(string $marketHashName): array
{
    $roiHistory = loadMarketActivityHistoryFromRoiDb($marketHashName);
    $priceHistory = loadMarketActivityHistoryFromPriceDb($marketHashName);
    $merged = marketActivityMergeHistorySources($roiHistory, $priceHistory);
    if (count($merged) >= 2) {
        return $merged;
    }
    if (count($roiHistory) >= 2) {
        return $roiHistory;
    }
    return count($priceHistory) >= 2 ? $priceHistory : [];
}

function marketStatusLabel(?int $sellOrderCount, ?float $suggestedPrice, ?float $startingPrice): string
{
    if ($sellOrderCount !== null && $sellOrderCount >= 10000) {
        return 'OVERSTOCK';
    }

    if ($suggestedPrice !== null && $startingPrice !== null && $startingPrice > $suggestedPrice * 1.06) {
        return 'LIMITED';
    }

    if ($sellOrderCount !== null && $sellOrderCount >= 1000) {
        return 'ACTIVE';
    }

    return 'BALANCED';
}

function formatMarketAddedDate(string $dateYmd): string
{
    $date = DateTimeImmutable::createFromFormat('Y-m-d', $dateYmd, new DateTimeZone('UTC'));
    if (!$date) {
        return $dateYmd;
    }

    return $date->format('j F Y');
}

function deriveFirstMarketListing(array $history): ?array
{
    if (!$history) {
        return null;
    }

    $first = $history[0];
    $date = trim((string)($first['date'] ?? ''));
    if ($date === '') {
        return null;
    }

    return [
        'first_listed_at' => $date,
        'first_listed_display' => formatMarketAddedDate($date),
    ];
}

if (!defined('STEAM_MARKET_HISTORY_LIB_ONLY')) {
try {
    $marketHashName = trim((string)($_GET['market_hash_name'] ?? ''));
    $appId = isset($_GET['app_id']) ? max(1, (int)$_GET['app_id']) : 730;

    if ($marketHashName === '') {
        throw new RuntimeException('Missing Steam market hash name.');
    }

    $cachedPayload = loadMarketActivityCache($marketHashName, $appId);
    if (is_array($cachedPayload) && (int)($cachedPayload['history_schema'] ?? 0) >= 14) {
        $cachedByRange = is_array($cachedPayload['sales_history_by_range'] ?? null)
            ? $cachedPayload['sales_history_by_range']
            : [];
        $cachedAll = is_array($cachedByRange['all'] ?? null)
            ? $cachedByRange['all']
            : (is_array($cachedPayload['sales_history'] ?? null) ? $cachedPayload['sales_history'] : []);
        // Short listing-page extracts (~weeks) are not lifetime Max charts — refresh.
        // Also skip mtime-fresh caches whose last bar is still last year (Dec cutoff).
        if (count($cachedAll) >= 180 && marketActivityHistoryIsCurrent($cachedAll, 2)) {
            $cachedPayload['cached'] = true;
            respondJson($cachedPayload);
        }
    }

    $priceOverview = steamFetchPriceOverview($marketHashName, $appId);
    $listingHtml = steamFetchMarketListingHtml($marketHashName, $appId);
    $sellOrders = extractCompactOrderPairs($listingHtml, 'rgCompactSellOrders');

    $suggestedPrice = priceToFloat($priceOverview['median_price'] ?? $priceOverview['lowest_price'] ?? null);
    $startingPrice = $sellOrders[0]['price'] ?? priceToFloat($priceOverview['lowest_price'] ?? null) ?? $suggestedPrice;
    $sellOrderCount = extractEscapedInteger($listingHtml, 'cSellOrders');
    $steamPageHistory = marketActivityMergeHistorySources(
        extractSteamMarketPriceHistoryFromListingHtml($listingHtml, $marketHashName),
        extractSteamLine1HistoryFromHtml($listingHtml)
    );
    // The app id must reach the pricehistory call too: a TF2 name (app 440,
    // the TF2 item page) asked against 730 returns nothing.
    $apiHistory = steamFetchPriceHistoryApi($marketHashName, $appId);
    $dbHistory = $appId === 730 ? loadRealMarketActivityHistory($marketHashName) : [];
    $priorCache = loadMarketActivityCacheAnyAge($marketHashName, $appId);
    $priorAll = [];
    if (is_array($priorCache)) {
        $priorByRange = is_array($priorCache['sales_history_by_range'] ?? null) ? $priorCache['sales_history_by_range'] : [];
        $priorAll = is_array($priorByRange['all'] ?? null)
            ? $priorByRange['all']
            : (is_array($priorCache['sales_history'] ?? null) ? $priorCache['sales_history'] : []);
    }
    $realHistory = marketActivityMergeHistorySources($priorAll, $dbHistory, $steamPageHistory, $apiHistory);
    if (count($realHistory) >= 2) {
        $salesHistoryByRange = [
            '1m'  => marketActivityHistoryForRange($realHistory, 30, 120),
            '6m'  => marketActivityHistoryForRange($realHistory, 180, 240),
            '1y'  => marketActivityHistoryForRange($realHistory, 365, 365),
            'all' => marketActivityHistoryForRange($realHistory, 0, 3500),
        ];
        $salesHistory = count($salesHistoryByRange['1m']) >= 2
            ? $salesHistoryByRange['1m']
            : $salesHistoryByRange['all'];
        $historySource = count($apiHistory) >= 2
            ? 'steam_pricehistory_api'
            : (count($dbHistory) >= 2
                ? 'sql'
                : (count($steamPageHistory) >= 2 ? 'steam_pricehistory' : 'sql'));
    } else {
        $salesHistory = [];
        $salesHistoryByRange = [
            '1m'  => [],
            '6m'  => [],
            '1y'  => [],
            'all' => [],
        ];
        $historySource = 'unavailable';
    }
    $latestSales = buildLatestSalesRows($salesHistoryByRange['all'] ?: $salesHistory);
    $volumeValue = preg_replace('/[^\d]/', '', (string)($priceOverview['volume'] ?? ''));
    $firstListing = deriveFirstMarketListing($realHistory);

    $payload = [
        'success' => true,
        'market_hash_name' => $marketHashName,
        'app_id' => $appId,
        'steam_url' => steamMarketListingUrl($marketHashName, $appId),
        'summary' => [
            'suggested_price' => $suggestedPrice,
            'suggested_price_display' => formatEuroPrice($suggestedPrice),
            'starting_price' => $startingPrice,
            'starting_price_display' => formatEuroPrice($startingPrice),
            'volume_display' => (string)($priceOverview['volume'] ?? '—'),
            'recent_sales_count' => $volumeValue !== null && $volumeValue !== '' ? (int)$volumeValue : null,
            'sell_order_count' => $sellOrderCount,
            'sell_order_count_display' => $sellOrderCount !== null ? number_format($sellOrderCount) : '—',
            'status_label' => marketStatusLabel($sellOrderCount, $suggestedPrice, $startingPrice),
            'first_listed_at' => $firstListing['first_listed_at'] ?? null,
            'first_listed_display' => $firstListing['first_listed_display'] ?? null,
        ],
        'sales_history' => $salesHistory,
        'sales_history_by_range' => $salesHistoryByRange,
        'latest_sales' => $latestSales,
        'history_source' => $historySource,
        'history_schema' => 14,
        'history_point_count' => count($salesHistoryByRange['all'] ?? []),
    ];

    if ($historySource !== 'unavailable') {
        saveMarketActivityCache($marketHashName, $appId, $payload);
        persistSteamHistoryToRoiCache($marketHashName, $salesHistoryByRange['all'] ?? $realHistory);
    }
    respondJson($payload);
} catch (Throwable $exception) {
    respondJson([
        'success' => false,
        'error' => $exception->getMessage(),
    ], 500);
}
}
