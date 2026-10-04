<?php
/**
 * Warms the chart bundles behind the Care Package "Price drop comparison"
 * chart on csprice.eu: every case / terminal / graffiti / tool reward and every
 * skin inside the collection rewards (the board and roll history pick from
 * these). Cached bundles answer in ~0.1 s; a cold one takes 5–25 s.
 *
 * Usage (from the project folder):
 *   C:\xampp\php\php.exe scripts\warm_carepackage_charts.php
 *   C:\xampp\php\php.exe scripts\warm_carepackage_charts.php https://csprice.eu 3
 *
 * The site also warms these itself in the background after each care-package
 * data request (get_carepackage_data.php?warm_charts=1); this script just does
 * it all at once, three requests at a time.
 */
declare(strict_types=1);

// Gentle by default: ONE request at a time with a pause between them, so the
// host never has more chart builds in flight than a single visitor would cause.
// Running this with real concurrency saturates the host's PHP workers and takes
// the site down — do not raise it.
$base = rtrim((string)($argv[1] ?? 'https://csprice.eu'), '/');
$parallel = max(1, min(2, (int)($argv[2] ?? 1)));
$pauseMs = max(0, (int)($argv[3] ?? 1500));

$fetch = static function (string $url): ?array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_USERAGENT => 'Mozilla/5.0 CSPRICE warm',
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
    ]);
    $body = curl_exec($ch);
    curl_close($ch);
    $decoded = is_string($body) ? json_decode($body, true) : null;
    return is_array($decoded) ? $decoded : null;
};

$payload = $fetch($base . '/get_carepackage_data.php');
if (!is_array($payload) || empty($payload['sources'])) {
    fwrite(STDERR, "Could not load care package data from $base\n");
    exit(1);
}

$names = [];
foreach ((array)$payload['sources'] as $source) {
    foreach ((array)($source['catalog'] ?? []) as $entries) {
        foreach ((array)$entries as $entry) {
            $n = trim((string)($entry['market_hash_name'] ?? $entry['name'] ?? ''));
            if ($n !== '') {
                $names[$n] = true;
            }
        }
    }
    foreach ((array)($source['rewards'] ?? []) as $reward) {
        $n = trim((string)($reward['market_hash_name'] ?? ''));
        if ($n !== '') {
            $names[$n] = true;
        }
        foreach ((array)($reward['items'] ?? []) as $item) {
            $n = trim((string)($item['market_hash_name'] ?? $item['name'] ?? ''));
            if ($n !== '') {
                $names[$n] = true;
            }
        }
    }
}
$names = array_keys($names);
$wears = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
$jobs = [];
foreach ($names as $name) {
    $lookup = $name;
    $wear = '';
    foreach ($wears as $w) {
        if (str_ends_with($name, " ($w)")) {
            $wear = $w;
            $lookup = substr($name, 0, -strlen(" ($w)"));
            break;
        }
    }
    $jobs[] = $base . '/get_market_chart_bundle.php?' . http_build_query([
        'lookup_name' => $lookup,
        'display_name' => $lookup,
        'wear' => $wear,
        'range' => '1Y',
        'source' => 'steam',
    ]);
}
printf("%d chart bundles to warm on %s (%d at a time, %dms pause)\n", count($jobs), $base, $parallel, $pauseMs);

$start = microtime(true);
$done = 0;
$hits = 0;
$misses = 0;
$errors = 0;
$queue = $jobs;
$multi = curl_multi_init();
$active = [];
$addJob = static function () use (&$queue, $multi, &$active): void {
    $url = array_shift($queue);
    if ($url === null) {
        return;
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_USERAGENT => 'Mozilla/5.0 CSPRICE warm',
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
    ]);
    curl_multi_add_handle($multi, $ch);
    $active[(int)$ch] = $url;
};
for ($i = 0; $i < $parallel; $i++) {
    $addJob();
}
do {
    $status = curl_multi_exec($multi, $running);
    if ($status !== CURLM_OK) {
        break;
    }
    while (($info = curl_multi_info_read($multi)) !== false) {
        $ch = $info['handle'];
        $response = (string)curl_multi_getcontent($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        if ($code >= 200 && $code < 300) {
            if (preg_match('/^X-Chart-Cache:\s*(hit|stale)/im', $response)) {
                $hits++;
            } else {
                $misses++;
            }
        } else {
            $errors++;
        }
        $done++;
        curl_multi_remove_handle($multi, $ch);
        curl_close($ch);
        unset($active[(int)$ch]);
        if ($pauseMs > 0) {
            usleep($pauseMs * 1000);
        }
        $addJob();
        if ($done % 20 === 0) {
            printf("  %d/%d (%.0fs)\n", $done, count($jobs), microtime(true) - $start);
        }
    }
    if ($running) {
        curl_multi_select($multi, 1.0);
    }
} while ($running || $queue);
curl_multi_close($multi);
printf("done in %.0fs: %d already cached, %d built now, %d errors\n", microtime(true) - $start, $hits, $misses, $errors);
