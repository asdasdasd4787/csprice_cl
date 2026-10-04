<?php
/**
 * Warms the chart-bundle cache on csprice.eu (see market_chart_bundle_cache.php).
 *
 * The item page fires two chart requests on load (range ALL + 1Y, source all)
 * for the wear in the market hash name. A cold build takes 7–25 s on the
 * host; a cached one ~0.1 s. Run this from your PC after a deploy or a data
 * refresh so the most listed items are instant for the first visitor too.
 *
 * Usage (from the project folder):
 *   C:\xampp\php\php.exe scripts\warm_chart_bundles.php 300
 *   C:\xampp\php\php.exe scripts\warm_chart_bundles.php 300 https://csprice.eu
 *
 * Items come from assets/steam-market-cache/listing_counts.json, most listed
 * first. Four requests run at a time.
 */
declare(strict_types=1);

$count = max(1, (int)($argv[1] ?? 300));
$base = rtrim((string)($argv[2] ?? 'https://csprice.eu'), '/');
$countsPath = dirname(__DIR__) . '/assets/steam-market-cache/listing_counts.json';
$map = json_decode((string)@file_get_contents($countsPath), true)['map'] ?? [];
if (!$map) {
    fwrite(STDERR, "No listing counts at $countsPath\n");
    exit(1);
}

$rows = [];
foreach ($map as $name => $row) {
    $rows[] = ['name' => (string)$name, 'listings' => (int)($row['listings'] ?? 0)];
}
usort($rows, static fn($a, $b) => $b['listings'] <=> $a['listings']);

$wears = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
$jobs = [];
$seen = [];
foreach ($rows as $row) {
    $name = $row['name'];
    $wear = '';
    $lookup = $name;
    foreach ($wears as $w) {
        if (str_ends_with($name, " ($w)")) {
            $wear = $w;
            $lookup = substr($name, 0, -strlen(" ($w)"));
            break;
        }
    }
    $key = mb_strtolower($lookup . '|' . $wear);
    if (isset($seen[$key])) {
        continue;
    }
    $seen[$key] = true;
    foreach (['ALL', '1Y'] as $range) {
        $jobs[] = $base . '/get_market_chart_bundle.php?' . http_build_query([
            'lookup_name' => $lookup,
            'wear' => $wear,
            'range' => $range,
            'source' => 'all',
            'item_id' => 1,
        ]);
    }
    if (count($seen) >= $count) {
        break;
    }
}
printf("%d requests for %d items against %s\n", count($jobs), count($seen), $base);

$mh = curl_multi_init();
$done = 0;
$hits = 0;
$built = 0;
$fail = 0;
$next = 0;
$start = microtime(true);
$add = static function () use (&$next, $jobs, $mh): void {
    if ($next >= count($jobs)) {
        return;
    }
    $ch = curl_init($jobs[$next++]);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_TIMEOUT => 180,
        CURLOPT_ENCODING => 'gzip',
        CURLOPT_USERAGENT => 'csprice-cache-warmer/1.0',
    ]);
    curl_multi_add_handle($mh, $ch);
};
for ($i = 0; $i < 4; $i++) {
    $add();
}
do {
    $status = curl_multi_exec($mh, $running);
    if ($status > CURLM_OK) {
        break;
    }
    while (($info = curl_multi_info_read($mh)) !== false) {
        $ch = $info['handle'];
        $resp = (string)curl_multi_getcontent($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $cache = preg_match('/^X-Chart-Cache:\s*(\w+)/mi', $resp, $m) ? strtolower($m[1]) : '?';
        if ($code === 200 && $cache === 'hit') {
            $hits++;
        } elseif ($code === 200) {
            $built++;
        } else {
            $fail++;
        }
        $done++;
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
        if ($done % 20 === 0) {
            printf("%d/%d | cached already %d | built %d | failed %d | %.0fs\n", $done, count($jobs), $hits, $built, $fail, microtime(true) - $start);
        }
        $add();
    }
    if ($running) {
        curl_multi_select($mh, 1.0);
    }
} while ($running || $next < count($jobs));
printf("finished: %d requests | cached already %d | built %d | failed %d | %.0fs\n", $done, $hits, $built, $fail, microtime(true) - $start);
