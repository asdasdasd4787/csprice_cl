<?php
declare(strict_types=1);

$items = [
    ['MAG-7 | Insomnia', 'Factory New'],
    ['AK-47 | Cartel', 'Factory New'],
    ['CZ75-Auto | Eco', 'Factory New'],
    ['P250 | Apep\'s Curse', 'Factory New'],
    ['Desert Eagle | Blue Ply', 'Factory New'],
    ['M4A1-S | Black Lotus', 'Factory New'],
    ['Glock-18 | Water Elemental', 'Factory New'],
    ['AWP | Asiimov', 'Field-Tested'],
    ['MP5-SD | Agent', 'Factory New'],
    ['USP-S | Kill Confirmed', 'Factory New'],
];

$failures = [];
$ok = 0;

foreach ($items as [$name, $wear]) {
    $url = 'http://localhost/csgo_price_tracker/get_market_chart_bundle.php?' . http_build_query([
        'lookup_name' => $name,
        'wear' => $wear,
        'range' => 'ALL',
        'source' => 'all',
        'item_id' => 1,
    ]);

    $ctx = stream_context_create(['http' => ['timeout' => 45]]);
    $json = @file_get_contents($url, false, $ctx);
    $bundle = is_string($json) ? json_decode($json, true) : null;
    if (!is_array($bundle) || empty($bundle['success'])) {
        $failures[] = "{$name}: bundle request failed";
        continue;
    }

    $shapes = [];
    foreach (['steam', 'skinport', 'csfloat', 'white_market', 'dmarket'] as $source) {
        $points = $bundle['series'][$source]['points'] ?? [];
        $count = count($points);
        if ($count < 2) {
            $failures[] = "{$name}: {$source} has {$count} points";
            continue;
        }
        $first = (float)($points[0]['price'] ?? 0);
        $last = (float)($points[$count - 1]['price'] ?? 0);
        $mid = (float)($points[(int)floor($count / 2)]['price'] ?? 0);
        $shapes[$source] = $first > 0
            ? round($mid / $first, 4) . ':' . round($last / $first, 4)
            : 'flat';
    }

    $uniqueShapes = array_unique(array_values($shapes));
    if (count($uniqueShapes) <= 1 && count($shapes) >= 2) {
        $failures[] = "{$name}: all providers share identical chart shape";
    } else {
        $ok++;
        echo "OK  {$name}  steam=" . ($shapes['steam'] ?? '?') . " csfloat=" . ($shapes['csfloat'] ?? '?') . " wm=" . ($shapes['white_market'] ?? '?') . PHP_EOL;
    }
}

echo PHP_EOL . "Passed shape check: {$ok}/" . count($items) . PHP_EOL;
if ($failures) {
    echo "Issues:" . PHP_EOL;
    foreach ($failures as $failure) {
        echo " - {$failure}" . PHP_EOL;
    }
    exit(1);
}

echo "All chart bundles look distinct and populated." . PHP_EOL;
