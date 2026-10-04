<?php
declare(strict_types=1);

/**
 * Shared cache-aside helpers for marketplace prices.
 *
 * Flow: sync scripts fetch Steam / providers → roi_prices (DB) → file cache → site.
 * Web reads prefer DB + file cache; live APIs only when prefer_live / allow_live_refresh.
 */

require_once __DIR__ . '/roi_prices_db.php';

const PRICE_CACHE_DEFAULT_HOURS = 24;
const PRICE_CACHE_FILE_TTL_SECONDS = 86400;

function priceCacheMaxAgeHours(array $payload): int
{
    // 0 = treat every cached row as stale (force live refresh when allowed).
    if (isset($payload['max_cache_age_hours'])) {
        return max(0, (int)$payload['max_cache_age_hours']);
    }
    if (isset($payload['db_cache_hours'])) {
        return max(0, (int)$payload['db_cache_hours']);
    }
    return PRICE_CACHE_DEFAULT_HOURS;
}

function priceCacheAllowLive(array $payload): bool
{
    if (!empty($payload['cache_only']) || !empty($payload['db_only']) || !empty($payload['offline_cache_only'])) {
        return false;
    }
    return !empty($payload['prefer_live'])
        || !empty($payload['fresh'])
        || !empty($payload['ignore_cache'])
        || !empty($payload['allow_live_refresh']);
}

function priceCacheRowTimestamp(array $row): int
{
    $updatedAt = $row['updated_at'] ?? null;
    if ($updatedAt === null) {
        return 0;
    }
    if (is_int($updatedAt)) {
        return $updatedAt;
    }
    $ts = strtotime((string)$updatedAt);
    return $ts === false ? 0 : $ts;
}

function priceCacheRowIsFresh(array $row, int $maxAgeSeconds): bool
{
    if ($maxAgeSeconds <= 0) {
        return false;
    }
    $ts = priceCacheRowTimestamp($row);
    if ($ts <= 0) {
        return false;
    }
    return (time() - $ts) <= $maxAgeSeconds;
}

/** @return array<string, array<string, mixed>> keyed by market_hash_name */
function priceCacheLoadRoiBatch(
    PDO $pdo,
    array $names,
    string $source,
    bool $freshOnly,
    int $maxAgeSeconds
): array {
    $names = array_values(array_filter(array_map('strval', $names), static fn (string $n) => $n !== ''));
    if (!$names) {
        return [];
    }

    roiPricesEnsureTable($pdo);
    $placeholders = implode(',', array_fill(0, count($names), '?'));
    $stmt = $pdo->prepare(
        "SELECT market_hash_name, source, current_price, sell_orders, buy_orders, price_history, market_url, updated_at
         FROM roi_prices
         WHERE market_hash_name IN ({$placeholders}) AND source = ?"
    );
    $stmt->execute(array_merge($names, [$source]));

    $rows = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        if ($freshOnly && !priceCacheRowIsFresh($row, $maxAgeSeconds)) {
            continue;
        }
        $price = isset($row['current_price']) ? (float)$row['current_price'] : 0.0;
        if ($price <= 0) {
            continue;
        }
        $rows[(string)$row['market_hash_name']] = $row;
    }

    return $rows;
}

/**
 * @param list<string> $sources
 * @return array<string, array<string, array<string, mixed>>>
 */
function priceCacheLoadFreshBySource(PDO $pdo, array $sources, int $limitPerSource, int $maxAgeHours): array
{
    roiPricesEnsureTable($pdo);
    $out = [];
    $limitPerSource = max(1, min(5000, $limitPerSource));
    $maxAgeHours = max(1, $maxAgeHours);

    foreach ($sources as $source) {
        $source = strtolower(trim((string)$source));
        if ($source === '') {
            continue;
        }
        $stmt = $pdo->prepare(
            "SELECT market_hash_name, source, current_price, sell_orders, buy_orders, price_history, market_url, updated_at
             FROM roi_prices
             WHERE source = ? AND current_price > 0
               AND updated_at >= now() - (? * interval '1 hour')
             ORDER BY updated_at DESC
             LIMIT ?"
        );
        $stmt->execute([$source, $maxAgeHours, $limitPerSource]);
        $bucket = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $bucket[(string)$row['market_hash_name']] = $row;
        }
        $out[$source] = $bucket;
    }

    return $out;
}

function priceCacheSyncStatePath(): string
{
    return __DIR__ . '/assets/roi-price-cache/sync_state.json';
}

function priceCacheReadSyncState(): array
{
    $path = priceCacheSyncStatePath();
    if (!is_file($path)) {
        return [];
    }
    $raw = @file_get_contents($path);
    if ($raw === false || $raw === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function priceCacheWriteSyncState(array $state): void
{
    $path = priceCacheSyncStatePath();
    $dir = dirname($path);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    file_put_contents($path, json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
}

function priceCacheTriggerBackgroundSync(int $staleHours = PRICE_CACHE_DEFAULT_HOURS, int $limit = 250): array
{
    $state = priceCacheReadSyncState();
    $lastTrigger = (int)($state['last_background_trigger'] ?? 0);
    $now = time();
    $interval = max(3600, $staleHours * 3600);

    if ($now - $lastTrigger < $interval) {
        return [
            'triggered' => false,
            'reason' => 'recent',
            'next_in_seconds' => $interval - ($now - $lastTrigger),
        ];
    }

    if (!empty($state['background_running']) && ($now - (int)($state['background_started'] ?? 0)) < 7200) {
        return ['triggered' => false, 'reason' => 'already_running'];
    }

    $php = PHP_BINARY !== '' ? PHP_BINARY : 'php';
    $script = __DIR__ . '/sync_all_market_prices.php';
    $args = sprintf('--stale-hours=%d --limit=%d --skins-only', max(1, $staleHours), max(50, min(500, $limit)));
    $cmd = sprintf('"%s" "%s" %s', $php, $script, $args);

    // Background syncs need popen/exec, which shared hosting disables. Prices
    // then come from the synced caches and the database, refreshed by the
    // sync scripts running on the developer PC.
    if (PHP_OS_FAMILY === 'Windows') {
        if (!function_exists('popen')) {
            return ['triggered' => false, 'reason' => 'process_functions_disabled'];
        }
        pclose(popen('start /B "" ' . $cmd . ' > NUL 2>&1', 'r'));
    } else {
        if (!function_exists('exec')) {
            return ['triggered' => false, 'reason' => 'process_functions_disabled'];
        }
        exec($cmd . ' > /dev/null 2>&1 &');
    }

    priceCacheWriteSyncState([
        'last_background_trigger' => $now,
        'background_started' => $now,
        'background_running' => true,
        'stale_hours' => $staleHours,
        'limit' => $limit,
    ]);

    return ['triggered' => true, 'stale_hours' => $staleHours, 'limit' => $limit];
}

function priceCacheMarkSyncComplete(): void
{
    $state = priceCacheReadSyncState();
    $state['background_running'] = false;
    $state['last_full_sync'] = time();
    priceCacheWriteSyncState($state);
}
