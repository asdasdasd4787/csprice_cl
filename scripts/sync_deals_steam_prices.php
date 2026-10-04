<?php
declare(strict_types=1);
/**
 * Steam prices for the Deals page's Steam column, fetched from THIS PC
 * (user, 2026-10-04: "update the deals prices").
 *
 * Every other Deals column is quoted live by the host. Steam is not: Steam
 * answers 429 to csprice.eu's address for every market request, so the Steam
 * column only shows what is stored in the Supabase roi_prices table, and the
 * page drops a stored Steam ask older than 14 days (STEAM_KEEP_MAX_AGE_HOURS
 * in react/deals-page.jsx). On 2026-10-04 only 1,578 of 21,320 stored Steam
 * rows were under a week old, so the column was full of stale figures and
 * dashes (SSG 08 | Blush Pour FN: last priced 2026-09-14).
 *
 * The page prices only the top 100 candidates of each category tab, so this
 * script picks exactly those (a PHP port of pickPriceCandidates(),
 * providerCandidateScore(), matchesTypeFilter() and dealWearMarketName() from
 * react/deals-page.jsx, over the same assets/steam-market-cache/
 * roi_catalog.json), prices each Factory New / plain name with Steam
 * priceoverview, and writes the result where the host reads it (roi_prices,
 * source 'steam') plus the local roi-price-cache file. Keep the port in step
 * with deals-page.jsx when its candidate rules change.
 *
 * Usage:
 *   c:/xampp/php/php.exe scripts/sync_deals_steam_prices.php
 *   c:/xampp/php/php.exe scripts/sync_deals_steam_prices.php --stale-hours=20 --sleep=3000
 *   c:/xampp/php/php.exe scripts/sync_deals_steam_prices.php --list      (print the names, no requests)
 *
 * Scheduled daily by deploy/update_deals_steam_prices.ps1 ("CSPRICE daily
 * Deals Steam prices").
 */

require_once __DIR__ . '/../app_bootstrap.php';
require_once __DIR__ . '/../roi_prices_db.php';
require_once __DIR__ . '/../get_roi_prices_cached.php';

if (PHP_SAPI !== 'cli') {
    header('Content-Type: text/plain; charset=utf-8');
}
set_time_limit(0);

const DS_TABS = ['all', 'cases', 'skins', 'stickers', 'capsules', 'agents', 'patches', 'music'];
const DS_MAX_PRICE_ITEMS = 100;
const DS_STEAM_MAX_LISTING_PRICE = 1800;
const DS_WEAPON_TYPE_FILTERS = ['pistols', 'rifles', 'smgs', 'shotguns', 'lmgs', 'knives', 'gloves'];
const DS_FRIENDLY_SUB_FILTERS = [
    'rifles' => 0, 'pistols' => 0, 'smgs' => 0, 'heavy' => 0, 'shotguns' => 0, 'knives' => 0, 'gloves' => 0,
    'agents' => 1, 'cases' => 2, 'capsules' => 3, 'stickers' => 4, 'patches' => 5, 'music' => 6,
];
const DS_WEAR_RE = '/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/iu';

function dsLog(string $msg): void
{
    echo '[' . date('H:i:s') . '] ' . $msg . PHP_EOL;
    if (PHP_SAPI !== 'cli') { @flush(); }
}

function dsArgs(): array
{
    $o = getopt('', ['stale-hours::', 'sleep::', 'limit::', 'list', 'dry-run']);
    return [
        // Daily run: anything priced in the last 20 h is left alone.
        'stale_hours' => max(0, (int)($o['stale-hours'] ?? 20)),
        // One priceoverview call per name; ~20/min stays clear of Steam's limit.
        'sleep_ms'    => max(0, (int)($o['sleep'] ?? 3000)),
        'limit'       => max(0, (int)($o['limit'] ?? 0)),
        'list'        => isset($o['list']),
        'dry_run'     => isset($o['dry-run']),
    ];
}

/** matchesTypeFilter() in react/deals-page.jsx. */
function dsMatchesTab(array $it, string $tab): bool
{
    if ($tab === 'all') {
        return true;
    }
    $category = strtolower((string)($it['category'] ?? ''));
    $sub = strtolower((string)($it['sub_filter'] ?? $it['category'] ?? ''));
    $type = strtolower((string)($it['type_filter'] ?? ''));
    $scope = strtolower((string)($it['scope_filter'] ?? ''));
    switch ($tab) {
        case 'skins':
            return in_array($category, ['skins', 'knives', 'gloves'], true) || in_array($sub, DS_WEAPON_TYPE_FILTERS, true);
        case 'cases':
            return $sub === 'cases';
        case 'capsules':
            return $sub === 'capsules' || $category === 'capsules';
        case 'stickers':
            return $category === 'stickers' || $sub === 'stickers';
        case 'agents':
            return $category === 'agents' || $sub === 'agents';
        case 'patches':
            return $category === 'patches' || $sub === 'patches';
        case 'music':
            return in_array($category, ['music', 'music_kits'], true) || in_array($sub, ['music', 'music_kits'], true);
    }
    return $category === $tab || $sub === $tab || $type === $tab || $scope === $tab;
}

/** providerCandidateScore() in react/deals-page.jsx. */
function dsScore(array $it): float
{
    $sub = strtolower((string)($it['sub_filter'] ?? $it['category'] ?? ''));
    $category = strtolower((string)($it['category'] ?? ''));
    $price = (float)($it['seed_sell_price'] ?? 0);
    $listings = (float)($it['seed_sell_listings'] ?? 0);
    $typeRank = DS_FRIENDLY_SUB_FILTERS[$sub] ?? (DS_FRIENDLY_SUB_FILTERS[$category] ?? 20);
    $pricePenalty = $price < 1.5 ? 40 : ($price <= 400 ? 0 : ($price <= 1200 ? 15 : 45));
    $liquidity = min(60, log10(max(1, $listings)) * 14);
    return ($typeRank * 100000) + ($pricePenalty * 1000) - ($liquidity * 10) + min($price, 1800) * 0.01;
}

/** itemNeedsSteamStarPrefix() + itemSupportsWearVariants() + dealWearMarketName(). */
function dsWearMarketName(array $it): string
{
    $base = trim((string)($it['market_hash_name'] ?? ''));
    if ($base === '') {
        return '';
    }
    $sub = strtolower((string)($it['sub_filter'] ?? $it['category'] ?? ''));
    $nameForStar = trim((string)($it['market_hash_name'] ?? $it['display_name'] ?? ''));
    // Same container exclusion as itemNeedsSteamStarPrefix() in deals-page.jsx
    // (Falchion Case is not a Falchion knife).
    $needsStar = $sub === 'knives' || $sub === 'gloves'
        || (!str_starts_with($nameForStar, '★')
            && !preg_match('/\b(Case|Capsule|Package|Key|Pin|Patch|Sticker|Graffiti|Charm|Pass|Music Kit)\b/iu', $nameForStar)
            && preg_match('/\b(Knife|Gloves|Wraps|Bayonet|Karambit|Daggers|Navaja|Stiletto|Talon|Ursus|Skeleton|Nomad|Survival|Paracord|Classic|Butterfly|Flip|Gut|Huntsman|Falchion|Bowie|Shadow)\b/iu', $nameForStar));
    if ($needsStar) {
        $raw = trim((string)preg_replace('/^★\s*/u', '', $base));
        $base = $raw === '' || str_starts_with($raw, '★') ? $raw : '★ ' . $raw;
    }
    if (preg_match(DS_WEAR_RE, $base)) {
        return $base;
    }
    $supportsWear = !preg_match('/\b(Patch|Music Kit|Graffiti|Pin|Sticker|Case|Capsule|Sealed Graffiti|Charm|Collectible|Package|Parcel|Pack|Box|Agent)\b/iu', $base)
        && (str_starts_with($base, '★') || str_contains($base, '|'));
    return $supportsWear ? $base . ' (Factory New)' : $base;
}

/**
 * One Steam priceoverview call. Its own fetch rather than
 * cachedLiveFetchSteamOverview(): that one trips lib/steam_circuit.php on a
 * single 429 and then refuses every call for 15 minutes, which parked the
 * whole first run on its very first request (2026-10-04) although Steam
 * answered normally seconds later. Here a 429 is a short backoff.
 *
 * @return array{price: float, volume: ?int}|array{rate_limited: true}|null
 */
function dsFetchOverview(string $name): ?array
{
    $ch = curl_init('https://steamcommunity.com/market/priceoverview/?appid=730&currency=3&market_hash_name=' . rawurlencode($name));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_ENCODING       => '',
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_CONNECTTIMEOUT => 8,
        // Steam rate-limits per user agent as well as per address: on
        // 2026-10-04 the full Chrome string every PC sync job sends was
        // answered 429 for over an hour while a plain "Mozilla/5.0" from
        // the same machine got prices.
        CURLOPT_USERAGENT      => 'Mozilla/5.0',
    ]);
    $body = trim((string)(curl_exec($ch) ?: ''));
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    // Throttled answers are not "no listing": a 429, a dropped connection,
    // a gateway error, or a 200 whose body is just "null" (how Steam
    // answered 393 requests in a row on 2026-10-04, all of which the first
    // version filed as unlisted).
    if ($code === 429 || $code === 0 || $code >= 502 || $body === '' || $body === 'null') {
        return ['rate_limited' => true];
    }
    $data = json_decode($body, true);
    if (!is_array($data)) {
        return ['rate_limited' => true];
    }
    // 200 with success:false, or 500 {"success":false}: Steam has no such
    // listing right now.
    if ($code !== 200 || empty($data['success'])) {
        return null;
    }
    $price = cachedParseSteamPrice((string)($data['lowest_price'] ?? $data['median_price'] ?? ''));
    if ($price === null || $price <= 0) {
        return null;
    }
    $volume = isset($data['volume']) ? (int)str_replace([',', '.', ' '], '', (string)$data['volume']) : null;
    return ['price' => $price, 'volume' => $volume];
}

/** @return list<string> the wear names the Deals page asks Steam for, every tab. */
function dsCandidateNames(): array
{
    $path = __DIR__ . '/../assets/steam-market-cache/roi_catalog.json';
    $data = json_decode((string)@file_get_contents($path), true);
    $items = is_array($data['items'] ?? null) ? $data['items'] : (is_array($data) && array_is_list($data) ? $data : []);
    if (!$items) {
        throw new RuntimeException('roi_catalog.json has no items');
    }
    $names = [];
    foreach (DS_TABS as $tab) {
        $pool = array_values(array_filter($items, static function ($it) use ($tab): bool {
            if (!is_array($it)) {
                return false;
            }
            $seed = (float)($it['seed_sell_price'] ?? 0);
            return $seed > 0 && $seed <= DS_STEAM_MAX_LISTING_PRICE && dsMatchesTab($it, $tab);
        }));
        // JS Array.sort is stable; usort is stable since PHP 8.0.
        usort($pool, static fn($a, $b) => dsScore($a) <=> dsScore($b));
        foreach (array_slice($pool, 0, DS_MAX_PRICE_ITEMS) as $it) {
            $name = dsWearMarketName($it);
            if ($name !== '') {
                $names[$name] = true;
            }
        }
    }
    return array_keys($names);
}

$args = dsArgs();
$names = dsCandidateNames();
dsLog('Deals Steam candidates: ' . count($names) . ' names across ' . count(DS_TABS) . ' tabs');
if ($args['list']) {
    foreach ($names as $n) {
        echo $n, PHP_EOL;
    }
    exit(0);
}

try {
    $pdo = marketDataPdoConnection();
    roiPricesEnsureTable($pdo);
} catch (Throwable $e) {
    dsLog('ERROR connecting to Supabase: ' . $e->getMessage());
    exit(1);
}
$fresh = $args['stale_hours'] > 0 ? roiPricesFreshNames($pdo, 'steam', $args['stale_hours']) : [];
$todo = array_values(array_filter($names, static fn($n) => !isset($fresh[$n])));
$freshCount = count($names) - count($todo);
if ($args['limit'] > 0) {
    $todo = array_slice($todo, 0, $args['limit']);
}
dsLog(count($todo) . ' to price (' . $freshCount . ' fresh within ' . $args['stale_hours'] . 'h)');

$saved = 0; $noListing = 0; $failed = 0; $consecutive429 = 0;
$start = microtime(true);
foreach ($todo as $i => $name) {
    $got = null;
    for ($attempt = 0; $attempt < 4; $attempt++) {
        $got = dsFetchOverview($name);
        if (is_array($got) && !empty($got['rate_limited'])) {
            $consecutive429++;
            // 60 s for a stray 429; ten minutes once Steam keeps refusing.
            $wait = $consecutive429 >= 3 ? 600 : 60;
            dsLog("Steam 429 on '{$name}' - waiting {$wait}s");
            sleep($wait);
            continue;
        }
        break;
    }
    if (is_array($got) && !empty($got['rate_limited'])) {
        $failed++;
        dsLog("  failed (rate limited): {$name}");
    } elseif (!is_array($got) || !isset($got['price'])) {
        $noListing++;
    } else {
        $consecutive429 = 0;
        $price = round((float)$got['price'], 2);
        $snap = [
            'current_price'      => $price,
            'sell_orders'        => null,
            'volume_24h'         => $got['volume'],
            'buy_orders'         => null,
            'price_history'      => null,
            'updated_at'         => gmdate(DATE_ATOM),
            'steam_price_source' => 'priceoverview',
            'price_verified'     => true,
            'market_url'         => 'https://steamcommunity.com/market/listings/730/' . rawurlencode($name),
        ];
        if (!$args['dry_run']) {
            try {
                roiPricesUpsert($pdo, [
                    'market_hash_name' => $name,
                    'source'           => 'steam',
                    'current_price'    => $price,
                    'sell_orders'      => $snap['sell_orders'] ?? null,
                    'market_url'       => $snap['market_url'],
                ]);
                cachedFileSave($name, 'steam', $snap);
                $saved++;
            } catch (Throwable $e) {
                $failed++;
                dsLog("  DB error for '{$name}': " . $e->getMessage());
            }
        } else {
            $saved++;
        }
    }
    if (($i + 1) % 25 === 0 || $i + 1 === count($todo)) {
        dsLog(sprintf('Progress: %d/%d | saved=%d no-listing=%d failed=%d | %ds',
            $i + 1, count($todo), $saved, $noListing, $failed, (int)(microtime(true) - $start)));
    }
    if ($args['sleep_ms'] > 0 && $i + 1 < count($todo)) {
        usleep($args['sleep_ms'] * 1000);
    }
}
dsLog("Done - saved={$saved} no-listing={$noListing} failed={$failed}");
