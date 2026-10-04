<?php
declare(strict_types=1);
/**
 * Builds assets/data/ticker-pool.json - the pool the home page price strip
 * draws from. Each entry is a real item with a real 30-day price change.
 *
 * Source is assets/roi-price-cache/steam_*.json, the same per-item Steam cache
 * the item charts use. Only a few hundred of those ~7k files carry a
 * price_history array; an item without one cannot get a real percentage, so it
 * is skipped rather than guessed at.
 *
 * Only items that already have a generated page (scripts/build_item_urls.php)
 * are kept, so every row in the strip links somewhere real.
 *
 * Usage:
 *   php scripts/build_ticker_pool.php
 *
 * Re-run it after refreshing the price cache; the strip is only as fresh as
 * this file.
 */

require_once __DIR__ . '/item_url_slug.php';

const TICKER_RANGE_DAYS = 30;
const TICKER_MIN_PRICE  = 1.00;  // EUR - below this the moves are cent-noise
const TICKER_MAX_ABS_PCT = 150.0; // drop implausible jumps from thin history
const TICKER_MAX_ITEMS  = 200;

// The phone home screen draws a sparkline per mover and one for the market as a
// whole. Both are sampled here rather than fetched at runtime: the history is
// already in these files, so the screen needs no extra request.
const TICKER_SPARK_POINTS = 26;
const TICKER_INDEX_BASE   = 1000.0;

$root = dirname(__DIR__);
$files = glob($root . '/assets/roi-price-cache/steam_*.json') ?: [];
if (!$files) {
    fwrite(STDERR, "No steam_*.json files in assets/roi-price-cache/.\n");
    exit(1);
}

$cutoff = time() - TICKER_RANGE_DAYS * 86400;

/** Newest history point at or before the cutoff. */
function tickerBaseline(array $history, int $cutoff): ?array
{
    $best = null;
    foreach ($history as $point) {
        if (!is_array($point) || !isset($point['date'], $point['price'])) {
            continue;
        }
        if (!is_numeric($point['price']) || (float)$point['price'] <= 0) {
            continue;
        }
        $ts = strtotime((string)$point['date'] . ' 00:00:00 UTC');
        if ($ts === false || $ts > $cutoff) {
            continue;
        }
        if ($best === null || $ts > $best['ts']) {
            $best = ['ts' => $ts, 'price' => (float)$point['price']];
        }
    }
    return $best;
}

/**
 * Prices at fixed sample timestamps: for each sample, the newest history point
 * at or before it, so a series with gaps still reads as a flat line rather than
 * a hole. Returns null when the item has nothing at or before the first sample.
 *
 * @param list<int> $samples
 * @return list<float>|null
 */
function tickerSampleSeries(array $history, array $samples, float $current): ?array
{
    $points = [];
    foreach ($history as $point) {
        if (!is_array($point) || !isset($point['date'], $point['price'])) {
            continue;
        }
        if (!is_numeric($point['price']) || (float)$point['price'] <= 0) {
            continue;
        }
        $ts = strtotime((string)$point['date'] . ' 00:00:00 UTC');
        if ($ts === false) {
            continue;
        }
        $points[$ts] = (float)$point['price'];
    }
    if (!$points) {
        return null;
    }
    ksort($points);

    $series = [];
    foreach ($samples as $index => $sampleTs) {
        $value = null;
        foreach ($points as $ts => $price) {
            if ($ts > $sampleTs) {
                break;
            }
            $value = $price;
        }
        if ($value === null) {
            // Nothing that old: without a starting price the series cannot be
            // compared against anything, so the item gets no sparkline.
            return null;
        }
        // The last sample is "now", where the live price beats the last stored
        // history point.
        $series[] = round($index === count($samples) - 1 ? $current : $value, 4);
    }

    return $series;
}

$stats = ['files' => count($files), 'history' => 0, 'priced' => 0, 'page' => 0, 'spark' => 0];
$byUrl = [];

// Sample timestamps shared by every series, so the per-item sparklines and the
// index line up day for day.
$now = time();
$samples = [];
for ($i = 0; $i < TICKER_SPARK_POINTS; $i++) {
    $samples[] = (int)round($cutoff + (($now - $cutoff) * $i) / (TICKER_SPARK_POINTS - 1));
}
// Every item with usable history feeds the index, not just the movers that
// survive the cut below - an index of the busiest movers would not describe the
// market.
$indexRatios = array_fill(0, TICKER_SPARK_POINTS, []);

foreach ($files as $file) {
    $raw = @file_get_contents($file);
    // Cheap reject before json_decode: most files have "price_history":null.
    if ($raw === false || strpos($raw, '"price_history":[') === false) {
        continue;
    }
    $data = json_decode($raw, true);
    if (!is_array($data) || !is_array($data['price_history'] ?? null)) {
        continue;
    }
    $stats['history']++;

    $name = trim((string)($data['market_hash_name'] ?? ''));
    $current = is_numeric($data['current_price'] ?? null) ? (float)$data['current_price'] : 0.0;
    if ($name === '' || $current < TICKER_MIN_PRICE) {
        continue;
    }

    $baseline = tickerBaseline($data['price_history'], $cutoff);
    if ($baseline === null) {
        continue;
    }
    $pct = round((($current - $baseline['price']) / $baseline['price']) * 100, 2);
    if (abs($pct) > TICKER_MAX_ABS_PCT) {
        continue;
    }
    $stats['priced']++;

    // Feed the index before the "has a page" filter: an item without a
    // generated page still moved the market.
    $series = tickerSampleSeries($data['price_history'], $samples, $current);
    if ($series !== null && $series[0] > 0) {
        foreach ($series as $i => $value) {
            $indexRatios[$i][] = $value / $series[0];
        }
    }

    $path = itemUrlPrettyPath($name);
    if ($path === '') {
        continue;
    }
    $stats['page']++;

    // Relative, not "/skins/...": the home page is the only page that shows the
    // strip, and it is served both from a domain root and from a subfolder
    // (localhost/csgo_price_tracker/). A leading slash 404s in the latter.
    //
    // One row per item page: the five wears share a page, so keep whichever
    // wear moved most rather than listing the same page five times.
    $url = $path . '/';
    if (isset($byUrl[$url]) && abs($byUrl[$url]['pct']) >= abs($pct)) {
        continue;
    }

    // The strip shows the item, not the exterior - the page covers all wears.
    $display = (string)preg_replace(
        '/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/iu',
        '',
        $name
    );
    $display = trim(str_replace(['StatTrak™', '★'], ['StatTrak', ''], $display));

    $entry = [
        'name'  => $display,
        'pct'   => $pct,
        'price' => round($current, 2),
        'url'   => $url,
    ];
    if ($series !== null) {
        // Two decimals is plenty at 30px tall and keeps the file small.
        $entry['spark'] = array_map(static fn(float $v): float => round($v, 2), $series);
        $stats['spark']++;
    }
    $byUrl[$url] = $entry;
}

// Busiest movers first, then cut - a strip of flat 0.1% rows is not worth
// showing. The page picks at random from whatever survives.
$items = array_values($byUrl);
usort($items, static fn(array $a, array $b): int => abs($b['pct']) <=> abs($a['pct']));
$items = array_slice($items, 0, TICKER_MAX_ITEMS);

// The index: every sampled item weighted equally, each one measured against its
// own price 30 days ago, then expressed against a base of 1000. It says how the
// average tracked item moved over the window - not a market cap.
$index = null;
$indexSamples = count($indexRatios[0]);
if ($indexSamples >= 25) {
    $points = [];
    foreach ($indexRatios as $ratios) {
        $points[] = round(TICKER_INDEX_BASE * (array_sum($ratios) / max(1, count($ratios))), 2);
    }
    $first = $points[0];
    $last = $points[count($points) - 1];
    $index = [
        'base'         => TICKER_INDEX_BASE,
        'value'        => $last,
        'pct'          => $first > 0 ? round((($last - $first) / $first) * 100, 2) : 0.0,
        'sample_count' => $indexSamples,
        'points'       => $points,
    ];
}

$outDir = $root . '/assets/data';
if (!is_dir($outDir)) {
    mkdir($outDir, 0755, true);
}
$outFile = $outDir . '/ticker-pool.json';
file_put_contents($outFile, json_encode([
    'generated'  => gmdate('c'),
    'range_days' => TICKER_RANGE_DAYS,
    'count'      => count($items),
    'index'      => $index,
    'items'      => $items,
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

printf(
    "scanned %d, with history %d, priced >= %.2f %d, with a page %d, written %d (sparklines %d)\n",
    $stats['files'], $stats['history'], TICKER_MIN_PRICE, $stats['priced'], $stats['page'], count($items), $stats['spark']
);
if ($index !== null) {
    printf("index: %.2f (%+.2f%% over %dd, %d items)\n", $index['value'], $index['pct'], TICKER_RANGE_DAYS, $index['sample_count']);
} else {
    printf("index: not enough sampled items\n");
}
printf("-> %s\n", $outFile);
