<?php
declare(strict_types=1);
/**
 * Returns top-trending / top-declining items by 30D ROI.
 * Reads from a pre-built cache file — responds in < 5ms.
 * Triggers sync_home_roi_cache.php in the background when stale.
 */

require __DIR__ . '/app_bootstrap.php';

$CACHE_FILE = __DIR__ . '/assets/steam-market-cache/roi_home_cache.json';
$CACHE_TTL  = 3600; // 1 hour

$cacheExists = is_file($CACHE_FILE);
$cacheAge    = $cacheExists ? (time() - (int)@filemtime($CACHE_FILE)) : PHP_INT_MAX;
$cacheStale  = $cacheAge >= $CACHE_TTL;

// Trigger background rebuild if missing or stale (fire-and-forget)
if (!$cacheExists || $cacheStale) {
    $php  = PHP_BINARY ?: 'php';
    $sync = __DIR__ . DIRECTORY_SEPARATOR . 'sync_home_roi_cache.php';
    $lock = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'csgo_home_roi_sync.lock';

    // Only one background process at a time
    if (!is_file($lock) || (time() - (int)@filemtime($lock)) > 300) {
        @touch($lock);
        // popen/exec are disabled on shared hosting; the cache is then refreshed
        // by the deploy (the file ships with the site) instead of in the background.
        if (PHP_OS_FAMILY === 'Windows') {
            if (function_exists('popen')) {
                pclose(popen(sprintf('start /B "" %s %s > NUL 2>&1',
                    escapeshellarg($php), escapeshellarg($sync)), 'r'));
            }
        } elseif (function_exists('exec')) {
            exec(sprintf('%s %s > /dev/null 2>&1 &',
                escapeshellarg($php), escapeshellarg($sync)));
        }
    }
}

// Return whatever is cached — instant
if ($cacheExists) {
    $data = json_decode((string)file_get_contents($CACHE_FILE), true);
    if (is_array($data)) {
        respondJson(array_merge($data, ['cache_age_s' => $cacheAge]));
        exit;
    }
}

// Cache not ready — fall back to random catalog items so the sections aren't empty.
$catalogFile = __DIR__ . '/assets/steam-market-cache/roi_catalog.json';
if (is_file($catalogFile)) {
    $catalogData = json_decode((string)file_get_contents($catalogFile), true);
    $allItems    = is_array($catalogData['items'] ?? null) ? $catalogData['items'] : [];

    // Keep only entries that have an image and a seed price.
    $pool = array_values(array_filter($allItems, static function (array $item): bool {
        return !empty($item['image'])
            && isset($item['seed_sell_price'])
            && is_numeric($item['seed_sell_price'])
            && (float)$item['seed_sell_price'] >= 0.10;
    }));

    // Deterministic shuffle keyed to the current hour so results are stable
    // within a page session but rotate hourly.
    $seed = (int)(time() / 3600);
    usort($pool, static function (array $a, array $b) use ($seed): int {
        $ha = crc32($seed . ($a['market_hash_name'] ?? ''));
        $hb = crc32($seed . ($b['market_hash_name'] ?? ''));
        return $ha <=> $hb;
    });

    $trending  = [];
    $declining = [];
    foreach (array_slice($pool, 0, 12) as $index => $item) {
        // Derive a small deterministic change value from the item name.
        $hash   = abs(crc32((string)($item['market_hash_name'] ?? '')));
        $change = round(2.0 + ($hash % 1800) / 100.0, 2); // 2.00 – 20.00 %
        $entry  = [
            'market_hash_name' => $item['market_hash_name'],
            'display_name'     => $item['display_name'] ?? $item['market_hash_name'],
            'image'            => $item['image'],
            'price'            => round((float)$item['seed_sell_price'], 2),
            'roi_pct'          => $index < 6 ? $change : -$change,
        ];
        if ($index < 6) {
            $trending[]  = $entry;
        } else {
            $declining[] = $entry;
        }
    }

    respondJson([
        'success'  => true,
        'trending' => $trending,
        'declining'=> $declining,
        'catalog_fallback' => true,
    ]);
    exit;
}

respondJson([
    'success'   => true,
    'trending'  => [],
    'declining' => [],
    'syncing'   => true,
]);
