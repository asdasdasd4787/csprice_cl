<?php
declare(strict_types=1);
/**
 * Cron job: keeps the item pages' first-paint data warm on csprice.eu.
 *
 * Every item page preloads one request, item_bootstrap.php (chart bundles +
 * Steam wear table in one answer). A cached copy answers in ~0.1 s and stays
 * usable for a day (it refreshes itself in the background when older than
 * 5 minutes); a cold one takes 7-25 s because the host has to build every
 * chart. This job rebuilds the cache for the most listed items a slice at a
 * time, so the popular pages always have a copy and never start cold.
 *
 * Run it from the host's cron (Český hosting: Cron -> Přidat adresářový cron,
 * script scripts/cron_warm.php, every 15 minutes). CLI only.
 *
 *   php scripts/cron_warm.php                 one slice (default 40 items)
 *   php scripts/cron_warm.php 60              one slice of 60 items
 *   php scripts/cron_warm.php 40 https://csprice.eu
 *
 * With 40 items per run every 15 minutes, all ~500 most listed items are
 * rebuilt about every 3 hours, well inside the one-day window.
 *
 * Internal requests carry the gate's admin key as the X-CSPrice-Admin header
 * (read from access_config.local.php on the server, never printed), a
 * User-Agent (the host drops requests without one), use HTTP/1.1 and run two
 * at a time so the job never competes with visitors for PHP workers.
 */

// Only from a scheduler or a shell, never from a browser. The host's folder
// cron runs scripts through its CGI binary (PHP_SAPI "cgi-fcgi"), not the
// CLI, so "not a web request" is the test: no request method, no Host.
$isWebRequest = PHP_SAPI !== 'cli'
    && (isset($_SERVER['REQUEST_METHOD']) || isset($_SERVER['HTTP_HOST']));
if ($isWebRequest) {
    http_response_code(404);
    exit;
}

$root = dirname(__DIR__);
$slice = max(1, min(200, (int)($argv[1] ?? 40)));
$base = rtrim((string)($argv[2] ?? 'https://csprice.eu'), '/');
$budgetSeconds = 240;          // stay under the cron's max_execution_time
// One at a time: from 2026-09-27 07:12 the refreshes started failing, and two
// parallel 90 s requests per slot kept the host's few PHP workers busy long
// enough that every page (they all load JS through static.php) went blank for
// minutes after each run. See the circuit breaker below.
$concurrency = 1;
$maxConsecutiveFailures = 3;
$started = microtime(true);
@set_time_limit($budgetSeconds + 60);

$config = is_file($root . '/access_config.local.php') ? (require $root . '/access_config.local.php') : [];
$adminKey = is_array($config) ? trim((string)($config['admin_key'] ?? '')) : '';

// Most listed items first. Pretty skin pages preload wear=Factory New; every
// other item page preloads an empty wear (see scripts/build_item_urls.php).
$counts = json_decode((string)@file_get_contents($root . '/assets/steam-market-cache/listing_counts.json'), true);
$map = is_array($counts['map'] ?? null) ? $counts['map'] : [];
if (!$map) {
    fwrite(STDERR, "cron_warm: no listing counts, nothing to do\n");
    exit(0);
}
$wears = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
$rows = [];
foreach ($map as $name => $row) {
    $rows[] = ['name' => (string)$name, 'listings' => (int)($row['listings'] ?? 0)];
}
usort($rows, static fn($a, $b) => $b['listings'] <=> $a['listings']);
$items = [];
$seen = [];
foreach ($rows as $row) {
    $name = $row['name'];
    $lookup = $name;
    $wear = '';
    foreach ($wears as $w) {
        if (str_ends_with($name, " ($w)")) {
            $lookup = substr($name, 0, -strlen(" ($w)"));
            $wear = 'Factory New';
            break;
        }
    }
    $key = mb_strtolower($lookup);
    if (isset($seen[$key])) {
        continue;
    }
    $seen[$key] = true;
    $items[] = ['lookup_name' => $lookup, 'wear' => $wear];
}

// Rotate through the list: each run continues where the last one stopped.
$cursorFile = $root . '/assets/cache/cron_warm_cursor.json';
if (!is_dir(dirname($cursorFile))) {
    @mkdir(dirname($cursorFile), 0755, true);
}
$cursor = (int)(json_decode((string)@file_get_contents($cursorFile), true)['next'] ?? 0);
if ($cursor >= count($items)) {
    $cursor = 0;
}
$batch = array_slice($items, $cursor, $slice);
if (count($batch) < $slice) {
    $batch = array_merge($batch, array_slice($items, 0, $slice - count($batch)));
}

$headers = ['Accept: application/json', 'Accept-Encoding: gzip', 'User-Agent: csprice-cron-warm/1.0'];
if ($adminKey !== '') {
    $headers[] = 'X-CSPrice-Admin: ' . $adminKey;
}

// Health gate: if a cheap PHP request is already slow, the site is short of
// workers - warming now would only make visitors wait longer. Skip the run.
$probe = curl_init($base . '/access_status.php');
curl_setopt_array($probe, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 8,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
    CURLOPT_HTTPHEADER => $headers,
]);
curl_exec($probe);
$probeCode = (int)curl_getinfo($probe, CURLINFO_RESPONSE_CODE);
$probeTime = (float)curl_getinfo($probe, CURLINFO_TOTAL_TIME);
curl_close($probe);
if ($probeCode === 0 || $probeCode >= 500 || $probeTime > 4.0) {
    printf("cron_warm: skipped, site busy (probe HTTP %d in %.1f s)\n", $probeCode, $probeTime);
    exit(0);
}

$ok = 0;
$failed = 0;
$done = 0;
$failStreak = 0;
$tripped = false;
$multi = curl_multi_init();
$queue = $batch;
$active = 0;
$startOne = static function () use (&$queue, &$active, $multi, $base, $headers): void {
    $item = array_shift($queue);
    if ($item === null) {
        return;
    }
    $url = $base . '/item_bootstrap.php?' . http_build_query([
        'lookup_name' => $item['lookup_name'],
        'wear' => $item['wear'],
        'range' => 'ALL',
        'refresh' => '1',
    ]);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_ENCODING => '',
        CURLOPT_TIMEOUT => 90,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_HTTPHEADER => $headers,
    ]);
    curl_multi_add_handle($multi, $ch);
    $active++;
};

for ($i = 0; $i < $concurrency; $i++) {
    $startOne();
}
while ($active > 0) {
    curl_multi_exec($multi, $running);
    curl_multi_select($multi, 1.0);
    while ($info = curl_multi_info_read($multi)) {
        $ch = $info['handle'];
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $body = (string)curl_multi_getcontent($ch);
        $json = json_decode($body, true);
        // A refresh request rebuilds the cache and answers {"ok":true}.
        if ($code === 200 && is_array($json) && (!empty($json['ok']) || !empty($json['success']))) {
            $ok++;
            $failStreak = 0;
        } else {
            $failed++;
            $failStreak++;
        }
        $done++;
        curl_multi_remove_handle($multi, $ch);
        curl_close($ch);
        $active--;
        // Circuit breaker: repeated failures mean the refresh path (or the
        // host) is broken; stop instead of queueing 40 more slow requests.
        if ($failStreak >= $maxConsecutiveFailures) {
            $tripped = true;
        }
        // Stop starting new work when the time budget is spent or the
        // breaker tripped; what is already running finishes.
        if (!$tripped && microtime(true) - $started < $budgetSeconds) {
            $startOne();
        }
    }
}
curl_multi_close($multi);

$next = ($cursor + $done) % max(1, count($items));
@file_put_contents($cursorFile, json_encode(['next' => $next, 'at' => gmdate(DATE_ATOM), 'ok' => $ok, 'failed' => $failed]));
printf("cron_warm: %d warmed, %d failed, %d s, next start %d of %d%s\n", $ok, $failed, (int)(microtime(true) - $started), $next, count($items), $tripped ? ' (stopped: ' . $maxConsecutiveFailures . ' failures in a row)' : '');
