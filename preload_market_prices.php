<?php
declare(strict_types=1);

/**
 * Bulk-read fresh marketplace prices from the database for client-side preload.
 * Used on site load so pages can render from DB-backed cache without live API calls.
 *
 * Best-effort by design: the frontend falls back to live per-item lookups, so an
 * unreachable market DB answers HTTP 200 with an empty payload instead of a 500
 * that only lands in the browser console. Details go to the PHP error log.
 */

/**
 * Always answer HTTP 200 so a missing/broken market DB cannot 500 page loads.
 *
 * @param array<string, mixed> $payload
 */
function preloadMarketPricesRespond(array $payload): never
{
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($json === false) {
        $json = '{"success":false,"error":"market_price_preload_failed","prices":[],"degraded":true}';
    }

    if (!headers_sent()) {
        http_response_code(200);
        header('Content-Type: application/json');
        header('Access-Control-Allow-Origin: *');
        header('Content-Length: ' . (string)strlen($json));
        header('Connection: close');
    }

    echo $json;
    exit;
}

try {
    require __DIR__ . '/app_bootstrap.php';
    require __DIR__ . '/price_cache_service.php';
    require_once __DIR__ . '/supabase_client.php';
} catch (Throwable $e) {
    error_log('[preload_market_prices] bootstrap failed: ' . $e->getMessage());
    preloadMarketPricesRespond([
        'success' => false,
        'error' => 'market_price_cache_unavailable',
        'prices' => [],
        'degraded' => true,
        'meta' => [
            'failures' => ['bootstrap' => $e->getMessage()],
            'loaded_at' => gmdate(DATE_ATOM),
        ],
    ]);
}

/**
 * PostgREST read of roi_prices, used when PDO cannot reach the market DB
 * (e.g. pdo_pgsql not enabled for Apache). Returns null when Supabase is unconfigured.
 *
 * @param list<string> $sources
 * @return array<string, array<string, array<string, mixed>>>|null
 */
function preloadPricesViaSupabaseRest(array $sources, int $limitPerSource, int $maxAgeHours): ?array
{
    $client = supabaseClient();
    if ($client === null) {
        return null;
    }

    $cutoff = gmdate('Y-m-d\TH:i:s\Z', time() - (max(1, $maxAgeHours) * 3600));
    $out = [];

    foreach ($sources as $source) {
        $source = strtolower(trim((string)$source));
        if ($source === '') {
            continue;
        }

        $rows = $client->select(
            'roi_prices',
            [
                'source' => 'eq.' . $source,
                'current_price' => 'gt.0',
                'updated_at' => 'gte.' . $cutoff,
                'order' => 'updated_at.desc',
            ],
            'market_hash_name,source,current_price,sell_orders,buy_orders,market_url,updated_at',
            max(1, min(5000, $limitPerSource))
        );

        $bucket = [];
        foreach ($rows as $row) {
            if (!is_array($row) || empty($row['market_hash_name'])) {
                continue;
            }
            unset($row['price_history']);
            $bucket[(string)$row['market_hash_name']] = $row;
        }
        $out[$source] = $bucket;
    }

    return $out;
}

/**
 * @param array<string, array<string, array<string, mixed>>> $prices
 * @return array<string, array<string, array<string, mixed>>>
 */
function preloadPricesStripHistory(array $prices): array
{
    foreach ($prices as $source => $rows) {
        foreach ($rows as $name => $row) {
            if (is_array($row)) {
                unset($row['price_history']);
                $prices[$source][$name] = $row;
            }
        }
    }

    return $prices;
}

$sources = ['steam', 'skinport', 'dmarket'];
$limit = 1800;
$maxAgeHours = defined('PRICE_CACHE_DEFAULT_HOURS') ? PRICE_CACHE_DEFAULT_HOURS : 24;
$failures = [];

try {
    if (!empty($_GET['sources'])) {
        $sources = array_values(array_filter(array_map('strtolower', array_map('trim', explode(',', (string)$_GET['sources'])))));
    }

    $limit = max(100, min(4000, (int)($_GET['limit'] ?? 1800)));
    $maxAgeHours = max(1, (int)($_GET['max_age_hours'] ?? $maxAgeHours));

    $prices = null;
    $loadedVia = 'market_db';

    try {
        $pdo = marketDataPdoConnection();
        $prices = preloadPricesStripHistory(priceCacheLoadFreshBySource($pdo, $sources, $limit, $maxAgeHours));
    } catch (Throwable $dbError) {
        $failures['market_db'] = $dbError->getMessage();
        error_log('[preload_market_prices] market DB read failed: ' . $dbError->getMessage());
    }

    if ($prices === null) {
        try {
            $prices = preloadPricesViaSupabaseRest($sources, $limit, $maxAgeHours);
            if ($prices === null) {
                $failures['supabase_rest'] = 'Supabase REST credentials are not configured.';
            } else {
                $loadedVia = 'supabase_rest';
            }
        } catch (Throwable $restError) {
            $failures['supabase_rest'] = $restError->getMessage();
            error_log('[preload_market_prices] Supabase REST fallback failed: ' . $restError->getMessage());
        }
    }

    $meta = [
        'max_age_hours' => $maxAgeHours,
        'sources' => $sources,
        'loaded_at' => gmdate(DATE_ATOM),
    ];

    if ($prices === null) {
        preloadMarketPricesRespond([
            'success' => false,
            'error' => 'market_price_cache_unavailable',
            'prices' => [],
            'degraded' => true,
            'meta' => $meta + ['counts' => [], 'failures' => $failures],
        ]);
    }

    $counts = [];
    foreach ($prices as $source => $rows) {
        $counts[$source] = count($rows);
    }

    preloadMarketPricesRespond([
        'success' => true,
        'prices' => $prices,
        'meta' => $meta + [
            'counts' => $counts,
            'source' => $loadedVia,
            'failures' => $failures,
        ],
    ]);
} catch (Throwable $e) {
    error_log('[preload_market_prices] ' . $e->getMessage());
    preloadMarketPricesRespond([
        'success' => false,
        'error' => 'market_price_preload_failed',
        'prices' => [],
        'degraded' => true,
        'meta' => [
            'max_age_hours' => $maxAgeHours,
            'sources' => $sources,
            'counts' => [],
            'failures' => $failures + ['preload' => $e->getMessage()],
            'loaded_at' => gmdate(DATE_ATOM),
        ],
    ]);
}
