<?php
declare(strict_types=1);

function csfloatHistoryCachePath(string $cacheDir, string $marketHashName): string
{
    return rtrim($cacheDir, '\\/') . '/' . md5($marketHashName) . '_history.json';
}

function csfloatFetchHistoryGraph(string $marketHashName, string $cacheDir, string $apiKey, float $usdToEur, bool $forceLive): array
{
    $marketHashName = trim($marketHashName);
    if ($marketHashName === '') {
        return [];
    }

    $historyFile = csfloatHistoryCachePath($cacheDir, $marketHashName);
    $historyTtl = 3600;

    if (!$forceLive && is_file($historyFile)) {
        $cached = json_decode((string)file_get_contents($historyFile), true);
        $fetchedAt = (int)($cached['fetched_at'] ?? 0);
        $points = is_array($cached['points'] ?? null) ? $cached['points'] : [];
        if ($fetchedAt > 0 && (time() - $fetchedAt) < $historyTtl && count($points) >= 2) {
            return $points;
        }
    }

    $url = 'https://csfloat.com/api/v1/history/' . rawurlencode($marketHashName) . '/graph';
    $headers = ['Accept: application/json'];
    if ($apiKey !== '') {
        $headers[] = 'Authorization: ' . $apiKey;
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 25,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_USERAGENT      => 'CS2MarketTracker/1.0',
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $body = (string)(curl_exec($ch) ?: '');
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        if (is_file($historyFile)) {
            $cached = json_decode((string)file_get_contents($historyFile), true);
            $points = is_array($cached['points'] ?? null) ? $cached['points'] : [];
            if (count($points) >= 2) {
                return $points;
            }
        }
        return [];
    }

    $rows = json_decode($body, true);
    if (!is_array($rows)) {
        return [];
    }

    $byDate = [];
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $day = substr((string)($row['day'] ?? ''), 0, 10);
        $avgCents = isset($row['avg_price']) ? (float)$row['avg_price'] : 0.0;
        if ($day === '' || $avgCents <= 0) {
            continue;
        }
        $priceUsd = round($avgCents / 100, 4);
        $priceEur = round($priceUsd * $usdToEur, $priceUsd < 1 ? 4 : 2);
        $byDate[$day] = [
            'date'   => $day,
            'price'  => $priceEur,
            'volume' => max(1, (int)($row['count'] ?? 1)),
        ];
    }

    if (count($byDate) < 2) {
        return [];
    }

    ksort($byDate);
    $points = array_values($byDate);

    if (!is_dir($cacheDir)) {
        mkdir($cacheDir, 0755, true);
    }

    file_put_contents($historyFile, (string)json_encode([
        'fetched_at' => time(),
        'points'     => $points,
    ], JSON_UNESCAPED_UNICODE));

    return $points;
}

function csfloatAttachHistoryToItem(array $item, array $historyPoints): array
{
    if (count($historyPoints) < 2) {
        return $item;
    }

    $item['price_history'] = $historyPoints;
    $item['sparkline'] = array_values(array_map(
        static fn(array $point): float => (float)($point['price'] ?? 0),
        array_slice($historyPoints, -30)
    ));

    return $item;
}
