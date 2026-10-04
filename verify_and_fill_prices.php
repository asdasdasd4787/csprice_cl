<?php
declare(strict_types=1);

/**
 * Audit roi_prices for missing/zero prices and optionally backfill via APIs.
 *
 * Usage:
 *   C:\xampp\php\php.exe verify_and_fill_prices.php
 *   C:\xampp\php\php.exe verify_and_fill_prices.php --fill
 *   C:\xampp\php\php.exe verify_and_fill_prices.php --fill --skins-only --limit=200
 */

require_once __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/roi_prices_db.php';
require_once __DIR__ . '/get_roi_prices_cached.php';

if (PHP_SAPI !== 'cli') {
    header('Content-Type: text/plain; charset=utf-8');
}
set_time_limit(0);

const VFP_SOURCES = ['steam', 'skinport', 'dmarket'];

function vfpLog(string $msg): void
{
    echo '[' . date('H:i:s') . '] ' . $msg . PHP_EOL;
    if (PHP_SAPI !== 'cli') {
        @flush();
    }
}

function vfpArgs(): array
{
    $o = getopt('', ['fill', 'skins-only', 'limit::', 'offset::', 'source::', 'dry-run', 'skip-seed']);
    $source = strtolower(trim((string)($o['source'] ?? '')));
    if ($source !== '' && !in_array($source, VFP_SOURCES, true)) {
        vfpLog('ERROR: --source must be one of: ' . implode(', ', VFP_SOURCES));
        exit(1);
    }
    return [
        'fill'       => isset($o['fill']),
        'skins_only' => isset($o['skins-only']),
        'limit'      => max(0, (int)($o['limit'] ?? 0)),
        'offset'     => max(0, (int)($o['offset'] ?? 0)),
        'source'     => $source,
        'dry_run'    => isset($o['dry-run']),
        'skip_seed'  => isset($o['skip-seed']),
    ];
}

function vfpIsSkin(array $item): bool
{
    $skins = ['rifles', 'pistols', 'smgs', 'heavy', 'shotguns', 'knives', 'gloves'];
    $sub = strtolower((string)($item['sub_filter'] ?? $item['category'] ?? ''));
    return in_array($sub, $skins, true);
}

function vfpLoadCatalog(array $args): array
{
    $path = __DIR__ . '/assets/steam-market-cache/roi_catalog.json';
    if (!is_file($path)) {
        vfpLog('ERROR: roi_catalog.json missing. Run sync_roi_catalog.php first.');
        exit(1);
    }
    $payload = json_decode((string)file_get_contents($path), true);
    $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
    if ($args['skins_only']) {
        $items = array_values(array_filter($items, 'vfpIsSkin'));
    }
    if ($args['offset'] > 0) {
        $items = array_slice($items, $args['offset']);
    }
    if ($args['limit'] > 0) {
        $items = array_slice($items, 0, $args['limit']);
    }
    return $items;
}

function vfpCatalogNames(array $items): array
{
    $names = [];
    foreach ($items as $it) {
        $n = trim((string)($it['market_hash_name'] ?? ''));
        if ($n !== '') {
            $names[$n] = true;
        }
    }
    return array_keys($names);
}

/** @return array<string, array<string, true>> source => lower(name) => true */
function vfpLoadPricedNames(PDO $pdo, array $sources): array
{
    $placeholders = implode(',', array_fill(0, count($sources), '?'));
    $stmt = $pdo->prepare(
        "SELECT market_hash_name, source
         FROM roi_prices
         WHERE source IN ({$placeholders})
           AND current_price IS NOT NULL
           AND current_price > 0"
    );
    $stmt->execute($sources);
    $bySource = [];
    foreach ($sources as $s) {
        $bySource[$s] = [];
    }
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $src = (string)($row['source'] ?? '');
        $name = strtolower(trim((string)($row['market_hash_name'] ?? '')));
        if ($src !== '' && $name !== '' && isset($bySource[$src])) {
            $bySource[$src][$name] = true;
        }
    }
    return $bySource;
}

function vfpFindGaps(array $items, array $pricedBySource): array
{
    $gaps = [];
    foreach (VFP_SOURCES as $source) {
        $priced = $pricedBySource[$source] ?? [];
        $missing = [];
        foreach ($items as $it) {
            $name = trim((string)($it['market_hash_name'] ?? ''));
            if ($name === '' || isset($priced[strtolower($name)])) {
                continue;
            }
            $missing[] = $name;
        }
        $gaps[$source] = $missing;
    }
    return $gaps;
}

function vfpGapStats(array $items, array $missingNames): array
{
    $missingSet = array_fill_keys($missingNames, true);
    $skins = ['rifles', 'pistols', 'smgs', 'heavy', 'shotguns', 'knives', 'gloves'];
    $stats = ['total' => count($missingNames), 'skins' => 0, 'with_seed' => 0];
    foreach ($items as $it) {
        $name = trim((string)($it['market_hash_name'] ?? ''));
        if ($name === '' || !isset($missingSet[$name])) {
            continue;
        }
        $sub = strtolower((string)($it['sub_filter'] ?? $it['category'] ?? ''));
        if (in_array($sub, $skins, true)) {
            $stats['skins']++;
        }
        if (isset($it['seed_sell_price']) && (float)$it['seed_sell_price'] > 0) {
            $stats['with_seed']++;
        }
    }
    return $stats;
}

function vfpReportGaps(array $items, array $catalogNames, array $gaps): void
{
    vfpLog('Catalog items: ' . count($catalogNames));
    foreach (VFP_SOURCES as $source) {
        $missing = $gaps[$source] ?? [];
        $have = count($catalogNames) - count($missing);
        $pct = count($catalogNames) > 0
            ? round(100 * $have / count($catalogNames), 1)
            : 0.0;
        $stats = vfpGapStats($items, $missing);
        vfpLog(sprintf(
            '  %-9s priced: %d / %d (%.1f%%) — missing: %d (skins: %d, had catalog seed: %d)',
            $source . ':',
            $have,
            count($catalogNames),
            $pct,
            $stats['total'],
            $stats['skins'],
            $stats['with_seed']
        ));
        foreach (array_slice($missing, 0, 5) as $name) {
            vfpLog('    · ' . $name);
        }
        if (count($missing) > 5) {
            vfpLog('    … and ' . (count($missing) - 5) . ' more');
        }
    }
}

function vfpRunSeed(array $args): void
{
    $php = PHP_BINARY !== '' ? PHP_BINARY : 'php';
    $cmd = sprintf('"%s" "%s"', $php, __DIR__ . '/seed_market_prices_db.php');
    if ($args['skins_only']) {
        $cmd .= ' --skins-only';
    }
    if ($args['limit'] > 0) {
        $cmd .= ' --limit=' . $args['limit'];
    }
    if ($args['offset'] > 0) {
        $cmd .= ' --offset=' . $args['offset'];
    }
    vfpLog('Seeding from catalog + file cache…');
    vfpLog('→ ' . $cmd);
    passthru($cmd, $code);
    if ($code !== 0) {
        vfpLog('WARN: seed exited with code ' . $code);
    }
}

function vfpUpsertSnapshot(PDO $pdo, string $source, string $name, array $snap): bool
{
    $price = $snap['current_price'] ?? null;
    if (!is_numeric($price) || (float)$price <= 0) {
        return false;
    }
    roiPricesUpsert($pdo, [
        'market_hash_name' => $name,
        'source'           => $source,
        'current_price'    => (float)$price,
        'sell_orders'      => $snap['sell_orders'] ?? null,
        'buy_orders'       => $snap['buy_orders'] ?? null,
        'price_history'    => $snap['price_history'] ?? null,
        'market_url'       => $snap['market_url'] ?? null,
    ]);
    return true;
}

function vfpFillSteam(PDO $pdo, array $names, bool $dryRun): array
{
    if (!$names) {
        return ['saved' => 0, 'failed' => 0];
    }
    $saved = 0;
    $failed = 0;
    $batches = array_chunk($names, 4);
    vfpLog('Filling ' . count($names) . ' Steam gaps via priceoverview API…');

    foreach ($batches as $i => $batch) {
        if ($i > 0) {
            usleep(3_000_000);
        }
        $snaps = cachedLiveFetchSteam($batch, listingFallbackLimit: 2);
        foreach ($batch as $name) {
            $snap = $snaps[$name] ?? null;
            if (!is_array($snap) || empty($snap['current_price'])) {
                $failed++;
                continue;
            }
            if ($dryRun) {
                vfpLog('[DRY RUN] steam ' . $name . ' → €' . $snap['current_price']);
                $saved++;
                continue;
            }
            if (vfpUpsertSnapshot($pdo, 'steam', $name, $snap)) {
                $saved++;
            } else {
                $failed++;
            }
        }
        vfpLog('  Steam batch ' . ($i + 1) . '/' . count($batches) . ' — saved so far: ' . $saved);
    }
    return ['saved' => $saved, 'failed' => $failed];
}

function vfpFillSkinport(PDO $pdo, array $names, bool $dryRun): array
{
    if (!$names) {
        return ['saved' => 0, 'failed' => 0];
    }
    $saved = 0;
    $failed = 0;
    $batches = array_chunk($names, 25);
    vfpLog('Filling ' . count($names) . ' Skinport gaps via API…');

    foreach ($batches as $i => $batch) {
        if ($i > 0) {
            usleep(1_500_000);
        }
        $snaps = cachedLiveFetchSkinport($batch);
        foreach ($batch as $name) {
            $snap = $snaps[$name] ?? null;
            if (!is_array($snap) || empty($snap['current_price'])) {
                $failed++;
                continue;
            }
            if ($dryRun) {
                vfpLog('[DRY RUN] skinport ' . $name . ' → €' . $snap['current_price']);
                $saved++;
                continue;
            }
            if (vfpUpsertSnapshot($pdo, 'skinport', $name, $snap)) {
                $saved++;
            } else {
                $failed++;
            }
        }
        vfpLog('  Skinport batch ' . ($i + 1) . '/' . count($batches) . ' — saved so far: ' . $saved);
    }
    return ['saved' => $saved, 'failed' => $failed];
}

function vfpFillDmarket(PDO $pdo, array $names, bool $dryRun): array
{
    if (!$names) {
        return ['saved' => 0, 'failed' => 0];
    }
    $php = PHP_BINARY !== '' ? PHP_BINARY : 'php';
    $cmd = sprintf(
        '"%s" "%s" --source=dmarket --stale-hours=0 --limit=%d',
        $php,
        __DIR__ . '/sync_provider_prices.php',
        max(1, count($names))
    );
    if ($dryRun) {
        vfpLog('[DRY RUN] would run: ' . $cmd);
        return ['saved' => 0, 'failed' => count($names)];
    }
    vfpLog('Filling DMarket gaps via sync_provider_prices.php (bulk)…');
    vfpLog('→ ' . $cmd);
    passthru($cmd, $code);
    return ['saved' => $code === 0 ? count($names) : 0, 'failed' => $code === 0 ? 0 : count($names)];
}

// ── Main ─────────────────────────────────────────────────────────────────────

$args = vfpArgs();
$items = vfpLoadCatalog($args);
$catalogNames = vfpCatalogNames($items);

if (!$catalogNames) {
    vfpLog('ERROR: No catalog names to check.');
    exit(1);
}

vfpLog('Connecting to market data DB…');
try {
    $pdo = marketDataPdoConnection();
    roiPricesEnsureTable($pdo);
} catch (Throwable $e) {
    vfpLog('ERROR: ' . $e->getMessage());
    exit(1);
}

$sources = $args['source'] !== '' ? [$args['source']] : VFP_SOURCES;
$pricedBySource = vfpLoadPricedNames($pdo, VFP_SOURCES);
$gaps = vfpFindGaps($items, $pricedBySource);

vfpLog('=== Price gap audit ===');
vfpReportGaps($items, $catalogNames, $gaps);

$totalGaps = 0;
foreach ($sources as $source) {
    $totalGaps += count($gaps[$source] ?? []);
}

if (!$args['fill']) {
    if ($totalGaps > 0) {
        vfpLog('Run with --fill to backfill missing prices via API.');
    } else {
        vfpLog('All catalog items have prices for every source.');
    }
    exit(0);
}

if ($totalGaps === 0) {
    vfpLog('Nothing to fill.');
    exit(0);
}

if (!$args['skip_seed']) {
    vfpRunSeed($args);
    $pricedBySource = vfpLoadPricedNames($pdo, VFP_SOURCES);
    $gaps = vfpFindGaps($items, $pricedBySource);
    vfpLog('=== After seed ===');
    vfpReportGaps($items, $catalogNames, $gaps);
}

$totals = ['saved' => 0, 'failed' => 0];

foreach ($sources as $source) {
    $missing = $gaps[$source] ?? [];
    if (!$missing) {
        continue;
    }
    $result = match ($source) {
        'steam'    => vfpFillSteam($pdo, $missing, $args['dry_run']),
        'skinport' => vfpFillSkinport($pdo, $missing, $args['dry_run']),
        'dmarket'  => vfpFillDmarket($pdo, $missing, $args['dry_run']),
        default    => ['saved' => 0, 'failed' => 0],
    };
    $totals['saved'] += $result['saved'];
    $totals['failed'] += $result['failed'];
}

$pricedBySource = vfpLoadPricedNames($pdo, VFP_SOURCES);
$gaps = vfpFindGaps($items, $pricedBySource);

vfpLog('=== Final audit ===');
vfpReportGaps($items, $catalogNames, $gaps);
vfpLog(sprintf('Fill complete — saved: %d, failed/no-listing: %d', $totals['saved'], $totals['failed']));
