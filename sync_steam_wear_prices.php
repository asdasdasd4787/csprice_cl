<?php
declare(strict_types=1);
/**
 * Populate Supabase steam_analyst_prices with per-wear Steam Market prices.
 *
 * Order per wear: local file cache → catalog seed → live Steam API (if not skipped).
 * Live requests use long backoff when rate-limited.
 * Item pages also refresh FN–BS + StatTrak live via get_steam_wear_prices.php (parallel priceoverview).
 *
 * Usage:
 *   c:/xampp/php/php.exe sync_steam_wear_prices.php --skins-only --limit=50
 *   c:/xampp/php/php.exe sync_steam_wear_prices.php --skins-only --skip-live
 */

require_once __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/roi_prices_db.php';
require_once __DIR__ . '/get_roi_prices_cached.php';

if (PHP_SAPI !== 'cli') {
    header('Content-Type: text/plain; charset=utf-8');
}
set_time_limit(0);

const WEAR_LIST = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];

function wpLog(string $msg): void
{
    echo '[' . date('H:i:s') . '] ' . $msg . PHP_EOL;
    if (PHP_SAPI !== 'cli') { @flush(); }
}

function wpArgs(): array
{
    $o = getopt('', ['skins-only', 'limit::', 'offset::', 'stale-hours::', 'sleep::', 'dry-run', 'skip-live', 'live-only']);
    return [
        'skins_only'  => isset($o['skins-only']),
        'limit'       => max(0, (int)($o['limit']       ?? 0)),
        'offset'      => max(0, (int)($o['offset']      ?? 0)),
        'stale_hours' => max(0, (int)($o['stale-hours'] ?? 24)),
        'sleep_ms'    => max(0, (int)($o['sleep']       ?? 8000)),
        'dry_run'     => isset($o['dry-run']),
        'skip_live'   => isset($o['skip-live']),
        'live_only'   => isset($o['live-only']),
    ];
}

function wpSteamUrl(string $marketHashName): string
{
    return 'https://steamcommunity.com/market/priceoverview/?appid=730&currency=3&market_hash_name='
        . rawurlencode($marketHashName);
}

function wpParseSteamPrice(string $json): ?array
{
    $data = json_decode($json, true);
    if (!is_array($data) || empty($data['success'])) {
        return ['price' => null, 'volume' => null];
    }

    $parse = static function (string $s): ?float {
        $c = preg_replace('/[^\d.,]/', '', $s);
        if ($c === '' || $c === null) return null;
        if (preg_match('/,\d{2}$/', $c)) {
            $c = str_replace(['.', ','], ['', '.'], $c);
        } else {
            $c = str_replace(',', '', $c);
        }
        $f = (float)$c;
        return $f > 0 ? round($f, 2) : null;
    };

    // Prefer lowest_price ("Starting at") over median_price.
    $price = $parse((string)($data['lowest_price'] ?? $data['median_price'] ?? ''));
    $volume = isset($data['volume']) ? (int)preg_replace('/[^\d]/', '', (string)$data['volume']) : null;
    return ['price' => $price, 'volume' => $volume];
}

/** @return array{price?:float,volume?:int,rate_limited?:bool}|null */
function wpFetchPrice(string $marketHashName, int $timeout = 25): ?array
{
    $ch = curl_init(wpSteamUrl($marketHashName));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    ]);
    $body   = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($status === 429) {
        return ['rate_limited' => true];
    }
    if ($body === false || $status >= 400) {
        return null;
    }

    return wpParseSteamPrice((string)$body);
}

function wpLoadCatalogIndex(): array
{
    static $index = null;
    if ($index !== null) {
        return $index;
    }
    $index = [];
    $path = __DIR__ . '/assets/steam-market-cache/roi_catalog.json';
    if (!is_file($path)) {
        return $index;
    }
    $payload = json_decode((string)file_get_contents($path), true);
    foreach (is_array($payload['items'] ?? null) ? $payload['items'] : [] as $item) {
        if (!is_array($item)) {
            continue;
        }
        $mhn = trim((string)($item['market_hash_name'] ?? ''));
        if ($mhn !== '') {
            $index[$mhn] = $item;
        }
        $base = trim((string)($item['display_name'] ?? $item['name'] ?? ''));
        if ($base !== '') {
            $index['__base__' . $base] = $item;
        }
    }
    return $index;
}

function wpLocalSeedForWear(string $base, string $wear): ?array
{
    $mhn = $base . ' (' . $wear . ')';

    $cached = cachedFileLoad($mhn, 'steam', 604800);
    if (is_array($cached)) {
        $price = isset($cached['current_price']) && is_numeric($cached['current_price'])
            ? round((float)$cached['current_price'], 2) : null;
        if ($price !== null && $price > 0) {
            return [
                'price' => $price,
                'volume' => isset($cached['sell_orders']) ? (int)$cached['sell_orders'] : 0,
                'market_name' => $mhn,
                'source' => 'file_cache',
            ];
        }
    }

    $catalog = wpLoadCatalogIndex();
    if (isset($catalog[$mhn])) {
        $price = cachedSteamCatalogPriceToEur($catalog[$mhn]);
        if ($price !== null && $price > 0) {
            $listings = $catalog[$mhn]['seed_sell_listings'] ?? null;
            return [
                'price' => $price,
                'volume' => is_numeric($listings) ? (int)$listings : 0,
                'market_name' => $mhn,
                'source' => 'steam_catalog',
            ];
        }
    }

    // Catalog often only has FN — use FN seed as rough fallback for other wears when nothing else exists.
    if ($wear !== 'Factory New' && isset($catalog['__base__' . $base])) {
        $fnMhn = $base . ' (Factory New)';
        $fnItem = $catalog[$fnMhn] ?? $catalog['__base__' . $base];
        $fnPrice = cachedSteamCatalogPriceToEur($fnItem);
        if ($fnPrice !== null && $fnPrice > 0) {
            return null; // do not invent MW/FT prices from FN
        }
    }

    return null;
}

function wpSaveWear(
    PDO $pdo,
    PDOStatement $upsertStmt,
    int $itemId,
    string $wear,
    array $res
): bool {
    $price = $res['price'] ?? null;
    if ($price === null || (float)$price <= 0) {
        return false;
    }
    $mhn = (string)($res['market_name'] ?? '');
    $priceRounded = round((float)$price, 2);
    $upsertStmt->execute([
        $itemId,
        $wear,
        $priceRounded,
        isset($res['volume']) ? (int)$res['volume'] : 0,
        $mhn,
    ]);
    roiPricesUpsert($pdo, [
        'market_hash_name' => $mhn,
        'source' => 'steam',
        'current_price' => $priceRounded,
        'sell_orders' => isset($res['volume']) ? (int)$res['volume'] : null,
    ]);
    return true;
}

function wpFetchLiveWithBackoff(string $mhn, int &$consecutive429, int &$livePausedUntil): ?array
{
    if (time() < $livePausedUntil) {
        return null;
    }

    for ($attempt = 0; $attempt < 4; $attempt++) {
        $res = wpFetchPrice($mhn);
        if (is_array($res) && !empty($res['rate_limited'])) {
            $consecutive429++;
            $wait = min(300, 45 * (2 ** $attempt));
            wpLog("RATE LIMITED on '{$mhn}' — sleeping {$wait}s (attempt " . ($attempt + 1) . '/4)');
            sleep($wait);
            if ($consecutive429 >= 6) {
                $livePausedUntil = time() + 600;
                $consecutive429 = 0;
                wpLog('Too many rate limits — pausing live Steam for 10 minutes (local seed still works).');
                return null;
            }
            continue;
        }
        $consecutive429 = 0;
        if ($res === null) {
            return null;
        }
        $price = $res['price'] ?? null;
        if ($price === null || $price <= 0) {
            return ['price' => null, 'volume' => $res['volume'] ?? null, 'market_name' => $mhn, 'source' => 'priceoverview'];
        }
        return [
            'price' => $price,
            'volume' => $res['volume'] ?? 0,
            'market_name' => $mhn,
            'source' => 'priceoverview',
        ];
    }

    return null;
}

// ── Build base-item list from catalog ────────────────────────────────────────
$args = wpArgs();
wpLog('Steam wear sync starting (skins_only=' . ($args['skins_only'] ? 'yes' : 'no')
    . ', sleep=' . $args['sleep_ms'] . 'ms, skip_live=' . ($args['skip_live'] ? 'yes' : 'no') . ')');

$catalogPath = __DIR__ . '/assets/steam-market-cache/roi_catalog.json';
if (!is_file($catalogPath)) { wpLog('ERROR: roi_catalog.json missing.'); exit(1); }
$catalog = json_decode((string)file_get_contents($catalogPath), true);
$items = is_array($catalog['items'] ?? null) ? $catalog['items'] : [];

$skinFilters = ['rifles', 'pistols', 'smgs', 'heavy', 'shotguns', 'knives', 'gloves'];
$bases = [];
foreach ($items as $it) {
    if ($args['skins_only']) {
        $sub = strtolower((string)($it['sub_filter'] ?? $it['category'] ?? ''));
        if (!in_array($sub, $skinFilters, true)) continue;
    }
    $base = trim((string)($it['display_name'] ?? $it['name'] ?? ''));
    if ($base === '') {
        $mhn = (string)($it['market_hash_name'] ?? '');
        if (preg_match('/^(.*)\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i', $mhn, $m)) {
            $base = trim($m[1]);
        }
    }
    if ($base === '') continue;
    $bases[$base] = true;
}
$baseNames = array_keys($bases);
sort($baseNames);
wpLog('Base skins in catalog: ' . count($baseNames));

if ($args['offset'] > 0) $baseNames = array_slice($baseNames, $args['offset']);
if ($args['limit']  > 0) $baseNames = array_slice($baseNames, 0, $args['limit']);
wpLog('Base skins this run: ' . count($baseNames));
if (!$baseNames) { wpLog('Nothing to do.'); exit(0); }

if ($args['dry_run']) {
    foreach (array_slice($baseNames, 0, 10) as $b) {
        wpLog('  ' . $b . ' -> ' . implode(', ', WEAR_LIST));
    }
    exit(0);
}

try {
    $pdo = marketDataPdoConnection();
} catch (Throwable $e) {
    wpLog('ERROR connecting to Supabase: ' . $e->getMessage());
    exit(1);
}

$resolveStmt = $pdo->prepare('SELECT id FROM items WHERE name = ? ORDER BY id ASC LIMIT 1');
$freshStmt   = $pdo->prepare(
    'SELECT 1 FROM steam_analyst_prices WHERE item_id = ? AND updated_at >= now() - (? * interval \'1 hour\') LIMIT 1'
);
$upsertStmt  = $pdo->prepare(<<<'SQL'
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

$totalBases = count($baseNames);
$doneBases = 0;
$saved = 0;
$seeded = 0;
$noListing = 0;
$unresolved = 0;
$reqs = 0;
$consecutive429 = 0;
$livePausedUntil = 0;
$start = microtime(true);

foreach ($baseNames as $base) {
    $doneBases++;

    $resolveStmt->execute([$base]);
    $itemId = $resolveStmt->fetchColumn();
    if ($itemId === false) { $unresolved++; continue; }
    $itemId = (int)$itemId;

    if ($args['stale_hours'] > 0) {
        $freshStmt->execute([$itemId, $args['stale_hours']]);
        if ($freshStmt->fetchColumn() !== false) continue;
    }

    foreach (WEAR_LIST as $wear) {
        $mhn = $base . ' (' . $wear . ')';
        $res = null;

        if (!$args['live_only']) {
            $local = wpLocalSeedForWear($base, $wear);
            if ($local !== null) {
                $res = $local;
            }
        }

        if ($res === null && !$args['skip_live']) {
            $res = wpFetchLiveWithBackoff($mhn, $consecutive429, $livePausedUntil);
            $reqs++;
        }

        if ($res === null) {
            continue;
        }

        $price = $res['price'] ?? null;
        if ($price === null || (float)$price <= 0) {
            $noListing++;
            continue;
        }

        try {
            if (wpSaveWear($pdo, $upsertStmt, $itemId, $wear, $res)) {
                $saved++;
                if (($res['source'] ?? '') !== 'priceoverview') {
                    $seeded++;
                }
            }
        } catch (Throwable $e) {
            wpLog("DB error for '{$mhn}': " . $e->getMessage());
        }

        if (!$args['skip_live'] && ($res['source'] ?? '') === 'priceoverview' && $args['sleep_ms'] > 0) {
            usleep($args['sleep_ms'] * 1000);
        }
    }

    if ($doneBases % 10 === 0 || $doneBases === $totalBases) {
        $el = round(microtime(true) - $start, 1);
        wpLog(sprintf(
            'Progress: %d/%d bases | saved=%d seeded=%d no-listing=%d unresolved=%d live-reqs=%d | %.0fs',
            $doneBases, $totalBases, $saved, $seeded, $noListing, $unresolved, $reqs, $el
        ));
    }
}

wpLog("Done — saved={$saved} seeded={$seeded} no-listing={$noListing} unresolved={$unresolved} live-requests={$reqs}");
