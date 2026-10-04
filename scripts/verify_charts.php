<?php
/**
 * Samples items from every catalog category/rarity group and checks that
 * csprice.eu's chart bundle returns a real Steam series (>= 3 non-synthetic
 * points). Bad cached entries are rebuilt (refresh=1) and checked once more.
 *
 * Usage (from the project folder):
 *   C:\xampp\php\php.exe scripts\verify_charts.php 4
 *   C:\xampp\php\php.exe scripts\verify_charts.php 4 http://localhost/csgo_price_tracker
 *
 * Keep it gentle: 2 connections, HTTP/1.1 and a User-Agent — the host drops
 * requests without a User-Agent and resets extra HTTP/2 streams, and Steam
 * answers 429 to bursts of live history fetches (those items then show as
 * "no steam history" until the limit lifts).
 */
declare(strict_types=1);
$per = max(1, (int)($argv[1] ?? 4));
$base = rtrim((string)($argv[2] ?? 'https://csprice.eu'), '/');
$items = json_decode((string)file_get_contents(dirname(__DIR__) . '/assets/steam-market-cache/roi_catalog.json'), true)['items'] ?? [];
$byCat = [];
foreach ($items as $it) {
    $key = (string)($it['category'] ?? 'unknown') . '|' . preg_replace('/\s+.*/', '', (string)($it['type_note'] ?? ''));
    $byCat[$key][] = $it;
}
ksort($byCat);
mt_srand((int)date('Ymd'));
$wears = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
$jobs = [];
foreach ($byCat as $key => $rows) {
    shuffle($rows);
    foreach (array_slice($rows, 0, $per) as $it) {
        $name = (string)$it['market_hash_name'];
        $wear = (string)($it['selected_wear'] ?? '');
        $lookup = $name;
        foreach ($wears as $w) {
            if (str_ends_with($name, " ($w)")) { $lookup = substr($name, 0, -strlen(" ($w)")); if ($wear === '') $wear = $w; break; }
        }
        $jobs[] = ['key' => $key, 'name' => $name, 'url' => $base . '/get_market_chart_bundle.php?' . http_build_query(['lookup_name' => $lookup, 'wear' => $wear, 'range' => 'ALL', 'source' => 'all', 'item_id' => 1])];
    }
}
printf("%d items across %d groups against %s\n", count($jobs), count($byCat), $base);

function verdictFor(int $code, ?array $json, string $err): string {
    if ($code !== 200) return $err !== '' ? "curl: $err" : "http $code";
    $steam = (array)($json['series']['steam']['points'] ?? []);
    $real = array_values(array_filter($steam, fn($p) => empty($p['synthetic'])));
    return count($real) < 3 ? 'no steam history (' . count($real) . ' pts)' : 'ok';
}

function runBatch(array $jobs, int $parallel, callable $onDone): void {
    $mh = curl_multi_init();
    $next = 0; $handles = [];
    $add = function () use (&$next, $jobs, $mh, &$handles): void {
        if ($next >= count($jobs)) return;
        $job = $jobs[$next++];
        $ch = curl_init($job['url']);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 200, CURLOPT_ENCODING => 'gzip', CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1, CURLOPT_USERAGENT => 'csprice-chart-verify/1.0']);
        curl_multi_add_handle($mh, $ch);
        $handles[spl_object_id($ch)] = $job;
    };
    for ($i = 0; $i < $parallel; $i++) $add();
    do {
        $status = curl_multi_exec($mh, $running);
        if ($status > CURLM_OK) break;
        while (($info = curl_multi_info_read($mh)) !== false) {
            $ch = $info['handle'];
            $job = $handles[spl_object_id($ch)] ?? ['key' => '?', 'name' => '?', 'url' => ''];
            $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $err = (string)curl_error($ch);
            $json = json_decode((string)curl_multi_getcontent($ch), true);
            $onDone($job, $code, is_array($json) ? $json : null, $err);
            unset($handles[spl_object_id($ch)]);
            curl_multi_remove_handle($mh, $ch); curl_close($ch);
            $add();
        }
        if ($running) curl_multi_select($mh, 1.0);
    } while ($running || $next < count($jobs));
    curl_multi_close($mh);
}

$start = microtime(true); $done = 0; $ok = 0; $bad = [];
runBatch($jobs, 2, function ($job, $code, $json, $err) use (&$done, &$ok, &$bad, $jobs, $start) {
    $v = verdictFor($code, $json, $err);
    if ($v === 'ok') $ok++; else $bad[] = ['key' => $job['key'], 'name' => $job['name'], 'url' => $job['url'], 'verdict' => $v];
    $done++;
    if ($done % 25 === 0) printf("%d/%d ok=%d bad=%d %.0fs\n", $done, count($jobs), $ok, count($bad), microtime(true) - $start);
});
printf("pass 1: %d checked, ok=%d, bad=%d (%.0fs)\n", $done, $ok, count($bad), microtime(true) - $start);

if ($bad) {
    $rebuild = array_map(fn($b) => ['key' => $b['key'], 'name' => $b['name'], 'url' => $b['url'] . '&refresh=1'], $bad);
    runBatch($rebuild, 2, function () {});
    sleep(2);
    $recheck = array_map(fn($b) => ['key' => $b['key'], 'name' => $b['name'], 'url' => $b['url']], $bad);
    $stillBad = [];
    runBatch($recheck, 2, function ($job, $code, $json, $err) use (&$stillBad) {
        $v = verdictFor($code, $json, $err);
        if ($v !== 'ok') $stillBad[] = [$job['key'], $job['name'], $v];
    });
    printf("pass 2 (after rebuild): %d rechecked, still bad=%d\n", count($recheck), count($stillBad));
    foreach ($stillBad as [$key, $name, $v]) printf("  BAD [%s] %s -> %s\n", $key, $name, $v);
}
printf("total %.0fs\n", microtime(true) - $start);
