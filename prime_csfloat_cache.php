<?php
/**
 * Run this once in the browser to pre-fetch all CSFloat prices for weapon skins.
 * After it finishes, the deals page shows CSFloat prices instantly from cache.
 *
 * Access: http://localhost/csgo_price_tracker/prime_csfloat_cache.php
 */
declare(strict_types=1);
set_time_limit(600);
header('Content-Type: text/plain; charset=utf-8');
// Stream output immediately so you see progress in the browser
if (ob_get_level()) ob_end_clean();

function flush_out(string $line): void {
    echo $line . "\n";
    if (ob_get_level()) ob_flush();
    flush();
}

require __DIR__ . '/app_bootstrap.php';

$apiKey = trim((string)(appConfig()['csfloat']['api_key'] ?? ''));
if ($apiKey === '') {
    flush_out("ERROR: CSFloat API key is not set in config.local.php");
    exit(1);
}

// Load the ROI catalog
$catalogPath = __DIR__ . '/assets/steam-market-cache/roi_catalog.json';
if (!is_file($catalogPath)) {
    flush_out("ERROR: roi_catalog.json not found at $catalogPath");
    exit(1);
}
$catalog = json_decode((string)file_get_contents($catalogPath), true);
$items = is_array($catalog['items'] ?? null) ? $catalog['items'] : [];

// Filter to weapon skins only (the ones that have float values on CSFloat)
$skinSubFilters = ['pistols', 'rifles', 'smgs', 'knives', 'gloves', 'heavy', 'shotguns'];
$skins = array_filter($items, function(array $it) use ($skinSubFilters): bool {
    return $it['category'] === 'skins'
        || in_array($it['sub_filter'] ?? '', $skinSubFilters, true)
        || ($it['scope_filter'] ?? '') === 'armory';
});
$skinNames = array_values(array_map(fn($it) => (string)$it['market_hash_name'], $skins));
flush_out("Found " . count($skinNames) . " weapon skins to pre-fetch from CSFloat.");

$cacheDir = __DIR__ . '/assets/csfloat-cache';
if (!is_dir($cacheDir)) {
    mkdir($cacheDir, 0755, true);
}

// Skip already-cached items
$toFetch = [];
$cacheTtl = 86400;
foreach ($skinNames as $name) {
    $cacheFile = $cacheDir . '/' . md5($name) . '.json';
    if (is_file($cacheFile)) {
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        $age = time() - (int)filemtime($cacheFile);
        $ttl = !empty($cached['_no_listing']) ? 21600 : $cacheTtl;
        if ($age < $ttl) {
            continue; // still fresh
        }
    }
    $toFetch[] = $name;
}
flush_out("Cache hit: " . (count($skinNames) - count($toFetch)) . " | Fetching live: " . count($toFetch));

$headers = [
    'Accept: application/json',
    'Authorization: ' . $apiKey,
];

$fetched = 0;
$found   = 0;
$notFound = 0;
$errors  = 0;

$CHUNK = 8; // parallel requests per round
for ($offset = 0; $offset < count($toFetch); $offset += $CHUNK) {
    $batch = array_slice($toFetch, $offset, $CHUNK);
    $mh    = curl_multi_init();
    $handles = [];

    foreach ($batch as $name) {
        $url = 'https://csfloat.com/api/v1/listings?' . http_build_query([
            'market_hash_name' => $name,
            'limit'            => 1,
            'sort_by'          => 'lowest_price',
            'type'             => 'buy_now',
        ]);
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_USERAGENT      => 'CS2MarketTracker/1.0',
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $handles[$name] = $ch;
        curl_multi_add_handle($mh, $ch);
    }

    do {
        curl_multi_exec($mh, $running);
        if ($running > 0) curl_multi_select($mh, 0.5);
    } while ($running > 0);

    foreach ($handles as $name => $ch) {
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $body     = (string)(curl_multi_getcontent($ch) ?: '');
        $data     = json_decode($body, true);
        $listings = is_array($data['data'] ?? null) ? $data['data'] : [];
        $cacheFile = $cacheDir . '/' . md5($name) . '.json';

        $listings = array_values(array_filter($listings, static function (array $listing): bool {
            $priceCents = isset($listing['price']) ? (int)$listing['price'] : 0;
            $type = strtolower((string)($listing['type'] ?? $listing['listing_type'] ?? ''));
            $auctionLike = !empty($listing['auction'])
                || !empty($listing['is_auction'])
                || isset($listing['auction_ends_at'])
                || str_contains($type, 'auction');

            return $priceCents > 0 && !$auctionLike;
        }));

        if (!empty($listings) && $httpCode === 200) {
            $first      = $listings[0];
            $priceCents = isset($first['price']) ? (int)$first['price'] : null;
            $price      = $priceCents !== null ? round($priceCents / 100, 2) : null;
            $floatVal   = $first['item']['float_value'] ?? null;
            $wearName   = $first['item']['wear_name']   ?? '';
            $defIndex   = $first['item']['def_index']   ?? null;
            $listingType = (string)($first['type'] ?? $first['listing_type'] ?? 'buy_now');
            $item = [
                'market_hash_name'      => $name,
                'current_price'         => $price,
                'current_price_display' => $price !== null ? '$' . number_format($price, 2) : '—',
                'listings'              => 1,
                'listings_display'      => '1 listing',
                'source'                => 'csfloat',
                'source_label'          => 'CSFloat',
                'wear_name'             => $wearName,
                'float_value'           => $floatVal,
                'def_index'             => $defIndex,
                'listing_id'            => (string)($first['id'] ?? ''),
                'listing_type'          => $listingType,
                'state'                 => (string)($first['state'] ?? ''),
                '_no_listing'           => false,
                '_csfloat_buy_now'      => true,
                '_ignore_auctions_verified' => true,
                '_cached_at'            => time(),
            ];
            file_put_contents($cacheFile, (string)json_encode($item));
            $found++;
        } elseif ($httpCode === 429) {
            flush_out("  Rate limited — sleeping 5s...");
            sleep(5);
            $errors++;
        } else {
            $existing = is_file($cacheFile)
                ? json_decode((string)file_get_contents($cacheFile), true)
                : null;
            $keepExisting = is_array($existing)
                && empty($existing['_no_listing'])
                && isset($existing['current_price'])
                && (float)$existing['current_price'] > 0;

            if (!$keepExisting) {
                $miss = ['market_hash_name' => $name, '_no_listing' => true, '_cached_at' => time()];
                file_put_contents($cacheFile, (string)json_encode($miss));
            }
            $notFound++;
        }

        curl_multi_remove_handle($mh, $ch);
        $fetched++;
    }
    curl_multi_close($mh);

    if (($offset / $CHUNK) % 5 === 0) {
        flush_out("Progress: $fetched/" . count($toFetch) . " fetched — $found with price, $notFound no listing, $errors errors");
    }

    // Small delay between rounds to respect rate limits
    usleep(300000); // 300ms
}

flush_out("\n=== DONE ===");
flush_out("Total fetched: $fetched | With price: $found | No listing: $notFound | Errors: $errors");
flush_out("The deals page will now show CSFloat prices instantly from cache.");
