<?php
declare(strict_types=1);

/**
 * Seed roi_prices (+ steam_analyst_prices for wears) from local catalog and file
 * cache — no live Steam API calls. Run this first so the site has data immediately.
 *
 * Usage:
 *   C:\xampp\php\php.exe seed_market_prices_db.php
 *   C:\xampp\php\php.exe seed_market_prices_db.php --skins-only --limit=500
 */

require_once __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/roi_prices_db.php';
require_once __DIR__ . '/get_roi_prices_cached.php';

if (PHP_SAPI !== 'cli') {
    header('Content-Type: text/plain; charset=utf-8');
}
set_time_limit(0);

const SEED_WEAR_LIST = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];

function seedLog(string $msg): void
{
    echo '[' . date('H:i:s') . '] ' . $msg . PHP_EOL;
    if (PHP_SAPI !== 'cli') {
        @flush();
    }
}

function seedArgs(): array
{
    $o = getopt('', ['skins-only', 'limit::', 'offset::', 'dry-run', 'skip-file-cache', 'skip-analyst']);
    return [
        'skins_only'      => isset($o['skins-only']),
        'limit'           => max(0, (int)($o['limit'] ?? 0)),
        'offset'          => max(0, (int)($o['offset'] ?? 0)),
        'dry_run'         => isset($o['dry-run']),
        'skip_file_cache' => isset($o['skip-file-cache']),
        'skip_analyst'    => isset($o['skip-analyst']),
    ];
}

function seedIsSkin(array $item): bool
{
    $skins = ['rifles', 'pistols', 'smgs', 'heavy', 'shotguns', 'knives', 'gloves'];
    $sub = strtolower((string)($item['sub_filter'] ?? $item['category'] ?? ''));
    return in_array($sub, $skins, true);
}

function seedParseWearFromName(string $name): ?string
{
    if (preg_match('/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/u', $name, $m)) {
        return $m[1];
    }
    return null;
}

function seedBaseFromName(string $name): string
{
    if (preg_match('/^(.*)\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/u', $name, $m)) {
        return trim($m[1]);
    }
    return trim($name);
}

function seedUpsertRoi(PDO $pdo, string $source, string $mhn, float $price, ?int $sellOrders = null): bool
{
    if ($price <= 0) {
        return false;
    }
    roiPricesUpsert($pdo, [
        'market_hash_name' => $mhn,
        'source'           => $source,
        'current_price'    => $price,
        'sell_orders'      => $sellOrders,
    ]);
    return true;
}

function seedUpsertAnalyst(PDO $pdo, PDOStatement $upsertStmt, PDOStatement $resolveStmt, string $mhn, string $wear, float $price, ?int $volume): bool
{
    $base = seedBaseFromName($mhn);
    if ($base === '') {
        return false;
    }
    $resolveStmt->execute([$base]);
    $itemId = $resolveStmt->fetchColumn();
    if ($itemId === false) {
        return false;
    }
    $upsertStmt->execute([(int)$itemId, $wear, round($price, 2), $volume ?? 0, $mhn]);
    return true;
}

$args = seedArgs();
seedLog('Seeding market prices from catalog + file cache (no live API)');

$catalogPath = __DIR__ . '/assets/steam-market-cache/roi_catalog.json';
if (!is_file($catalogPath)) {
    seedLog('ERROR: roi_catalog.json missing.');
    exit(1);
}

$payload = json_decode((string)file_get_contents($catalogPath), true);
$items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
if ($args['skins_only']) {
    $items = array_values(array_filter($items, 'seedIsSkin'));
}
if ($args['offset'] > 0) {
    $items = array_slice($items, $args['offset']);
}
if ($args['limit'] > 0) {
    $items = array_slice($items, 0, $args['limit']);
}
seedLog('Catalog items to seed: ' . count($items));

if ($args['dry_run']) {
    seedLog('[DRY RUN] First 5:');
    foreach (array_slice($items, 0, 5) as $it) {
        seedLog('  ' . ($it['market_hash_name'] ?? '') . ' => ' . ($it['seed_sell_price'] ?? 'n/a'));
    }
    exit(0);
}

try {
    $pdo = marketDataPdoConnection();
    roiPricesEnsureTable($pdo);
} catch (Throwable $e) {
    seedLog('ERROR connecting to DB: ' . $e->getMessage());
    exit(1);
}

$resolveStmt = $pdo->prepare('SELECT id FROM items WHERE name = ? ORDER BY id ASC LIMIT 1');
$analystStmt = $pdo->prepare(<<<'SQL'
    INSERT INTO steam_analyst_prices
        (item_id, wear, price, volume, market_name, recorded_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, now(), now(), now())
    ON CONFLICT (item_id, wear) DO UPDATE SET
        price       = EXCLUDED.price,
        volume      = EXCLUDED.volume,
        market_name = EXCLUDED.market_name,
        recorded_at = EXCLUDED.recorded_at,
        updated_at  = now()
SQL);

$catalogSteam = 0;
$catalogAnalyst = 0;

foreach ($items as $item) {
    if (!is_array($item)) {
        continue;
    }
    $mhn = trim((string)($item['market_hash_name'] ?? ''));
    if ($mhn === '') {
        continue;
    }

    $price = cachedSteamCatalogPriceToEur($item);
    if ($price === null || $price <= 0) {
        continue;
    }

    $listings = $item['seed_sell_listings'] ?? $item['sell_listings'] ?? null;
    $sell = is_numeric($listings) ? (int)$listings : null;

    if (seedUpsertRoi($pdo, 'steam', $mhn, $price, $sell)) {
        $catalogSteam++;
    }

    if (!$args['skip_analyst']) {
        $wear = seedParseWearFromName($mhn) ?: trim((string)($item['selected_wear'] ?? ''));
        if ($wear !== '' && in_array($wear, SEED_WEAR_LIST, true)) {
            if (seedUpsertAnalyst($pdo, $analystStmt, $resolveStmt, $mhn, $wear, $price, $sell)) {
                $catalogAnalyst++;
            }
        }
    }
}

$fileSteam = 0;
$fileSkinport = 0;

if (!$args['skip_file_cache']) {
    $cacheDir = __DIR__ . '/assets/roi-price-cache';
    if (is_dir($cacheDir)) {
        foreach (glob($cacheDir . '/*.json') ?: [] as $path) {
            $basename = basename($path);
            if (!preg_match('/^(steam|skinport)_[a-f0-9]{32}\.json$/', $basename, $m)) {
                continue;
            }
            $source = $m[1];
            $raw = @file_get_contents($path);
            if ($raw === false || $raw === '') {
                continue;
            }
            $row = json_decode($raw, true);
            if (!is_array($row)) {
                continue;
            }
            $mhn = trim((string)($row['market_hash_name'] ?? ''));
            $price = isset($row['current_price']) && is_numeric($row['current_price'])
                ? (float)$row['current_price']
                : 0.0;
            if ($mhn === '' || $price <= 0) {
                continue;
            }
            $sell = isset($row['sell_orders']) && is_numeric($row['sell_orders']) ? (int)$row['sell_orders'] : null;
            if (seedUpsertRoi($pdo, $source, $mhn, $price, $sell)) {
                if ($source === 'steam') {
                    $fileSteam++;
                } else {
                    $fileSkinport++;
                }
            }
            if ($source === 'steam' && !$args['skip_analyst']) {
                $wear = seedParseWearFromName($mhn);
                if ($wear !== null) {
                    seedUpsertAnalyst($pdo, $analystStmt, $resolveStmt, $mhn, $wear, $price, $sell);
                }
            }
        }
    }
}

seedLog(sprintf(
    'Done — catalog steam=%d analyst=%d | file-cache steam=%d skinport=%d',
    $catalogSteam,
    $catalogAnalyst,
    $fileSteam,
    $fileSkinport
));
