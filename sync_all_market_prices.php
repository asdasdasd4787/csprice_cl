<?php
declare(strict_types=1);

/**
 * Orchestrator: fetch Steam + marketplace prices into the database (incremental, 24h default).
 *
 * Usage (CLI or background trigger):
 *   c:/xampp/php/php.exe sync_all_market_prices.php --skins-only --limit=300 --stale-hours=24
 */

require __DIR__ . '/app_bootstrap.php';
require __DIR__ . '/price_cache_service.php';

if (PHP_SAPI !== 'cli') {
    header('Content-Type: text/plain; charset=utf-8');
}
set_time_limit(0);

function syncAllLog(string $msg): void
{
    echo '[' . date('H:i:s') . '] ' . $msg . PHP_EOL;
    if (PHP_SAPI !== 'cli') {
        @flush();
    }
}

function syncAllRun(string $php, string $script, string $extraArgs): int
{
    $cmd = sprintf('"%s" "%s"%s', $php, $script, $extraArgs);
    syncAllLog('→ ' . $cmd);
    passthru($cmd, $exitCode);
    return (int)$exitCode;
}

$opts = getopt('', ['stale-hours::', 'limit::', 'offset::', 'skins-only', 'dry-run', 'skip-steam-wear', 'skip-roi', 'skip-providers']);
$staleHours = max(1, (int)($opts['stale-hours'] ?? PRICE_CACHE_DEFAULT_HOURS));
$limit = max(0, (int)($opts['limit'] ?? 0));
$offset = max(0, (int)($opts['offset'] ?? 0));
$skinsOnly = isset($opts['skins-only']) ? ' --skins-only' : '';
$dryRun = isset($opts['dry-run']) ? ' --dry-run' : '';
$limitArg = $limit > 0 ? " --limit={$limit}" : '';
$offsetArg = $offset > 0 ? " --offset={$offset}" : '';
$common = " --stale-hours={$staleHours}{$limitArg}{$offsetArg}{$skinsOnly}{$dryRun}";

$php = PHP_BINARY !== '' ? PHP_BINARY : 'php';
$base = __DIR__;

syncAllLog("All-market sync (stale-hours={$staleHours}, limit={$limit})");

// 1) Instant seed from catalog + file cache (no Steam API).
syncAllRun($php, $base . '/seed_market_prices_db.php', $common . ' --skip-analyst');

if (!isset($opts['skip-steam-wear'])) {
    syncAllRun($php, $base . '/sync_steam_wear_prices.php', $common . ' --skip-live');
}
if (!isset($opts['skip-roi'])) {
    syncAllRun($php, $base . '/sync_roi_prices.php', $common);
}
if (!isset($opts['skip-providers'])) {
    foreach (['skinport', 'dmarket'] as $source) {
        syncAllRun($php, $base . '/sync_provider_prices.php', " --source={$source}{$common}");
    }
    syncAllRun($php, $base . '/sync_market_prices.php', '');
}

priceCacheMarkSyncComplete();
syncAllLog('Done.');
