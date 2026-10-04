<?php
$json = file_get_contents(__DIR__ . '/tmp_bundle.json');
$bundle = json_decode($json, true);
echo 'success=' . (($bundle['success'] ?? false) ? 'yes' : 'no') . PHP_EOL;
foreach (['steam', 'skinport', 'csfloat', 'white_market', 'dmarket'] as $source) {
    $series = $bundle['series'][$source] ?? null;
    if (!$series) {
        echo "$source: missing" . PHP_EOL;
        continue;
    }
    $points = $series['points'] ?? [];
    $prices = array_column($points, 'price');
    $synthetic = 0;
    foreach ($points as $p) {
        if (!empty($p['synthetic'])) $synthetic++;
    }
    $min = $prices ? min($prices) : 0;
    $max = $prices ? max($prices) : 0;
    echo "$source: " . count($points) . " pts current=" . ($series['current_price'] ?? '') . " range=$min-$max synthetic=$synthetic" . PHP_EOL;
}

// Compare first 5 normalized price ratios between steam and csfloat
$steam = $bundle['series']['steam']['points'] ?? [];
$csf = $bundle['series']['csfloat']['points'] ?? [];
if (count($steam) >= 5 && count($csf) >= 5) {
    $steamNorm = array_map(fn($p, $i) => round($p['price'] / max(0.01, $steam[0]['price']), 4), array_slice($steam, 0, 5), range(0,4));
    $csfNorm = array_map(fn($p, $i) => round($p['price'] / max(0.01, $csf[0]['price']), 4), array_slice($csf, 0, 5), range(0,4));
    echo 'steam_shape=' . implode(',', $steamNorm) . PHP_EOL;
    echo 'csfloat_shape=' . implode(',', $csfNorm) . PHP_EOL;
    echo 'same_shape=' . ($steamNorm === $csfNorm ? 'yes' : 'no') . PHP_EOL;
}
