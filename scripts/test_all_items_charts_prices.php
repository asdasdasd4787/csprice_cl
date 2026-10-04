<?php
declare(strict_types=1);

set_time_limit(0);
ini_set('max_execution_time', '0');

define('STEAM_WEAR_LIB_ONLY', true);
require_once __DIR__ . '/../get_steam_wear_prices.php';
require_once __DIR__ . '/../app_bootstrap.php';
require_once __DIR__ . '/../dmarket_helpers.php';

$catalogFile = __DIR__ . '/../assets/steam-market-cache/roi_catalog.json';
$data = json_decode((string)file_get_contents($catalogFile), true);
$allItems = is_array($data['items'] ?? null) ? $data['items'] : [];

$wearLabels = STEAM_WEAR_LABELS;
$providerIds = ['csfloat', 'white_market', 'dmarket'];

function catalogBaseName(array $item): string
{
    $name = trim((string)($item['display_name'] ?? $item['market_hash_name'] ?? ''));
    if ($name === '') {
        return '';
    }
    if (preg_match('/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i', $name)) {
        $name = trim(preg_replace('/\s+\([^)]+\)$/', '', $name));
    }
    return $name;
}

function itemHasWearVariants(string $baseName): bool
{
    return $baseName !== '' && str_contains($baseName, '|');
}

function testWearPricesForItem(string $baseName): array
{
    $wearList = STEAM_WEAR_LABELS;
    $analystBatch = [];
    $marketNames = array_map(static fn (string $wear) => steamWearMarketName($baseName, $wear), $wearList);
    $stattrakNames = array_map(static fn (string $wear) => steamStatTrakMarketName($baseName, $wear), $wearList);
    $dbBatch = steamWearDbBatch(array_merge($marketNames, $stattrakNames));

    $qualityRows = [];
    foreach ($wearList as $wear) {
        $marketName = steamWearMarketName($baseName, $wear);
        $resolved = steamResolveWearPrice($marketName, false, $baseName, $wear, $dbBatch, $analystBatch);
        $qualityRows[] = [
            'wear' => $wear,
            'price' => $resolved['price'] ?? null,
            'volume' => (int)($resolved['volume'] ?? 0),
            'stattrak' => null,
        ];
    }

    $uniformWearPrice = steamWearDetectUniformListingPrice($qualityRows);
    if ($uniformWearPrice !== null) {
        return $qualityRows;
    }

    foreach ($wearList as $index => $wear) {
        $stName = steamStatTrakMarketName($baseName, $wear);
        $resolved = steamResolveWearPrice($stName, false, '', '', $dbBatch, null);
        if ($resolved !== null) {
            $qualityRows[$index]['stattrak'] = $resolved['price'];
        }
    }

    return $qualityRows;
}

function testSingleSteamPrice(string $marketName): ?float
{
    $resolved = steamResolveWearPrice($marketName, false, '', '', [], null);
    $price = isset($resolved['price']) ? (float)$resolved['price'] : 0.0;
    return $price > 0 ? $price : null;
}

function loadWhiteMarketLookup(): array
{
    $cacheFile = __DIR__ . '/../assets/white-market-cache/prices_730.json';
    if (!is_file($cacheFile)) {
        return [];
    }
    $payload = json_decode((string)file_get_contents($cacheFile), true);
    if (!is_array($payload)) {
        return [];
    }

    $lookup = [];
    foreach ($payload as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $name = trim((string)($entry['market_hash_name'] ?? $entry['name'] ?? ''));
        $price = (float)($entry['price'] ?? $entry['min_price'] ?? 0);
        if ($name !== '' && $price > 0) {
            $lookup[strtolower($name)] = $price;
        }
    }
    return $lookup;
}

function loadCsfloatLookup(): array
{
    $dir = __DIR__ . '/../assets/csfloat-cache';
    if (!is_dir($dir)) {
        return [];
    }

    $lookup = [];
    foreach (glob($dir . '/*.json') ?: [] as $file) {
        $payload = json_decode((string)file_get_contents($file), true);
        if (!is_array($payload)) {
            continue;
        }
        $name = trim((string)($payload['market_hash_name'] ?? $payload['name'] ?? ''));
        $price = (float)($payload['current_price'] ?? $payload['price'] ?? 0);
        if ($name !== '' && $price > 0) {
            $lookup[strtolower($name)] = $price;
        }
    }
    return $lookup;
}

function providerPriceFromLookup(array $lookup, string $marketHashName): ?float
{
    $key = strtolower(trim($marketHashName));
    if ($key === '' || !isset($lookup[$key])) {
        return null;
    }
    $price = (float)$lookup[$key];
    return $price > 0 ? $price : null;
}

function testProviderWearCoverage(string $baseName, array $steamWearPrices, array $whiteLookup, array $csfloatLookup, array $dmarketQuotes): array
{
    global $wearLabels;

    $issues = [];
    $counts = array_fill_keys(['csfloat', 'white_market', 'dmarket'], 0);
    $steamCount = count($steamWearPrices);

    if ($steamCount < 2) {
        return ['issues' => [], 'counts' => $counts, 'steam_count' => $steamCount];
    }

    foreach ($wearLabels as $wear) {
        $marketName = steamWearMarketName($baseName, $wear);
        $steamPrice = $steamWearPrices[$wear] ?? 0.0;
        if ($steamPrice <= 0) {
            continue;
        }

        $csfloatPrice = providerPriceFromLookup($csfloatLookup, $marketName);
        if ($csfloatPrice !== null) {
            $counts['csfloat']++;
            if ($csfloatPrice > $steamPrice * 8 || $csfloatPrice < $steamPrice * 0.02) {
                $issues[] = "csfloat {$wear} outlier vs steam ({$csfloatPrice} vs {$steamPrice})";
            }
        }

        $whitePrice = providerPriceFromLookup($whiteLookup, $marketName);
        if ($whitePrice !== null) {
            $counts['white_market']++;
            if ($whitePrice > $steamPrice * 8 || $whitePrice < $steamPrice * 0.02) {
                $issues[] = "white_market {$wear} outlier vs steam ({$whitePrice} vs {$steamPrice})";
            }
        }

        $dmarketQuote = $dmarketQuotes[$marketName] ?? null;
        $dmarketPrice = is_array($dmarketQuote) && !empty($dmarketQuote['available'])
            ? (float)($dmarketQuote['current_price'] ?? $dmarketQuote['price'] ?? 0)
            : 0.0;
        if ($dmarketPrice > 0) {
            $counts['dmarket']++;
            if ($dmarketPrice > $steamPrice * 8 || $dmarketPrice < $steamPrice * 0.02) {
                $issues[] = "dmarket {$wear} outlier vs steam ({$dmarketPrice} vs {$steamPrice})";
            }
        }
    }

    return ['issues' => $issues, 'counts' => $counts, 'steam_count' => $steamCount];
}

$wearItems = [];
$singleItems = [];
foreach ($allItems as $item) {
    $category = strtolower((string)($item['category'] ?? ''));
    if ($category === 'graffiti') {
        continue;
    }

    $baseName = catalogBaseName($item);
    if ($baseName === '') {
        continue;
    }

    if (itemHasWearVariants($baseName)) {
        $wearItems[$baseName] = true;
    } else {
        $singleItems[$baseName] = trim((string)($item['market_hash_name'] ?? $item['display_name'] ?? $baseName));
    }
}

$wearNames = array_keys($wearItems);
$singleNames = array_keys($singleItems);
sort($wearNames, SORT_NATURAL | SORT_FLAG_CASE);
sort($singleNames, SORT_NATURAL | SORT_FLAG_CASE);

$totalWear = count($wearNames);
$totalSingle = count($singleNames);
$total = $totalWear + $totalSingle;

echo "Catalog scope: {$total} non-graffiti items ({$totalWear} wear skins, {$totalSingle} single-price items)\n";

$whiteLookup = loadWhiteMarketLookup();
$csfloatLookup = loadCsfloatLookup();
echo 'Provider caches: white=' . count($whiteLookup) . ', csfloat=' . count($csfloatLookup) . "\n\n";

$wearFailures = [];
$wearOk = 0;
$providerFailures = [];
$providerChecked = 0;
$providerOk = 0;
$singleFailures = [];
$singleOk = 0;

$started = microtime(true);
echo "Phase 1: Steam wear prices for {$totalWear} wear skins...\n";

foreach ($wearNames as $index => $name) {
    $num = $index + 1;
    if ($num % 500 === 0 || $num === 1 || $num === $totalWear) {
        echo "  {$num}/{$totalWear} (" . round(microtime(true) - $started, 1) . "s)\n";
    }

    $rows = testWearPricesForItem($name);
    $wearPrices = [];
    $stPrices = [];
    foreach ($rows as $row) {
        $wear = (string)($row['wear'] ?? '');
        $price = isset($row['price']) ? round((float)$row['price'], 2) : 0.0;
        $st = isset($row['stattrak']) ? round((float)$row['stattrak'], 2) : 0.0;
        if ($price > 0) {
            $wearPrices[$wear] = $price;
        }
        if ($st > 0) {
            $stPrices[$wear] = $st;
        }
    }

    if (count($wearPrices) < 2) {
        $wearFailures[] = "{$name}: fewer than 2 wear prices";
        continue;
    }
    if (count($wearPrices) >= 3 && count(array_unique(array_values($wearPrices))) === 1) {
        $wearFailures[] = "{$name}: identical wear prices (likely stale listing cache)";
        continue;
    }
    if (count($stPrices) >= 3 && count(array_unique(array_values($stPrices))) === 1) {
        $wearFailures[] = "{$name}: identical StatTrak wear prices";
        continue;
    }

    $wearOk++;
}

echo PHP_EOL . "Phase 1 done: {$wearOk}/{$totalWear} passed in " . round(microtime(true) - $started, 1) . "s\n";
echo "Phase 2: single-price Steam checks for {$totalSingle} items...\n";

foreach ($singleNames as $index => $name) {
    $num = $index + 1;
    if ($num % 1000 === 0 || $num === 1 || $num === $totalSingle) {
        echo "  {$num}/{$totalSingle} (" . round(microtime(true) - $started, 1) . "s)\n";
    }

    $marketName = $singleItems[$name] ?: $name;
    $price = testSingleSteamPrice($marketName);
    if ($price === null) {
        $singleFailures[] = "{$name}: no Steam price";
        continue;
    }
    $singleOk++;
}

echo PHP_EOL . "Phase 2 done: {$singleOk}/{$totalSingle} passed in " . round(microtime(true) - $started, 1) . "s\n";
echo "Phase 3: marketplace wear coverage for {$totalWear} wear skins...\n";

$dmarketConfig = appConfig()['dmarket'] ?? [];
$providerBatchSize = 40;

foreach (array_chunk($wearNames, $providerBatchSize) as $batchIndex => $batch) {
    $marketNames = [];
    foreach ($batch as $baseName) {
        foreach ($wearLabels as $wear) {
            $marketNames[] = steamWearMarketName($baseName, $wear);
        }
    }
    $marketNames = array_values(array_unique($marketNames));
    $dmarketQuotes = dmarketFetchQuotes($marketNames, $dmarketConfig, [
        'cache_only' => true,
        'prefer_live' => false,
        'max_live_requests' => 0,
    ]);

    foreach ($batch as $baseName) {
        $providerChecked++;
        $rows = testWearPricesForItem($baseName);
        $wearPrices = [];
        foreach ($rows as $row) {
            $wear = (string)($row['wear'] ?? '');
            $price = isset($row['price']) ? round((float)$row['price'], 2) : 0.0;
            if ($price > 0) {
                $wearPrices[$wear] = $price;
            }
        }

        $result = testProviderWearCoverage($baseName, $wearPrices, $whiteLookup, $csfloatLookup, $dmarketQuotes);
        if ($result['issues']) {
            $providerFailures[] = $baseName . ': ' . implode('; ', $result['issues']);
            continue;
        }

        $providerOk++;
    }

    if ((($batchIndex + 1) % 25) === 0 || $batchIndex === 0) {
        echo '  batch ' . ($batchIndex + 1) . ' (' . round(microtime(true) - $started, 1) . "s)\n";
    }
}

$reportPath = __DIR__ . '/test_all_items_report.txt';
$report = "Scope: {$total} non-graffiti items\n";
$report .= "Wear Steam passed: {$wearOk}/{$totalWear}\n";
$report .= "Single Steam passed: {$singleOk}/{$totalSingle}\n";
$report .= "Provider wear checks passed: {$providerOk}/{$providerChecked}\n";
$report .= "Wear failures: " . count($wearFailures) . "\n";
$report .= "Single failures: " . count($singleFailures) . "\n";
$report .= "Provider failures: " . count($providerFailures) . "\n\n";
$report .= "=== Wear failures ===\n" . implode("\n", array_slice($wearFailures, 0, 200)) . "\n\n";
$report .= "=== Single failures ===\n" . implode("\n", array_slice($singleFailures, 0, 200)) . "\n\n";
$report .= "=== Provider failures ===\n" . implode("\n", array_slice($providerFailures, 0, 200)) . "\n";
file_put_contents($reportPath, $report);

echo PHP_EOL . "Wear Steam: {$wearOk}/{$totalWear} passed\n";
echo "Single Steam: {$singleOk}/{$totalSingle} passed\n";
echo "Provider wears: {$providerOk}/{$providerChecked} passed\n";
echo "Report: scripts/test_all_items_report.txt\n";
echo 'Elapsed: ' . round(microtime(true) - $started, 1) . "s\n";

$failed = $wearFailures || $singleFailures || $providerFailures;
exit($failed ? 1 : 0);
