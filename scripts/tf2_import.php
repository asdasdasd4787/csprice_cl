<?php
declare(strict_types=1);
/**
 * TF2 catalog import. Three sources, merged into one catalog:
 *
 *   Mannco.store  every TF2 item it has ever listed (~120k rows including
 *                 unusual-effect variants) and today's in-stock prices
 *   TF2 schema    Steam Web API IEconItems_440/GetSchemaItems: official
 *                 names, item types and images for the base items
 *   Steam market  prices, listing counts and exact icons, most listed first
 *
 *   php scripts/tf2_import.php            mannco + schema + merge (fast, minutes)
 *   php scripts/tf2_import.php mannco     only refresh Mannco (names + prices)
 *   php scripts/tf2_import.php schema     only refresh the TF2 item schema
 *   php scripts/tf2_import.php steam      page through the Steam market (slow,
 *                                         resumable, merges every 50 pages)
 *   php scripts/tf2_import.php merge      only rebuild the catalog from the files
 *
 * Run it from a PC, not the host: Steam answers the host's IP with 429, and it
 * returns only 10 market items per request to anonymous callers, so the full
 * Steam pass (~41k items) takes hours. Its progress is saved after every page
 * (assets/data/tf2/steam-pages.json); an interrupted run continues where it
 * stopped. API keys are read from config and never printed.
 *
 * Output: assets/data/tf2/catalog.json (+ .gz, served by tf2_catalog.php)
 *   {bases: [[name, image, type], ...], items: [row, ...]}
 * Row keys (short, ~120k rows):
 *   n  item name        e  unusual effect ("" when none)
 *   c  category         q  quality colour (hex)
 *   b  index into bases (schema image + type), -1 when unknown
 *   i  Steam icon path (when the Steam pass has the item)
 *   l  Steam listings   s  Steam price EUR   m  Mannco price EUR
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$root = dirname(__DIR__);
require $root . '/app_bootstrap.php';
require_once __DIR__ . '/tf2_url_helpers.php';
require_once $root . '/mannco_helpers.php';

@set_time_limit(0);
@ini_set('memory_limit', '1024M');
$mode = strtolower((string)($argv[1] ?? 'all'));
$dataDir = $root . '/assets/data/tf2';
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0775, true);
}
$files = [
    'steam' => $dataDir . '/steam-pages.json',
    'mannco_all' => $dataDir . '/mannco-all.json',
    'mannco_prices' => $dataDir . '/mannco-prices.json',
    'schema' => $dataDir . '/schema.json',
    'catalog' => $dataDir . '/catalog.json',
    'skinport' => $dataDir . '/skinport.json',
    'dmarket' => $dataDir . '/dmarket.json',
    'deals' => $dataDir . '/deals.json',
];

$manncoConfig = manncoConfig();
$usdToEur = (float)($manncoConfig['usd_to_eur'] ?? 0.92);
$steamWebKey = trim((string)(appConfig()['steam_web']['api_key'] ?? ''));

function tf2Log(string $text): void
{
    fwrite(STDOUT, '[' . date('H:i:s') . '] ' . $text . "\n");
}

function tf2HttpGet(string $url, int $timeout = 40): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_ENCODING => '',
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'Accept-Language: en-US,en;q=0.9',
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        ],
    ]);
    $body = (string)curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return ['status' => $status, 'json' => json_decode($body, true)];
}

function tf2WriteJson(string $file, array $data): void
{
    file_put_contents($file, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

function tf2ReadJson(string $file): array
{
    return is_file($file) ? (json_decode((string)file_get_contents($file), true) ?: []) : [];
}

/** Category for the explorer's filter chips. */
function tf2Category(string $name, string $type, string $effect): string
{
    $n = mb_strtolower($name);
    $t = mb_strtolower($type);
    if ($effect !== '' || str_starts_with($n, 'unusual ')) {
        return 'unusual';
    }
    if (preg_match('/\bkey\b/', $n)) {
        return 'keys';
    }
    if (preg_match('/\b(case|crate|cosmetic case|munition|chest|reel|cache)\b/', $n)) {
        return 'cases';
    }
    if (preg_match('/\((factory new|minimal wear|field-tested|well-worn|battle scarred)\)$/', $n) || str_contains($n, 'war paint')) {
        return 'warpaints';
    }
    if (str_contains($t, 'taunt') || str_starts_with($n, 'taunt:')) {
        return 'taunts';
    }
    if (preg_match('/\b(paint|tool|strangifier|killstreak kit|fabricator|name tag|description tag|decal|gift|duel|backpack expander|chemistry set|unusualifier|transmogrifier|strange part|strange filter|craft|metal|ticket|noise maker)\b/', $n . ' ' . $t)) {
        return 'tools';
    }
    if (preg_match('/\b(hat|cosmetic|misc|headgear|apparel|glasses|shirt|beard|feet|medal)\b/', $t)) {
        return 'cosmetics';
    }
    if (preg_match('/\b(primary|secondary|melee|pda|building|rocket launcher|scattergun|shotgun|pistol|sniper rifle|minigun|medi gun|knife|revolver|grenade launcher|stickybomb|flame thrower|flamethrower|bat|bottle|wrench|sapper|smg|bow|crossbow|syringe gun|sword|shield|lunch box|lunchbox|weapon)\b/', $t)) {
        return 'weapons';
    }
    return 'other';
}

/**
 * Skinport's TF2 categories (skinport.com/tf2): cosmetic, melee, primary,
 * secondary, tool, crate, package, craft_item, gift, war_paint, taunt,
 * strange_part, party_favor, usable_item, supply_crate. Skinport's own label
 * wins when the item is listed there; otherwise schema slot/class/type.
 */
function tf2MarketCategory(string $name, string $effect, array $base, string $skinportCat): string
{
    $n = mb_strtolower($name);
    $type = mb_strtolower((string)($base[2] ?? ''));
    $slot = mb_strtolower((string)($base[3] ?? ''));
    $class = mb_strtolower((string)($base[4] ?? ''));

    // Supply crates are the numbered "Mann Co. Supply Crate / Munition /
    // Series #" family; the named cosmetic and war paint cases are crates.
    $isSupply = (bool)preg_match('/\b(supply crate|supply munition|series #\d+|salvaged mann co|mann co\. director|mann co\. audition)\b/', $n);
    $map = [
        'cosmetic' => 'cosmetic', 'primary-weapon' => 'primary', 'melee-weapon' => 'melee', 'secondary-weapon' => 'secondary',
        'secondary-pda' => 'secondary', 'primary-pda' => 'secondary', 'building' => 'secondary', 'war-paint' => 'war_paint',
        'taunt-1' => 'taunt', 'action' => 'taunt', 'crate' => $isSupply ? 'supply_crate' : 'crate', 'strange-part' => 'strange_part',
        'tool' => 'tool', 'recipe' => 'tool', 'strangifier' => 'tool', 'server-enchantment' => 'tool', 'craft-item' => 'craft_item',
        'party-favor' => 'party_favor', 'package' => 'package', 'usable-item' => 'usable_item', 'gift' => 'gift',
    ];
    if ($skinportCat !== '' && isset($map[$skinportCat])) {
        return $map[$skinportCat];
    }
    if (str_starts_with($n, 'strange part:') || $type === 'strange part') {
        return 'strange_part';
    }
    if (str_contains($n, 'war paint') || $type === 'war paint') {
        return 'war_paint';
    }
    if ($class === 'supply_crate' || preg_match('/\b(case|crate|cache|munition|reel)\b/', $n) && !preg_match('/\bkey\b/', $n)) {
        return $isSupply ? 'supply_crate' : 'crate';
    }
    if ($type === 'party favor') {
        return 'party_favor';
    }
    if ($type === 'usable item' || $type === 'noise maker') {
        return 'usable_item';
    }
    if ($type === 'package' || $type === 'item bundle') {
        return 'package';
    }
    if ($type === 'gift') {
        return 'gift';
    }
    if ($class === 'craft_item' || $type === 'craft item' || preg_match('/\b(refined|reclaimed|scrap) metal\b|\btoken\b|\bfabricator\b/', $n)) {
        return str_contains($n, 'fabricator') ? 'tool' : 'craft_item';
    }
    if ($slot === 'taunt' || str_starts_with($n, 'taunt:') || str_contains($n, ' taunt:')) {
        return 'taunt';
    }
    if ($slot === 'primary') {
        return 'primary';
    }
    if (in_array($slot, ['secondary', 'pda', 'pda2', 'building'], true)) {
        return 'secondary';
    }
    if ($slot === 'melee') {
        return 'melee';
    }
    if ($class === 'tool' || $slot === 'action' || preg_match('/\b(key|paint|name tag|description tag|strangifier|killstreak kit|unusualifier|decal|backpack expander|duel|chemistry set|festivizer|spell|transmogrifier|ticket|pass)\b/', $n . ' ' . $type)) {
        return 'tool';
    }
    if ($effect !== '' || in_array($slot, ['misc', 'head', 'hat'], true) || $class === 'tf_wearable') {
        return 'cosmetic';
    }
    // War-painted / skinned weapons listed only under their wear name.
    if (preg_match('/\((factory new|minimal wear|field-tested|well-worn|battle scarred)\)$/', $n)) {
        return 'primary';
    }
    return 'cosmetic';
}

/**
 * Daily price snapshot + the TF2 ticker pool (assets/data/tf2/ticker-pool.json,
 * same shape as the CS2 pool from scripts/build_ticker_pool.php: {name, pct,
 * price, url, spark[26]}).
 *
 * TF2 has no price history anywhere, so every merge writes today's prices to
 * assets/data/tf2/history/YYYY-MM-DD.json.gz ({name: [steam, best]}, effect-
 * less priced items). Once two or more days exist the pool is the real change
 * over the window they span (up to 30 days), with a sparkline sampled from the
 * daily points like the CS2 one. Until then it falls back to Skinport's sales
 * averages (scripts/tf2_skinport_fetch.py -> skinport-history.json): 7-day
 * average against 30-day average, items with 5+ sales in 30 days, and a
 * four-anchor sparkline (90d avg, 30d avg, 7d avg, now). The pool says which
 * basis it used.
 */
function tf2WriteSnapshotAndTicker(array $rows, array $files): void
{
    $dir = dirname($files['catalog']);
    $histDir = $dir . '/history';
    if (!is_dir($histDir)) {
        mkdir($histDir, 0775, true);
    }
    $best = static function (array $r): float {
        $p = array_filter([$r['s'] ?? null, $r['k'] ?? null, $r['m'] ?? null, $r['d'] ?? null], static fn($v) => is_numeric($v) && $v > 0);
        return $p ? (float)min($p) : 0.0;
    };
    $today = [];
    $meta = [];
    foreach ($rows as $r) {
        if ($r['e'] !== '') {
            continue;
        }
        $b = $best($r);
        if ($b <= 0) {
            continue;
        }
        $today[$r['n']] = [isset($r['s']) ? (float)$r['s'] : 0.0, round($b, 2)];
        $meta[$r['n']] = ['b' => (int)($r['b'] ?? -1), 'l' => (int)($r['l'] ?? 0), 'g' => (string)($r['g'] ?? '')];
    }
    $date = gmdate('Y-m-d');
    file_put_contents($histDir . '/' . $date . '.json.gz', gzencode((string)json_encode(['date' => $date, 'p' => $today], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 9));

    // Ticker entries are priced, effect-less rows: their clean page.
    $url = static fn(string $name, int $b) => tf2ItemHref($name, '', (string)($meta[$name]['g'] ?? ''), $b);
    $points = 26;
    $items = [];
    $basis = 'snapshots';
    $rangeDays = 0;

    // Snapshot series: every day file up to 30 days back, oldest first.
    $days = [];
    foreach (glob($histDir . '/*.json.gz') ?: [] as $file) {
        $d = basename($file, '.json.gz');
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) && (time() - strtotime($d . ' UTC')) <= 31 * 86400) {
            $days[$d] = $file;
        }
    }
    ksort($days);
    if (count($days) >= 2) {
        $series = [];
        foreach ($days as $d => $file) {
            $snap = json_decode((string)gzdecode((string)file_get_contents($file)), true);
            foreach ((array)($snap['p'] ?? []) as $name => $pair) {
                // Steam price when both ends have one, else the best price.
                $series[$name][$d] = $pair;
            }
        }
        $dayKeys = array_keys($days);
        $first = $dayKeys[0];
        $rangeDays = max(1, (int)round((strtotime($dayKeys[count($dayKeys) - 1] . ' UTC') - strtotime($first . ' UTC')) / 86400));
        foreach ($series as $name => $byDay) {
            if (!isset($byDay[$first], $today[$name])) {
                continue;
            }
            $useSteam = $byDay[$first][0] > 0 && $today[$name][0] > 0;
            $start = $useSteam ? $byDay[$first][0] : $byDay[$first][1];
            $now = $useSteam ? $today[$name][0] : $today[$name][1];
            if ($start < 0.5 || $now <= 0 || ($meta[$name]['l'] ?? 0) < 20) {
                continue;
            }
            $pct = round((($now - $start) / $start) * 100, 2);
            if (abs($pct) > 150 || abs($pct) < 0.5) {
                continue;
            }
            // 26 samples across the day list, step-hold like the CS2 builder.
            $spark = [];
            $n = count($dayKeys);
            for ($i = 0; $i < $points; $i++) {
                $idx = (int)floor($i * ($n - 1) / max(1, $points - 1));
                $v = null;
                for ($k = $idx; $k >= 0; $k--) {
                    if (isset($byDay[$dayKeys[$k]])) {
                        $v = $useSteam ? $byDay[$dayKeys[$k]][0] : $byDay[$dayKeys[$k]][1];
                        break;
                    }
                }
                $spark[] = round($v ?? $start, 2);
            }
            $spark[$points - 1] = round($now, 2);
            $items[] = ['name' => $name, 'pct' => $pct, 'price' => round($today[$name][1], 2), 'url' => $url($name, $meta[$name]['b']), 'spark' => $spark];
        }
    }

    if (count($items) < 20) {
        $basis = 'skinport-averages';
        $rangeDays = 30;
        $items = [];
        $hist = tf2ReadJson($dir . '/skinport-history.json')['history'] ?? [];
        foreach ($hist as $name => $h) {
            if (!isset($h['7'], $h['30'], $today[$name]) || $h['30'][1] < 5 || $h['30'][0] < 0.5) {
                continue;
            }
            $pct = round((($h['7'][0] - $h['30'][0]) / $h['30'][0]) * 100, 2);
            if (abs($pct) > 150 || abs($pct) < 0.5) {
                continue;
            }
            $anchors = [$h['90'][0] ?? $h['30'][0], $h['30'][0], $h['7'][0], $today[$name][1]];
            $spark = [];
            for ($i = 0; $i < $points; $i++) {
                $spark[] = round($anchors[min(3, (int)floor($i * 4 / $points))], 2);
            }
            $items[] = ['name' => $name, 'pct' => $pct, 'price' => round($today[$name][1], 2), 'url' => $url($name, $meta[$name]['b'] ?? -1), 'spark' => $spark];
        }
    }

    usort($items, static fn($a, $b) => abs($b['pct']) <=> abs($a['pct']));
    $items = array_slice($items, 0, 200);
    file_put_contents($dir . '/ticker-pool.json', json_encode([
        'generated' => gmdate('c'),
        'game' => 'tf2',
        'basis' => $basis,
        'range_days' => $rangeDays,
        'count' => count($items),
        'index' => null,
        'items' => $items,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    tf2Log(sprintf('ticker: %d movers (%s, %d snapshot day%s), snapshot %s with %d prices', count($items), $basis, count($days), count($days) === 1 ? '' : 's', $date, count($today)));
    tf2WriteMarketSnapshot($rows, $dir, $histDir, $today, $meta);
}

/**
 * assets/data/tf2/market-snapshot.json: the "TF2 markets overview" strip of
 * the AI chat, in the CS2 snapshot's shape (market_snapshot_helpers.php) so
 * the same component renders it. Market cap is Steam listing value (price x
 * listings). Trends are the listing-weighted Steam price change against the
 * day file closest to 1 / 7 / 30 / 365 days back; with no such day the 7D
 * figure is estimated from Skinport's 7-day vs 30-day sales averages, and the
 * 24H turnover is Skinport's 30-day sales volume spread per day (both marked
 * estimated). Served by get_market_snapshot.php?game=tf2 and chat.php.
 */
function tf2WriteMarketSnapshot(array $rows, string $dir, string $histDir, array $today, array $meta): void
{
    $capEur = 0.0;
    $pricedRows = 0;
    $listings = 0;
    $distinct = [];
    foreach ($rows as $r) {
        if (isset($r['s']) || isset($r['k']) || isset($r['m']) || isset($r['d'])) {
            $distinct[preg_replace('/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle Scarred)\)$/', '', $r['n'])] = true;
        }
        $s = isset($r['s']) && is_numeric($r['s']) ? (float)$r['s'] : 0.0;
        $l = (int)($r['l'] ?? 0);
        if ($s <= 0 || $l <= 0) {
            continue;
        }
        $pricedRows++;
        $listings += $l;
        $capEur += $s * $l;
    }

    // Day files by age in days (all of them, the 1Y window needs old ones).
    $byAge = [];
    foreach (glob($histDir . '/*.json.gz') ?: [] as $file) {
        $d = basename($file, '.json.gz');
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) {
            $byAge[(int)round((strtotime(gmdate('Y-m-d') . ' UTC') - strtotime($d . ' UTC')) / 86400)] = $file;
        }
    }
    $trend = static function (int $target, int $tolerance) use ($byAge, $today, $meta): array {
        $bestAge = null;
        foreach (array_keys($byAge) as $age) {
            if ($age >= max(1, $target - $tolerance) && $age <= $target + $tolerance && ($bestAge === null || abs($age - $target) < abs($bestAge - $target))) {
                $bestAge = $age;
            }
        }
        if ($bestAge === null) {
            return [null, 0];
        }
        $snap = json_decode((string)gzdecode((string)file_get_contents($byAge[$bestAge])), true);
        $start = 0.0;
        $now = 0.0;
        $n = 0;
        foreach ((array)($snap['p'] ?? []) as $name => $pair) {
            $l = (int)($meta[$name]['l'] ?? 0);
            if ($l < 20 || !isset($today[$name]) || ($pair[0] ?? 0) <= 0 || $today[$name][0] <= 0) {
                continue;
            }
            $start += (float)$pair[0] * $l;
            $now += $today[$name][0] * $l;
            $n++;
        }
        return $start > 0 && $n >= 20 ? [round(($now / $start - 1) * 100, 2), $n] : [null, 0];
    };
    [$pct24h, $n24h] = $trend(1, 0);
    [$pct7d, $n7d] = $trend(7, 2);
    [$pct30d, $n30d] = $trend(30, 5);
    [$pct1y, $n1y] = $trend(365, 40);
    $estimated = false;

    // Skinport sales: turnover per day, and the 7D trend when no week-old
    // snapshot exists yet.
    $hist = tf2ReadJson($dir . '/skinport-history.json')['history'] ?? [];
    $turnover30 = 0.0;
    $volItems = 0;
    $w7 = 0.0;
    $w30 = 0.0;
    $wItems = 0;
    foreach ($hist as $name => $h) {
        if (!isset($h['30']) || ($h['30'][1] ?? 0) <= 0 || ($h['30'][0] ?? 0) <= 0) {
            continue;
        }
        $turnover30 += (float)$h['30'][0] * (int)$h['30'][1];
        $volItems++;
        if (isset($h['7']) && ($h['7'][1] ?? 0) >= 5 && ($h['30'][1] ?? 0) >= 5) {
            $w7 += (float)$h['7'][0] * (int)$h['30'][1];
            $w30 += (float)$h['30'][0] * (int)$h['30'][1];
            $wItems++;
        }
    }
    if ($pct7d === null && $w30 > 0 && $wItems >= 20) {
        $pct7d = round(($w7 / $w30 - 1) * 100, 2);
        $n7d = $wItems;
        $estimated = true;
    }

    tf2WriteJson($dir . '/market-snapshot.json', [
        'game' => 'tf2',
        'app_id' => 440,
        'market_cap' => round($capEur, 2),
        'market_cap_label' => 'Steam listing value',
        'volume_24h' => $volItems > 0 ? round($turnover30 / 30, 2) : null,
        'volume_24h_label' => '24H Skinport turnover',
        'volume_24h_estimated' => true,
        'volume_sample_count' => $volItems,
        'trend_pct' => $pct30d,
        'trend_pct_24h' => $pct24h,
        'trend_pct_7d' => $pct7d,
        'trend_pct_30d' => $pct30d,
        'trend_pct_1y' => $pct1y,
        'trend_label' => '30D trend',
        'trend_period' => '30D',
        'trend_estimated' => $estimated,
        'trend_sample_count' => $n30d,
        'trend_sample_count_24h' => $n24h,
        'trend_sample_count_7d' => $n7d,
        'trend_sample_count_30d' => $n30d,
        'trend_sample_count_1y' => $n1y,
        'items_tracked' => count($distinct),
        'priced_rows' => $pricedRows,
        'active_listings' => $listings,
        'currency' => 'EUR',
        'updated_at' => gmdate(DATE_ATOM),
        'trend_updated_at' => gmdate(DATE_ATOM),
        'steam_metrics_updated_at' => null,
    ]);
    tf2Log(sprintf('market snapshot: cap €%.0f over %d rows, 24h %s, 7d %s', $capEur, $pricedRows, $pct24h === null ? 'n/a' : $pct24h . '%', $pct7d === null ? 'n/a' : $pct7d . '%' . ($estimated ? ' (est.)' : '')));
}

/**
 * Per-item history for the item page's chart and deltas. Writes today's
 * snapshot (assets/data/tf2/history/YYYY-MM-DD.json.gz, {name: [steam, best,
 * skinport, mannco, dmarket]}), then attaches to every effect-less priced row:
 *   h  = [[date, steam, best, skinport, mannco, dmarket], ...]  every snapshot of the last 90 days, oldest first
 *   sk = [avg90, avg30, avg7, vol30] Skinport sales averages (skinport-history.json)
 * The shards are written after this, so the item page gets both without
 * another request. catalog.json is written before it and stays lean.
 */
function tf2AttachHistory(array &$rows, array $files): void
{
    $dir = dirname($files['catalog']);
    $histDir = $dir . '/history';
    if (!is_dir($histDir)) {
        mkdir($histDir, 0775, true);
    }
    $today = [];
    foreach ($rows as $r) {
        if ($r['e'] !== '') {
            continue;
        }
        $p = array_filter([$r['s'] ?? null, $r['k'] ?? null, $r['m'] ?? null, $r['d'] ?? null], static fn($v) => is_numeric($v) && $v > 0);
        if (!$p) {
            continue;
        }
        // [steam, best, skinport, mannco, dmarket]; files before 2026-09-28
        // carry only the first two.
        $today[$r['n']] = [isset($r['s']) ? (float)$r['s'] : 0.0, round((float)min($p), 2), (float)($r['k'] ?? 0), (float)($r['m'] ?? 0), (float)($r['d'] ?? 0)];
    }
    $date = gmdate('Y-m-d');
    file_put_contents($histDir . '/' . $date . '.json.gz', gzencode((string)json_encode(['date' => $date, 'p' => $today], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 9));

    $days = [];
    foreach (glob($histDir . '/*.json.gz') ?: [] as $file) {
        $d = basename($file, '.json.gz');
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) && (time() - strtotime($d . ' UTC')) <= 91 * 86400) {
            $days[$d] = $file;
        }
    }
    ksort($days);
    $series = [];
    foreach ($days as $d => $file) {
        $snap = json_decode((string)gzdecode((string)file_get_contents($file)), true);
        foreach ((array)($snap['p'] ?? []) as $name => $pair) {
            // h row: [date, steam, best, skinport, mannco, dmarket]
            $series[$name][] = [$d, (float)$pair[0], (float)$pair[1], (float)($pair[2] ?? 0), (float)($pair[3] ?? 0), (float)($pair[4] ?? 0)];
        }
    }
    $sk = tf2ReadJson($dir . '/skinport-history.json')['history'] ?? [];
    $attached = 0;
    foreach ($rows as &$r) {
        if ($r['e'] !== '') {
            continue;
        }
        if (isset($series[$r['n']])) {
            $r['h'] = $series[$r['n']];
            $attached++;
        }
        if (isset($sk[$r['n']])) {
            $h = $sk[$r['n']];
            $r['sk'] = [$h['90'][0] ?? null, $h['30'][0] ?? null, $h['7'][0] ?? null, (int)($h['30'][1] ?? 0)];
        }
    }
    unset($r);
    tf2Log(sprintf('history: %d snapshot day%s, %d items with a series, snapshot %s with %d prices', count($days), count($days) === 1 ? '' : 's', $attached, $date, count($today)));
}

/** Shard file key for an item (see the item-shard block in tf2Merge). */
function tf2ShardKey(int $base, string $name): string
{
    if ($base >= 0) {
        return 'b' . ($base % 256);
    }
    $h = 5381;
    $len = strlen($name);
    for ($i = 0; $i < $len; $i++) {
        $h = (($h << 5) + $h + ord($name[$i])) & 0xFFFFFFFF;
    }
    return 'n' . ($h % 64);
}

/** TF2 quality colours, from the name's quality prefix. */
function tf2QualityColor(string $name, string $effect): string
{
    if ($effect !== '' || str_starts_with($name, 'Unusual ')) {
        return '8650AC';
    }
    foreach ([
        'Strange ' => 'CF6A32', 'Vintage ' => '476291', 'Genuine ' => '4D7455', 'Haunted ' => '38F3AB',
        "Collector's " => 'AA0000', 'Community ' => '70B04A', 'Self-Made ' => '70B04A', 'Decorated ' => 'FAFAFA',
        'Normal ' => 'B2B2B2',
    ] as $prefix => $hex) {
        if (str_starts_with($name, $prefix) || str_starts_with($name, 'Non-Craftable ' . $prefix)) {
            return $hex;
        }
    }
    return 'FFD700'; // Unique
}

// ------------------------------------------------------------------ Mannco
function tf2ImportMannco(array $files, array $config, float $usdToEur): void
{
    $base = rtrim((string)($config['base_url'] ?? 'https://api.mannco.store'), '/');
    $fetch = static function (int $outOfStock) use ($base, $config): ?array {
        for ($attempt = 1; $attempt <= 6; $attempt++) {
            $token = manncoAcquireToken($config, $attempt > 2);
            if ($token === '') {
                tf2Log('mannco: no API token (mannco.api_key in config.local.php?)');
                return null;
            }
            $res = manncoHttpRequest('GET', $base . '/item/prices?' . http_build_query(['game' => 440, 'outofstock' => $outOfStock]), $config, ['token' => $token]);
            $rows = is_array($res['json'] ?? null) ? $res['json'] : [];
            if (($res['status'] ?? 0) === 200 && isset($rows[0]['name'])) {
                return $rows;
            }
            $wait = 45 * $attempt;
            tf2Log(sprintf('mannco: HTTP %s (outofstock=%d), retry in %ds', $res['status'] ?? '?', $outOfStock, $wait));
            sleep($wait);
        }
        return null;
    };

    // Every row carries `url`, the slug of the item's own page on
    // mannco.store (/item/<url>, e.g. "440-mann-co-supply-crate-key"). It is
    // the only exact deep link there ("/?search=" is the front page), so it
    // is kept per name|effect and travels into the catalog as `mu`.
    $urls = [];
    $all = $fetch(1);
    if ($all) {
        $list = [];
        foreach ($all as $r) {
            $name = trim((string)($r['name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $effect = trim((string)($r['effect'] ?? ''));
            $list[] = [$name, $effect, (int)($r['craftable'] ?? 1)];
            // Craftable and non-craftable share a name; the craftable row's
            // url wins (the other is "440-uncraftable-<slug>").
            if (trim((string)($r['url'] ?? '')) !== '' && (!isset($urls[$name . '|' . $effect]) || (int)($r['craftable'] ?? 1) === 1)) {
                $urls[$name . '|' . $effect] = trim((string)$r['url']);
            }
        }
        tf2WriteJson($files['mannco_all'], ['updated_at' => gmdate(DATE_ATOM), 'items' => $list]);
        tf2Log(sprintf('mannco: %d TF2 items (all ever listed)', count($list)));
        sleep(20);
    }
    $inStock = $fetch(0);
    if ($inStock) {
        $prices = [];
        $volumes = [];
        foreach ($inStock as $r) {
            $name = trim((string)($r['name'] ?? ''));
            $price = manncoParsePrice($r['price'] ?? null, $usdToEur);
            if ($name === '' || $price === null || $price <= 0) {
                continue;
            }
            $key = $name . '|' . trim((string)($r['effect'] ?? ''));
            if (!isset($prices[$key]) || $price < $prices[$key]) {
                $prices[$key] = round($price, 2);
            }
            if (trim((string)($r['url'] ?? '')) !== '' && (!isset($urls[$key]) || (int)($r['craftable'] ?? 1) === 1)) {
                $urls[$key] = trim((string)$r['url']);
            }
            // `assetcount` = units in stock on Mannco (the item page's "N
            // listed"); the CS2 feed calls the same figure `volume`.
            $stock = $r['assetcount'] ?? $r['volume'] ?? null;
            if (is_numeric($stock) && (int)$stock > 0) {
                $volumes[$key] = ($volumes[$key] ?? 0) + (int)$stock;
            }
        }
        $previous = tf2ReadJson($files['mannco_prices']);
        tf2WriteJson($files['mannco_prices'], [
            'updated_at' => gmdate(DATE_ATOM),
            'prices' => $prices,
            'urls' => $urls ?: ($previous['urls'] ?? []),
            'volumes' => $volumes,
        ]);
        tf2Log(sprintf('mannco: %d in-stock prices, %d item urls, %d with stock counts', count($prices), count($urls), count($volumes)));
    }
}

// ------------------------------------------------------------------ schema
function tf2ImportSchema(array $files, string $key): void
{
    if ($key === '') {
        tf2Log('schema: no steam_web.api_key in config; skipped');
        return;
    }
    $bases = [];
    $start = 0;
    $pages = 0;
    do {
        $url = 'https://api.steampowered.com/IEconItems_440/GetSchemaItems/v0001/?' . http_build_query(['key' => $key, 'language' => 'en', 'start' => $start]);
        $res = tf2HttpGet($url, 60);
        $result = is_array($res['json']['result'] ?? null) ? $res['json']['result'] : null;
        if ($res['status'] !== 200 || !$result || !is_array($result['items'] ?? null)) {
            tf2Log(sprintf('schema: HTTP %d at start=%d; stopping', $res['status'], $start));
            break;
        }
        foreach ($result['items'] as $item) {
            $name = trim((string)($item['item_name'] ?? ''));
            $image = trim((string)($item['image_url_large'] ?? $item['image_url'] ?? ''));
            if ($name === '' || $image === '') {
                continue;
            }
            $k = mb_strtolower($name);
            if (!isset($bases[$k])) {
                // [name, image, type name, slot (primary|secondary|melee|misc|
                // taunt|action|pda|...), class (tool|supply_crate|craft_item|
                // tf_wearable|...)] - slot and class drive the Market
                // Explorer's Skinport-style categories (tf2MarketCategory).
                $bases[$k] = [
                    $name,
                    $image,
                    trim((string)($item['item_type_name'] ?? '')),
                    trim((string)($item['item_slot'] ?? '')),
                    trim((string)($item['item_class'] ?? '')),
                ];
            }
        }
        $pages++;
        $start = isset($result['next']) ? (int)$result['next'] : 0;
        usleep(400000);
    } while ($start > 0 && $pages < 200);
    if ($bases) {
        tf2WriteJson($files['schema'], ['updated_at' => gmdate(DATE_ATOM), 'bases' => array_values($bases)]);
        tf2Log(sprintf('schema: %d base items with images (%d pages)', count($bases), $pages));
    }
}

// ------------------------------------------------------------------ Steam
function tf2ImportSteam(array $files, callable $merge): void
{
    $state = tf2ReadJson($files['steam']);
    $items = is_array($state['items'] ?? null) ? $state['items'] : [];
    $start = (int)($state['next_start'] ?? 0);
    $total = (int)($state['total'] ?? 0);
    $fails = 0;
    $pagesSinceMerge = 0;
    // A finished crawl older than 12 hours starts over from page 0 (prices
    // and listing counts refresh in place; the daily snapshot then records
    // a real new day). A crawl that stopped part-way resumes where it was.
    $finishedAt = strtotime((string)($state['updated_at'] ?? '')) ?: 0;
    if ($total > 0 && $start >= $total && time() - $finishedAt > 12 * 3600) {
        tf2Log(sprintf('steam: last full crawl %s; starting a fresh pass', gmdate('Y-m-d H:i', $finishedAt)));
        $start = 0;
    }

    tf2Log(sprintf('steam: resuming at %d of %s, %d items so far', $start, $total ?: '?', count($items)));
    while ($total === 0 || $start < $total) {
        $url = 'https://steamcommunity.com/market/search/render/?' . http_build_query([
            'appid' => 440, 'norender' => 1, 'count' => 100, 'start' => $start,
            'sort_column' => 'quantity', 'sort_dir' => 'desc',
        ]);
        $res = tf2HttpGet($url);
        $json = is_array($res['json']) ? $res['json'] : null;
        if ($res['status'] !== 200 || !$json || empty($json['success']) || !is_array($json['results'] ?? null)) {
            $fails++;
            $wait = $res['status'] === 429 ? min(600, 90 * $fails) : min(180, 20 * $fails);
            tf2Log(sprintf('steam: HTTP %d at start=%d, waiting %ds', $res['status'], $start, $wait));
            if ($fails > 40) {
                tf2Log('steam: too many failures; run again later to resume');
                break;
            }
            sleep($wait);
            continue;
        }
        $fails = 0;
        $total = (int)($json['total_count'] ?? $total);
        foreach ($json['results'] as $row) {
            $desc = is_array($row['asset_description'] ?? null) ? $row['asset_description'] : [];
            $name = trim((string)($row['hash_name'] ?? $desc['market_hash_name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $items[$name] = [
                'l' => (int)($row['sell_listings'] ?? 0),
                'p' => (int)($row['sell_price'] ?? 0),
                'i' => (string)($desc['icon_url'] ?? ''),
                'q' => strtoupper((string)($desc['name_color'] ?? '')),
                't' => (string)($desc['type'] ?? ''),
            ];
        }
        $got = count($json['results']);
        $start += $got > 0 ? $got : 10;
        tf2WriteJson($files['steam'], ['total' => $total, 'next_start' => $start, 'updated_at' => gmdate(DATE_ATOM), 'items' => $items]);
        if ($got === 0) {
            break;
        }
        if (++$pagesSinceMerge >= 50) {
            tf2Log(sprintf('steam: %d / %d (%d items)', min($start, $total), $total, count($items)));
            $merge();
            $pagesSinceMerge = 0;
        }
        sleep(4);
    }
    tf2Log(sprintf('steam: stopped at %d / %d (%d items)', min($start, $total), $total, count($items)));
}

// ------------------------------------------------------------------ Skinport
// Skinport's /v1/items answers only with Brotli, which this PHP's curl cannot
// decode, so the Python helper fetches it (see scripts/tf2_skinport_fetch.py).
function tf2ImportSkinport(array $files, string $root): void
{
    if (!function_exists('exec')) {
        tf2Log('skinport: exec() unavailable; run python scripts/tf2_skinport_fetch.py by hand');
        return;
    }
    $cmd = 'python ' . escapeshellarg($root . '/scripts/tf2_skinport_fetch.py') . ' ' . escapeshellarg($files['skinport']);
    $out = [];
    exec($cmd . ' 2>&1', $out, $code);
    tf2Log('skinport: ' . trim(implode(' ', $out)) . ($code !== 0 ? " (exit $code)" : ''));
}

// ------------------------------------------------------------------ DMarket
// Public aggregated-prices endpoint (no key needed): best offer and offer
// count per title, 80 titles a request. Titles are ALL effect-less items of
// the catalog, priced elsewhere or not (DMarket titles carry no unusual
// effect) - so DMarket can be the first market to price an item (user,
// 2026-09-30: "always try to import all prices"). About 1,450 requests.
function tf2ImportDmarket(array $files, float $usdToEur): void
{
    $catalog = tf2ReadJson($files['catalog']);
    $titles = [];
    foreach ($catalog['items'] ?? [] as $row) {
        if (($row['e'] ?? '') === '') {
            $titles[] = (string)$row['n'];
        }
    }
    $titles = array_values(array_unique($titles));
    $prices = [];
    $chunks = array_chunk($titles, 80);
    tf2Log(sprintf('dmarket: %d titles in %d requests', count($titles), count($chunks)));
    foreach ($chunks as $i => $chunk) {
        $body = (string)json_encode(['filter' => ['game' => 'tf2', 'titles' => $chunk], 'limit' => (string)count($chunk)], JSON_UNESCAPED_UNICODE);
        for ($attempt = 1; $attempt <= 4; $attempt++) {
            $ch = curl_init('https://api.dmarket.com/marketplace-api/v1/aggregated-prices');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_TIMEOUT => 40,
                CURLOPT_ENCODING => '',
                CURLOPT_HTTPHEADER => ['Accept: application/json', 'Content-Type: application/json', 'User-Agent: CSPrice/1.0'],
            ]);
            $res = json_decode((string)curl_exec($ch), true);
            $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            curl_close($ch);
            if ($status === 200 && is_array($res['aggregatedPrices'] ?? null)) {
                foreach ($res['aggregatedPrices'] as $r) {
                    $cents = $r['offerBestPrice']['Amount'] ?? null;
                    $count = (int)($r['offerCount'] ?? 0);
                    if (!is_numeric($cents) || (int)$cents <= 0 || $count <= 0) {
                        continue;
                    }
                    $prices[(string)$r['title']] = ['p' => round(((int)$cents / 100) * $usdToEur, 2), 'q' => $count];
                }
                break;
            }
            sleep(5 * $attempt);
        }
        if (($i + 1) % 50 === 0) {
            tf2Log(sprintf('dmarket: %d / %d requests, %d priced', $i + 1, count($chunks), count($prices)));
            tf2WriteJson($files['dmarket'], ['updated_at' => gmdate(DATE_ATOM), 'prices' => $prices]);
        }
        usleep(350000);
    }
    tf2WriteJson($files['dmarket'], ['updated_at' => gmdate(DATE_ATOM), 'prices' => $prices]);
    tf2Log(sprintf('dmarket: %d TF2 items with an offer', count($prices)));
}

// ------------------------------------------------------------------ merge
function tf2Merge(array $files, float $usdToEur): void
{
    $steamItems = tf2ReadJson($files['steam'])['items'] ?? [];
    $manncoAll = tf2ReadJson($files['mannco_all'])['items'] ?? [];
    $manncoFile = tf2ReadJson($files['mannco_prices']);
    $manncoPrices = $manncoFile['prices'] ?? [];
    $manncoUrls = $manncoFile['urls'] ?? [];
    $manncoVolumes = $manncoFile['volumes'] ?? [];
    $schema = tf2ReadJson($files['schema'])['bases'] ?? [];
    $skinport = tf2ReadJson($files['skinport'])['prices'] ?? [];
    $dmarket = tf2ReadJson($files['dmarket'])['prices'] ?? [];

    $baseIndex = [];
    foreach ($schema as $i => $b) {
        $baseIndex[mb_strtolower((string)$b[0])] = $i;
    }
    $prefixes = ['Non-Craftable ', 'Strange ', 'Unusual ', 'Vintage ', 'Genuine ', 'Haunted ', "Collector's ", 'Festivized ',
        'Professional Killstreak ', 'Specialized Killstreak ', 'Killstreak ', 'Australium ', 'Community ', 'Self-Made ',
        'Decorated ', 'Normal ', 'Unique ', 'The '];
    $findBase = static function (string $name) use ($baseIndex, $prefixes): int {
        $plain = preg_replace('/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle Scarred)\)$/', '', $name) ?? $name;
        do {
            $before = $plain;
            foreach ($prefixes as $p) {
                if (str_starts_with($plain, $p)) {
                    $plain = substr($plain, strlen($p));
                }
            }
        } while ($plain !== $before);
        $lower = mb_strtolower($plain);
        if (isset($baseIndex[$lower])) {
            return $baseIndex[$lower];
        }
        // War-painted weapons: "<paint> <weapon>" -> longest weapon suffix.
        $words = explode(' ', $lower);
        for ($i = 1; $i < count($words); $i++) {
            $tail = implode(' ', array_slice($words, $i));
            if (isset($baseIndex[$tail])) {
                return $baseIndex[$tail];
            }
        }
        return -1;
    };

    $rows = [];
    $seen = [];
    $addRow = static function (string $name, string $effect) use (&$rows, &$seen, $steamItems, $manncoPrices, $manncoUrls, $manncoVolumes, $findBase, $schema, $usdToEur, $skinport, $dmarket): void {
        $key = $name . '|' . $effect;
        // Some Mannco names carry a line break ("'X' War Paint\nCivilian
        // Grade ..."); the key keeps the original, the shown name does not.
        $priceKey = $key;
        $name = trim((string)preg_replace('/\s+/', ' ', $name));
        $key = $name . '|' . $effect;
        if (isset($seen[$key])) {
            return;
        }
        $seen[$key] = true;
        $steam = $effect === '' ? ($steamItems[$name] ?? null) : null;
        $b = $findBase($name);
        $type = $steam['t'] ?? ($b >= 0 ? (string)$schema[$b][2] : '');
        $row = [
            'n' => $name,
            'e' => $effect,
            'c' => tf2Category($name, (string)$type, $effect),
            'q' => $steam && ($steam['q'] ?? '') !== '' ? (string)$steam['q'] : tf2QualityColor($name, $effect),
            'b' => $b,
        ];
        if ($steam) {
            $row['i'] = (string)($steam['i'] ?? '');
            $row['l'] = (int)($steam['l'] ?? 0);
            if (($steam['p'] ?? 0) > 0) {
                $row['s'] = round(((int)$steam['p'] / 100) * $usdToEur, 2);
            }
        } elseif ($effect !== '' && isset($steamItems[$name])) {
            // Steam lists an unusual under its plain name with every effect
            // together: the listing count and icon apply to the effect row,
            // the price (cheapest effect) does not.
            $row['i'] = (string)($steamItems[$name]['i'] ?? '');
            $row['l'] = (int)($steamItems[$name]['l'] ?? 0);
        }
        if (isset($manncoPrices[$priceKey])) {
            $row['m'] = (float)$manncoPrices[$priceKey];
        } elseif (isset($manncoPrices[$key])) {
            $row['m'] = (float)$manncoPrices[$key];
        }
        // mu = the item's mannco.store page slug (/item/<mu>). Mannco lists
        // the non-craftable twin under the same name with the slug prefixed
        // "uncraftable-"; a craftable row never points at that one.
        $mu = (string)($manncoUrls[$priceKey] ?? $manncoUrls[$key] ?? '');
        if ($mu !== '' && !str_starts_with($name, 'Non-Craftable ') && str_starts_with($mu, '440-uncraftable-')) {
            $mu = '440-' . substr($mu, strlen('440-uncraftable-'));
        }
        if ($mu !== '') {
            $row['mu'] = $mu;
        }
        // mq = units in stock on Mannco.store.
        $mq = (int)($manncoVolumes[$priceKey] ?? $manncoVolumes[$key] ?? 0);
        if ($mq > 0) {
            $row['mq'] = $mq;
        }
        // Skinport and DMarket list effect-less titles only.
        $sp = $effect === '' ? ($skinport[$name] ?? null) : null;
        if ($sp && ($sp['p'] ?? 0) > 0) {
            $row['k'] = (float)$sp['p'];
            $row['kq'] = (int)($sp['q'] ?? 0);
        }
        $dm = $effect === '' ? ($dmarket[$name] ?? null) : null;
        if ($dm && ($dm['p'] ?? 0) > 0) {
            $row['d'] = (float)$dm['p'];
            $row['dq'] = (int)($dm['q'] ?? 0);
        }
        $row['g'] = tf2MarketCategory($name, $effect, $b >= 0 ? (array)$schema[$b] : [], (string)($sp['c'] ?? ''));
        $rows[] = $row;
    };

    // Mannco's two lists are disjoint: outofstock=0 is what is in stock (with
    // prices), outofstock=1 is everything that is not. Together they are its
    // whole TF2 item list. In-stock first, so a duplicate keeps its price row.
    foreach ($manncoPrices as $key => $_) {
        $cut = strrpos((string)$key, '|');
        $addRow(substr((string)$key, 0, $cut), substr((string)$key, $cut + 1));
    }
    foreach ($manncoAll as $entry) {
        $addRow((string)$entry[0], (string)$entry[1]);
    }
    foreach ($steamItems as $name => $_) {
        $addRow((string)$name, '');
    }
    foreach ($skinport as $name => $_) {
        $addRow((string)$name, '');
    }
    // Most listed on Steam first; items the Steam pass has not reached yet
    // follow by Mannco price (valuable, traded items before junk), then name.
    usort($rows, static function ($a, $b) {
        return (($b['l'] ?? 0) <=> ($a['l'] ?? 0))
            ?: (($b['m'] ?? $b['s'] ?? 0) <=> ($a['m'] ?? $a['s'] ?? 0))
            ?: strcmp($a['n'], $b['n']);
    });

    $payload = [
        'game' => 'tf2',
        'generated_at' => gmdate(DATE_ATOM),
        'icon_base' => 'https://community.akamai.steamstatic.com/economy/image/',
        'count' => count($rows),
        'steam_items' => count($steamItems),
        'bases' => $schema,
        'items' => $rows,
    ];
    $json = (string)json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    file_put_contents($files['catalog'], $json);
    file_put_contents($files['catalog'] . '.gz', gzencode($json, 9));
    // Compact index for the AI chat (tf2_ai_helpers.php): priced items only,
    // a few MB instead of the catalog, decoded on every TF2 turn. Columns 6+
    // feed the chat's item cards: base index, quality colour, Skinport and
    // DMarket prices. No images (11 MB of icon paths): a card reads its
    // image from the item shard below.
    $ai = [];
    foreach ($rows as $r) {
        if (!isset($r['m']) && !isset($r['s'])) {
            continue;
        }
        $ai[] = [$r['n'], $r['e'], $r['c'], $r['m'] ?? null, $r['s'] ?? null, $r['l'] ?? 0, (int)($r['b'] ?? -1), (string)($r['q'] ?? ''), $r['k'] ?? null, $r['d'] ?? null, (string)($r['mu'] ?? ''), (string)($r['g'] ?? '')];
    }
    file_put_contents(dirname($files['catalog']) . '/ai-index.json', json_encode([
        'generated_at' => gmdate(DATE_ATOM),
        'fields' => ['name', 'effect', 'category', 'mannco_eur', 'steam_eur', 'steam_listings', 'base', 'quality_color', 'skinport_eur', 'dmarket_eur', 'mannco_url', 'market_category'],
        'items' => $ai,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

    // TF2 Deals (tf2-deals.html): every item priced on at least two of the
    // four markets. Row: [name, category, quality, image, steam, skinport,
    // mannco, dmarket, steam listings]. Image is the Steam icon path, or the
    // schema image URL prefixed with "!".
    $deals = [];
    foreach ($rows as $r) {
        if ($r['e'] !== '') {
            continue;
        }
        $have = array_filter([$r['s'] ?? null, $r['k'] ?? null, $r['m'] ?? null, $r['d'] ?? null], static fn($p) => $p !== null && $p > 0);
        if (count($have) < 2) {
            continue;
        }
        $img = (string)($r['i'] ?? '');
        if ($img === '' && ($r['b'] ?? -1) >= 0) {
            $img = '!' . (string)$schema[$r['b']][1];
        }
        $deals[] = [$r['n'], $r['g'], $r['q'], $img, $r['s'] ?? null, $r['k'] ?? null, $r['m'] ?? null, $r['d'] ?? null, $r['l'] ?? 0, (int)($r['b'] ?? -1), (string)($r['mu'] ?? '')];
    }
    $dealsJson = (string)json_encode([
        'generated_at' => gmdate(DATE_ATOM),
        'icon_base' => 'https://community.akamai.steamstatic.com/economy/image/',
        'fields' => ['name', 'category', 'quality', 'image', 'steam', 'skinport', 'mannco', 'dmarket', 'steam_listings', 'base', 'mannco_url'],
        'items' => $deals,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    file_put_contents($files['deals'], $dealsJson);
    file_put_contents($files['deals'] . '.gz', gzencode($dealsJson, 9));
    tf2Log(sprintf('merge: %d deals rows (2+ markets), %.1f MB gz', count($deals), filesize($files['deals'] . '.gz') / 1048576));

    tf2AttachHistory($rows, $files);

    // Item pages (tf2-item.html): the catalog split into ~300 shards so a
    // page fetches only the family it needs. Key: "b<base % 256>" for rows
    // with a schema base (every quality / effect / wear of one item lands in
    // the same shard), else "n<djb2(name) % 64>". tf2ShardKey mirrors
    // shardKey() in react/tf2-item-page.jsx.
    $shards = [];
    foreach ($rows as $r) {
        $shards[tf2ShardKey((int)($r['b'] ?? -1), (string)$r['n'])][] = $r;
    }
    $shardDir = dirname($files['catalog']) . '/items';
    if (!is_dir($shardDir)) {
        mkdir($shardDir, 0775, true);
    }
    $shardBytes = 0;
    foreach ($shards as $key => $list) {
        $baseIds = array_values(array_unique(array_filter(array_map(static fn($r) => (int)($r['b'] ?? -1), $list), static fn($b) => $b >= 0)));
        $bases = [];
        foreach ($baseIds as $b) {
            $bases[$b] = $schema[$b];
        }
        $json = (string)json_encode([
            'key' => $key,
            'icon_base' => 'https://community.akamai.steamstatic.com/economy/image/',
            'bases' => $bases,
            'items' => $list,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        file_put_contents($shardDir . '/' . $key . '.json.gz', gzencode($json, 9));
        $shardBytes += filesize($shardDir . '/' . $key . '.json.gz');
    }
    tf2Log(sprintf('merge: %d item shards, %.1f MB gz total', count($shards), $shardBytes / 1048576));
    // Tiny summary for the navbar game switcher ("72,925 items" under TF2).
    // distinct_items counts each item once, the way the CS2 figure counts one
    // page per item: unusual effects and war paint wears fold into one entry
    // (72,925 priced variants -> ~33k items). This is the switcher's number.
    $priced = 0;
    $distinct = [];
    foreach ($rows as $r) {
        if (isset($r['s']) || isset($r['k']) || isset($r['m']) || isset($r['d'])) {
            $priced++;
            $distinct[preg_replace('/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle Scarred)\)$/', '', $r['n'])] = true;
        }
    }
    tf2WriteJson(dirname($files['catalog']) . '/summary.json', [
        'generated_at' => gmdate(DATE_ATOM),
        'items' => count($rows),
        'priced_items' => $priced,
        'distinct_items' => count($distinct),
    ]);
    tf2WriteSnapshotAndTicker($rows, $files);

    $g = array_count_values(array_column($rows, 'g'));
    arsort($g);
    tf2Log('merge: market categories ' . json_encode($g));

    $counts = array_count_values(array_column($rows, 'c'));
    arsort($counts);
    tf2Log(sprintf(
        'merge: %d items, %d with Mannco price, %d with Steam price, %d with image; %.1f MB (%.1f MB gz)',
        count($rows),
        count(array_filter($rows, fn($r) => isset($r['m']))),
        count(array_filter($rows, fn($r) => isset($r['s']))),
        count(array_filter($rows, fn($r) => ($r['b'] ?? -1) >= 0 || ($r['i'] ?? '') !== '')),
        strlen($json) / 1048576,
        filesize($files['catalog'] . '.gz') / 1048576
    ));
    tf2Log('merge: categories ' . json_encode($counts));
}

$merge = static function () use ($files, $usdToEur): void {
    tf2Merge($files, $usdToEur);
};

if ($mode === 'all' || $mode === 'skinport') {
    tf2ImportSkinport($files, $root);
}
if ($mode === 'dmarket') {
    tf2ImportDmarket($files, $usdToEur);
}
if ($mode === 'all' || $mode === 'mannco') {
    tf2ImportMannco($files, $manncoConfig, $usdToEur);
}
if ($mode === 'all' || $mode === 'schema') {
    tf2ImportSchema($files, $steamWebKey);
}
if ($mode === 'steam') {
    tf2ImportSteam($files, $merge);
}
$merge();
