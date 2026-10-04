<?php
declare(strict_types=1);
/**
 * Souvenir wear prices for the item page's SV column - fetched from THIS
 * machine, because csprice.eu's own address is rate-limited by Steam (every
 * market endpoint answers 429 from the host, so the live pass the page makes
 * for "Souvenir <skin> (<wear>)" never fills anything).
 *
 * For every souvenir-eligible skin (assets/data/souvenir-skin-lookup.json) the
 * five "Souvenir <base> (<wear>)" names are priced with Steam priceoverview,
 * paced like sync_steam_wear_prices.php, and written where the site already
 * looks: the Supabase roi_prices table (get_steam_wear_prices.php and
 * get_roi_prices_cached.php both read it) and the local roi-price-cache files
 * (pushed by deploy\UPLOAD_PRICE_CACHE.bat). A wear with no Steam listing is
 * left out - the column shows "—" for it, which is the truth.
 *
 * Usage:
 *   c:/xampp/php/php.exe sync_steam_souvenir_prices.php --name="AWP | Exothermic"
 *   c:/xampp/php/php.exe sync_steam_souvenir_prices.php --skins-only --sleep=3500 --stale-hours=24
 *   c:/xampp/php/php.exe sync_steam_souvenir_prices.php --skins-only --dry-run
 */

require_once __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/roi_prices_db.php';
require_once __DIR__ . '/get_roi_prices_cached.php';
require_once __DIR__ . '/lib/souvenir_skin_lookup.php';

if (PHP_SAPI !== 'cli') {
    header('Content-Type: text/plain; charset=utf-8');
}
set_time_limit(0);

const SV_WEAR_LIST = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];

function svLog(string $msg): void
{
    echo '[' . date('H:i:s') . '] ' . $msg . PHP_EOL;
    if (PHP_SAPI !== 'cli') { @flush(); }
}

function svArgs(): array
{
    $o = getopt('', ['name::', 'skins-only', 'limit::', 'offset::', 'stale-hours::', 'sleep::', 'dry-run']);
    return [
        'name'        => trim((string)($o['name'] ?? '')),
        'skins_only'  => isset($o['skins-only']),
        'limit'       => max(0, (int)($o['limit']       ?? 0)),
        'offset'      => max(0, (int)($o['offset']      ?? 0)),
        'stale_hours' => max(0, (int)($o['stale-hours'] ?? 24)),
        // One search request per skin (all wears at once), ~17/min.
        'sleep_ms'    => max(0, (int)($o['sleep']       ?? 3500)),
        'dry_run'     => isset($o['dry-run']),
    ];
}

function svParseSteamPrice(string $text): ?float
{
    $c = preg_replace('/[^\d.,]/', '', $text);
    if ($c === '' || $c === null) return null;
    if (preg_match('/,\d{2}$/', $c)) {
        $c = str_replace(['.', ','], ['', '.'], $c);
    } else {
        $c = str_replace(',', '', $c);
    }
    $f = (float)$c;
    return $f > 0 ? round($f, 2) : null;
}

/** @return array{price:?float,volume:?int}|array{rate_limited:true}|null */
function svFetchOverview(string $marketHashName): ?array
{
    $ch = curl_init('https://steamcommunity.com/market/priceoverview/?appid=730&currency=3&market_hash_name=' . rawurlencode($marketHashName));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_ENCODING       => '',
        CURLOPT_TIMEOUT        => 25,
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
    if (!is_string($body) || $status >= 400) {
        return null;
    }
    $data = json_decode($body, true);
    if (!is_array($data) || empty($data['success'])) {
        return null;
    }
    // "Starting at" first, the way every other Steam quote on the site is read.
    $price = svParseSteamPrice((string)($data['lowest_price'] ?? $data['median_price'] ?? ''));
    $volume = isset($data['volume']) ? (int)preg_replace('/[^\d]/', '', (string)$data['volume']) : null;
    return ['price' => $price, 'volume' => $volume];
}

/**
 * All wears of one souvenir skin in ONE request: the market search answers
 * `"Souvenir <base>"` with every listed wear, its "starting at" price and the
 * listing count. Five priceoverview calls per skin were what kept tripping
 * Steam's per-address limit; the search endpoint is both one call per skin
 * and on a more forgiving budget. Prices come back in USD whatever currency
 * is asked for, so they are converted with the same rate the catalog uses.
 *
 * @return array<string,array{price:float,listings:int}>|array{rate_limited:true}|null  keyed by market hash name
 */
function svFetchSearchPrices(string $base): ?array
{
    $ch = curl_init('https://steamcommunity.com/market/search/render/?appid=730&norender=1&search_descriptions=0&count=20&start=0&currency=3&query='
        . rawurlencode('"Souvenir ' . $base . '"'));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_ENCODING       => '',
        CURLOPT_TIMEOUT        => 25,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_HTTPHEADER     => ['Accept: application/json', 'Referer: https://steamcommunity.com/market/'],
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    ]);
    $body   = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($status === 429) {
        return ['rate_limited' => true];
    }
    if (!is_string($body) || $status >= 400) {
        return null;
    }
    $data = json_decode($body, true);
    if (!is_array($data) || empty($data['success'])) {
        return null;
    }
    $want = 'souvenir ' . mb_strtolower($base) . ' (';
    $usdToEur = cachedSteamCatalogUsdToEur();
    $out = [];
    foreach ((array)($data['results'] ?? []) as $row) {
        if (!is_array($row)) continue;
        $hash = trim((string)($row['hash_name'] ?? $row['name'] ?? ''));
        if ($hash === '' || !str_starts_with(mb_strtolower($hash), $want)) continue;
        $cents = $row['sell_price'] ?? null;
        if (!is_numeric($cents) || (float)$cents <= 0) continue;
        $price = (float)$cents / 100;
        if (str_contains((string)($row['sell_price_text'] ?? ''), '$')) {
            $price *= $usdToEur;
        }
        $out[$hash] = ['price' => round($price, 2), 'listings' => (int)($row['sell_listings'] ?? 0)];
    }
    return $out;
}

function svFetchWithBackoff(string $mhn, int &$consecutive429, int &$pausedUntil): ?array
{
    // A pause is a wait, not a skip: the first run returned null here and the
    // caller's `continue` also skipped the per-request sleep, so the remaining
    // ~6,600 names were "tried" in a few seconds and all counted as failed.
    if (time() < $pausedUntil) {
        $wait = $pausedUntil - time();
        svLog("Steam pause: waiting {$wait}s before '{$mhn}'");
        sleep($wait);
    }
    for ($attempt = 0; $attempt < 4; $attempt++) {
        $res = svFetchOverview($mhn);
        if (is_array($res) && !empty($res['rate_limited'])) {
            $consecutive429++;
            $wait = min(300, 45 * (2 ** $attempt));
            svLog("RATE LIMITED on '{$mhn}' - sleeping {$wait}s (attempt " . ($attempt + 1) . '/4)');
            sleep($wait);
            if ($consecutive429 >= 6) {
                // Steam keeps an address on the naughty list for a while: ten
                // minutes was not enough (the next request 429'd again).
                $pausedUntil = time() + 1200;
                $consecutive429 = 0;
                svLog('Too many rate limits - pausing Steam for 20 minutes.');
                return null;
            }
            continue;
        }
        $consecutive429 = 0;
        return $res;
    }
    return null;
}

// ── Base list ────────────────────────────────────────────────────────────────
$args = svArgs();
$bases = [];
if ($args['name'] !== '') {
    $bases = [$args['name']];
} else {
    $catalogPath = __DIR__ . '/assets/steam-market-cache/roi_catalog.json';
    if (!is_file($catalogPath)) { svLog('ERROR: roi_catalog.json missing.'); exit(1); }
    $catalog = json_decode((string)file_get_contents($catalogPath), true);
    $skinFilters = ['rifles', 'pistols', 'smgs', 'heavy', 'shotguns', 'knives', 'gloves'];
    $seen = [];
    foreach (is_array($catalog['items'] ?? null) ? $catalog['items'] : [] as $it) {
        if (!is_array($it)) continue;
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
        if ($base === '' || str_starts_with($base, 'Souvenir ') || str_starts_with($base, "StatTrak\xE2\x84\xA2")) continue;
        $seen[$base] = true;
    }
    $bases = array_keys($seen);
    sort($bases);
}

$eligible = array_values(array_filter($bases, static fn (string $b): bool => skinSupportsSouvenirVariant($b)));
svLog('Souvenir-eligible bases: ' . count($eligible) . ' of ' . count($bases));
if ($args['offset'] > 0) $eligible = array_slice($eligible, $args['offset']);
if ($args['limit']  > 0) $eligible = array_slice($eligible, 0, $args['limit']);
if (!$eligible) {
    svLog($args['name'] !== '' ? "'{$args['name']}' is not a souvenir-eligible skin (assets/data/souvenir-skin-lookup.json)." : 'Nothing to do.');
    exit(0);
}

if ($args['dry_run']) {
    foreach (array_slice($eligible, 0, 10) as $b) {
        svLog('  Souvenir ' . $b . ' -> ' . implode(', ', SV_WEAR_LIST));
    }
    svLog('dry run: ' . count($eligible) . ' Steam search requests, ~' . round(count($eligible) * max(1, $args['sleep_ms']) / 60000) . ' min');
    exit(0);
}

try {
    $pdo = marketDataPdoConnection();
    roiPricesEnsureTable($pdo);
} catch (Throwable $e) {
    svLog('ERROR connecting to Supabase: ' . $e->getMessage());
    exit(1);
}
$fresh = $args['stale_hours'] > 0 ? roiPricesFreshNames($pdo, 'steam', $args['stale_hours']) : [];

$saved = 0; $noListing = 0; $failed = 0; $skipped = 0; $reqs = 0;
$consecutive429 = 0; $pausedUntil = 0;
$start = microtime(true);
$total = count($eligible);

$store = static function (string $mhn, float $price, ?int $listings, string $origin) use ($pdo, &$saved, &$failed): void {
    $snapshot = [
        'current_price' => $price,
        'sell_orders'   => $listings,
        'volume_24h'    => null,
        'buy_orders'    => null,
        'price_history' => null,
        'updated_at'    => gmdate(DATE_ATOM),
        'steam_price_source' => $origin,
        'market_url'    => 'https://steamcommunity.com/market/listings/730/' . rawurlencode($mhn),
    ];
    try {
        roiPricesUpsert($pdo, [
            'market_hash_name' => $mhn,
            'source'           => 'steam',
            'current_price'    => $price,
            'sell_orders'      => $listings,
            'market_url'       => $snapshot['market_url'],
        ]);
        cachedFileSave($mhn, 'steam', $snapshot);
        $saved++;
        svLog(sprintf('  %s = €%.2f', $mhn, $price));
    } catch (Throwable $e) {
        $failed++;
        svLog("  DB error for '{$mhn}': " . $e->getMessage());
    }
};

foreach ($eligible as $index => $base) {
    $pending = [];
    foreach (SV_WEAR_LIST as $wear) {
        $mhn = 'Souvenir ' . $base . ' (' . $wear . ')';
        if (isset($fresh[$mhn])) { $skipped++; continue; }
        $pending[] = $mhn;
    }
    if (!$pending) {
        continue;
    }

    // One search per skin covers every listed wear.
    while (time() < $pausedUntil) {
        // Logged a minute at a time so a runner that watches for output does
        // not take a long pause for a hung process.
        $wait = min(60, $pausedUntil - time());
        svLog("Steam pause: " . ($pausedUntil - time()) . "s left before 'Souvenir {$base}'");
        sleep($wait);
    }
    $found = svFetchSearchPrices($base);
    $reqs++;
    if (is_array($found) && !empty($found['rate_limited'])) {
        $consecutive429++;
        svLog("RATE LIMITED on search 'Souvenir {$base}'" . ($consecutive429 >= 3 ? ' - pausing 20 minutes' : ''));
        if ($consecutive429 >= 3) {
            $pausedUntil = time() + 1200;
            $consecutive429 = 0;
        } else {
            sleep(45);
        }
        $found = null;
    } elseif (is_array($found)) {
        $consecutive429 = 0;
    }

    if ($found === null) {
        $failed += count($pending);
        svLog("  failed: Souvenir {$base} (" . count($pending) . ' wears)');
    } else {
        foreach ($pending as $mhn) {
            if (isset($found[$mhn])) {
                $store($mhn, $found[$mhn]['price'], $found[$mhn]['listings'], 'steam_search');
            } else {
                $noListing++;
                svLog("  no listing: {$mhn}");
            }
        }
    }

    if ($args['sleep_ms'] > 0) {
        usleep($args['sleep_ms'] * 1000);
    }

    $done = $index + 1;
    if ($done % 10 === 0 || $done === $total) {
        svLog(sprintf('Progress: %d/%d bases | saved=%d no-listing=%d skipped-fresh=%d failed=%d requests=%d | %.0fs',
            $done, $total, $saved, $noListing, $skipped, $failed, $reqs, microtime(true) - $start));
    }
}

svLog("Done - saved={$saved} no-listing={$noListing} skipped-fresh={$skipped} failed={$failed} requests={$reqs}");
