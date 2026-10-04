<?php

declare(strict_types=1);



require_once __DIR__ . '/get_roi_prices_cached.php';
require_once __DIR__ . '/price_cache_service.php';
require_once __DIR__ . '/lib/souvenir_skin_lookup.php';



const STEAM_WEAR_LABELS = [

    'Factory New',

    'Minimal Wear',

    'Field-Tested',

    'Well-Worn',

    'Battle-Scarred',

];

const STEAM_WEAR_LIVE_TABLE_TTL_SECONDS = 600;



function steamWearBaseName(string $lookupName): string

{

    $lookupName = trim($lookupName);

    if ($lookupName === '') {

        return '';

    }



    if (preg_match('/^(.*)\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i', $lookupName, $matches)) {

        return trim((string)$matches[1]);

    }



    return $lookupName;

}



function steamWearStripStarPrefix(string $baseName): string

{

    return trim(preg_replace('/^[\s★\*\x{2605}]+/u', '', trim($baseName)) ?? trim($baseName));

}



function steamWearNeedsStarPrefix(string $baseName): bool

{

    $baseName = steamWearStripStarPrefix($baseName);

    if ($baseName === '') {

        return false;

    }



    $lower = mb_strtolower($baseName);

    static $gloves = [

        'sport gloves', 'driver gloves', 'moto gloves', 'specialist gloves',

        'hand wraps', 'bloodhound gloves', 'broken fang gloves', 'hydra gloves',

    ];

    $weapon = strtolower(trim(explode('|', $baseName, 2)[0] ?? $baseName));

    if (in_array($weapon, $gloves, true) || str_contains($lower, 'gloves |')) {

        return true;

    }



    return (bool)preg_match(

        '/\b(knife|bayonet|karambit|dagger|navaja|stiletto|talon|ursus|falchion|bowie|butterfly|kukri|nomad|paracord|skeleton|shadow daggers|gut knife|flip knife|huntsman|classic knife|survival knife)\b/i',

        $lower

    );

}



function steamWearIsGloveItem(string $baseName): bool

{

    $baseName = steamWearStripStarPrefix(trim($baseName));

    if ($baseName === '') {

        return false;

    }



    $lower = mb_strtolower($baseName);

    static $gloves = [

        'sport gloves', 'driver gloves', 'moto gloves', 'specialist gloves',

        'hand wraps', 'bloodhound gloves', 'broken fang gloves', 'hydra gloves',

    ];

    $weapon = strtolower(trim(explode('|', $baseName, 2)[0] ?? $baseName));

    return in_array($weapon, $gloves, true) || str_contains($lower, 'gloves |');

}



function steamWearNormalizeOriginLookupKey(string $name): string

{

    $name = trim($name);

    $name = preg_replace('/^Souvenir\s+/iu', '', $name) ?? $name;

    $name = preg_replace('/^StatTrak™\s+/iu', '', $name) ?? $name;

    $name = preg_replace('/\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/iu', '', $name) ?? $name;

    return mb_strtolower(trim($name));

}



function steamWearIsCollectionOriginName(string $originName): bool

{

    $originName = trim($originName);

    if ($originName === '') {

        return false;

    }

    if (preg_match('/\bcase\b/i', $originName)) {

        return false;

    }

    if (preg_match('/\bcapsule\b/i', $originName)) {

        return false;

    }

    if (preg_match('/\bterminal\b/i', $originName)) {

        return false;

    }

    if (preg_match('/\bpack\b/i', $originName)) {

        return false;

    }

    return (bool)preg_match('/\bcollection\b/i', $originName);

}



function steamWearIsArmoryExclusiveOrigin(string $originName): bool

{

    $origin = trim($originName);

    if ($origin === '') {

        return false;

    }

    if (preg_match('/armory/i', $origin)) {

        return true;

    }

    return (bool)preg_match(

        '/\b(sport\s*&\s*field|graphic design|overpass 2024|train 2025|limited edition item)\b/i',

        $origin

    );

}



function steamWearOriginIsStatTrakDrop(string $originName): bool

{

    $origin = trim($originName);

    if ($origin === '') {

        return false;

    }

    return (bool)preg_match('/\b(case|capsule|terminal)\b/i', $origin);

}



function steamWearOriginIsStatTrakCollection(string $originName): bool

{

    $origin = trim($originName);

    if ($origin === '') {

        return false;

    }

    // Classic CASE collections only: a case drop can be StatTrak, so these must
    // never take the Souvenir path. Fracture and Revolution are cases.
    //
    // Achroma, Ascent, Boreal, Genesis, Harlequin and Radiant used to be listed
    // here too, and that was the bug behind the empty SV column: the catalog
    // (react/collection-catalog.js) files all six as category "Weapon Skins",
    // so catalogWearVariantHint returns "souvenir-eligible" and the item page
    // renders an SV column — while this function told the server they were
    // StatTrak, so it fetched "StatTrak™ …" quotes and never requested a single
    // "Souvenir …" one. Header said Souvenir, server priced StatTrak, every row
    // fell back to a dash. Keep this list in step with the catalog: a
    // collection belongs here only if its category is a case/active prime drop.

    return (bool)preg_match(

        '/\b(fracture|revolution)\b/i',

        $origin

    );

}



function steamWearResolveSkinOrigin(string $lookupName): string

{

    static $lookup = null;

    if ($lookup === null) {

        $path = __DIR__ . '/assets/steam-market-cache/skin_origin_lookup.json';

        if (!is_file($path)) {

            $lookup = [];

            return '';

        }

        $decoded = json_decode((string)file_get_contents($path), true);

        $lookup = is_array($decoded['items'] ?? null) ? $decoded['items'] : [];

    }



    $candidates = [];

    $raw = trim($lookupName);

    if ($raw !== '') {

        $candidates[] = $raw;

        $base = steamWearBaseName($raw);

        if ($base !== '' && $base !== $raw) {

            $candidates[] = $base;

        }

        $stripped = steamWearStripStarPrefix($base !== '' ? $base : $raw);

        if ($stripped !== '' && !in_array($stripped, $candidates, true)) {

            $candidates[] = $stripped;

        }

    }



    foreach ($candidates as $candidate) {

        $key = steamWearNormalizeOriginLookupKey($candidate);

        if ($key !== '' && isset($lookup[$key])) {

            return trim((string)$lookup[$key]);

        }

    }



    return '';

}



function steamWearRequestOrigin(string $baseName): string

{

    $queryOrigin = trim((string)($_GET['origin'] ?? $_GET['collection'] ?? ''));

    if ($queryOrigin !== '') {

        return $queryOrigin;

    }

    return steamWearResolveSkinOrigin($baseName);

}



function steamWearSupportsStatTrak(string $baseName): bool

{

    if (steamWearIsGloveItem($baseName)) {

        return false;

    }

    if (steamWearSupportsSouvenir($baseName)) {

        return false;

    }

    $origin = steamWearRequestOrigin($baseName);

    if ($origin !== '' && steamWearIsArmoryExclusiveOrigin($origin)) {

        return false;

    }

    if ($origin !== '' && (steamWearOriginIsStatTrakDrop($origin) || steamWearOriginIsStatTrakCollection($origin))) {

        return true;

    }

    if ($origin !== '' && steamWearIsCollectionOriginName($origin)) {

        return false;

    }

    return true;

}



function steamWearPriceMissing($value): bool

{

    return !isset($value) || !is_numeric($value) || (float)$value <= 0;

}



function steamWearDecodeListingBucketName(string $name): string

{

    $name = html_entity_decode(trim($name), ENT_QUOTES | ENT_HTML5, 'UTF-8');

    if (str_contains($name, '\\u')) {

        $decoded = json_decode('"' . str_replace('"', '\\"', $name) . '"');

        if (is_string($decoded) && $decoded !== '') {

            $name = $decoded;

        }

    }

    return trim($name);

}



function steamWearEnsureStarPrefix(string $baseName): string

{

    $baseName = trim($baseName);

    if ($baseName === '' || str_starts_with($baseName, '★')) {

        return $baseName;

    }



    $core = steamWearStripStarPrefix($baseName);

    if ($core === '' || !steamWearNeedsStarPrefix($core)) {

        return $baseName;

    }



    return '★ ' . $core;

}



function steamWearMarketName(string $baseName, string $wear): string

{

    return trim($baseName) . ' (' . trim($wear) . ')';

}



function steamStatTrakMarketName(string $baseName, string $wear): string

{

    $baseName = trim($baseName);

    $wear = trim($wear);

    if (str_starts_with($baseName, '★ ')) {

        $core = steamWearStripStarPrefix($baseName);

        return '★ StatTrak' . "\xE2\x84\xA2" . ' ' . $core . ' (' . $wear . ')';

    }



    return 'StatTrak' . "\xE2\x84\xA2" . ' ' . $baseName . ' (' . $wear . ')';

}



function steamSouvenirMarketName(string $baseName, string $wear): string

{

    $baseName = steamWearEnsureStarPrefix(trim($baseName));

    return 'Souvenir ' . $baseName . ' (' . trim($wear) . ')';

}



function steamWearSupportsSouvenir(string $baseName): bool

{

    if (steamWearIsGloveItem($baseName)) {

        return false;

    }

    $origin = steamWearRequestOrigin($baseName);

    if ($origin === '' || steamWearIsArmoryExclusiveOrigin($origin)) {

        return false;

    }

    if (steamWearOriginIsStatTrakDrop($origin) || steamWearOriginIsStatTrakCollection($origin)) {

        return false;

    }

    if (!steamWearIsCollectionOriginName($origin)) {

        return false;

    }

    return skinSupportsSouvenirVariant($baseName);

}



function steamWearCacheSourceIsUsable(?array $cached): bool

{

    if ($cached === null) {

        return false;

    }



    $origin = strtolower(trim((string)($cached['steam_price_source'] ?? '')));

    if (in_array($origin, ['market_listing', 'listing', 'steam_listing', 'market_listing_wear'], true)) {

        return false;

    }



    return true;

}



function steamWearDetectUniformListingPrice(array $rows): ?float
{
    $prices = [];
    $volumes = [];
    foreach ($rows as $row) {
        $price = isset($row['price']) ? round((float)$row['price'], 2) : 0.0;
        if ($price <= 0) {
            continue;
        }
        $prices[] = $price;
        $volumes[] = (int)($row['volume'] ?? 0);
    }

    if (count($prices) < 3) {
        return null;
    }

    $uniquePrices = array_values(array_unique($prices, SORT_REGULAR));
    if (count($uniquePrices) !== 1) {
        return null;
    }

    $uniqueVolumes = array_values(array_unique($volumes, SORT_REGULAR));
    if (count($uniqueVolumes) !== 1) {
        return null;
    }

    return $uniquePrices[0];
}



function steamWearPriceFromCache(string $marketName): ?array

{

    foreach ([PRICE_CACHE_FILE_TTL_SECONDS, 604800, 86400 * 30] as $ttl) {

        $cached = cachedFileLoad($marketName, 'steam', $ttl);

        if (!steamWearCacheSourceIsUsable($cached)) {

            continue;

        }



        $price = isset($cached['current_price']) && is_numeric($cached['current_price'])

            ? round((float)$cached['current_price'], 2)

            : null;

        if ($price !== null && $price > 0) {

            return [

                'price' => $price,

                'volume' => isset($cached['volume_24h']) ? (int)$cached['volume_24h'] : (int)($cached['sell_orders'] ?? 0),

                'market_name' => $marketName,

                'source' => (string)($cached['steam_price_source'] ?? 'cache'),

            ];

        }

    }



    return null;

}



function steamWearPriceFromCatalog(string $marketName): ?array

{

    $snapshots = cachedLoadSteamCatalogSnapshots([$marketName]);

    $snap = $snapshots[$marketName] ?? null;

    if (!is_array($snap)) {

        return null;

    }



    $price = isset($snap['current_price']) && is_numeric($snap['current_price'])

        ? round((float)$snap['current_price'], 2)

        : null;

    if ($price === null || $price <= 0) {

        return null;

    }



    cachedFileSave($marketName, 'steam', $snap);



    return [

        'price' => $price,

        'volume' => isset($snap['sell_orders']) ? (int)$snap['sell_orders'] : 0,

        'market_name' => $marketName,

        'source' => (string)($snap['steam_price_source'] ?? 'steam_catalog'),

    ];

}



function steamWearPriceLive(string $marketName): ?array

{

    // Breaker open (see lib/steam_circuit.php): no live pass, no retry sleeps.
    if (steamCircuitOpen()) {
        return null;
    }

    for ($attempt = 0; $attempt < 3; $attempt++) {

        $snap = cachedLiveFetchSteamOverview($marketName);

        if (is_array($snap) && !empty($snap['_rate_limited'])) {

            usleep(1200000 * ($attempt + 1));

            continue;

        }



        $price = isset($snap['current_price']) && is_numeric($snap['current_price'])

            ? round((float)$snap['current_price'], 2)

            : null;

        if ($price !== null && $price > 0 && is_array($snap)) {

            cachedFileSave($marketName, 'steam', $snap);

            return [

                'price' => $price,

                'volume' => isset($snap['volume_24h']) ? (int)$snap['volume_24h'] : 0,

                'market_name' => $marketName,

                'source' => (string)($snap['steam_price_source'] ?? 'priceoverview'),

            ];

        }



        if ($attempt < 2) {

            usleep(400000 * ($attempt + 1));

        }

    }



    return null;

}



function steamWearPriceFromHistory(string $marketName): ?array

{

    if (steamCircuitOpen()) {
        return null;
    }

    $url = steamWearPricehistoryUrl($marketName);

    $ch = curl_init($url);

    curl_setopt_array($ch, [

        CURLOPT_RETURNTRANSFER => true,

        CURLOPT_TIMEOUT => 12,

        CURLOPT_CONNECTTIMEOUT => 5,

        CURLOPT_FOLLOWLOCATION => true,

        CURLOPT_SSL_VERIFYPEER => true,

        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',

        CURLOPT_HTTPHEADER => ['Accept: application/json, text/javascript, */*;q=0.8'],

    ]);

    $body = (string)(curl_exec($ch) ?: '');

    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);

    curl_close($ch);

    steamCircuitNote($code, $body);

    if ($code !== 200 || $body === '') {

        return null;

    }



    $data = json_decode($body, true);

    if (!is_array($data) || empty($data['success']) || !is_array($data['prices'] ?? null) || !$data['prices']) {

        return null;

    }



    $last = $data['prices'][count($data['prices']) - 1] ?? null;

    if (!is_array($last) || !isset($last[1]) || !is_numeric($last[1])) {

        return null;

    }



    $price = round((float)$last[1], 2);

    if ($price <= 0) {

        return null;

    }



    $snap = [

        'current_price' => $price,

        'sell_orders' => null,

        'volume_24h' => isset($last[2]) ? (int)$last[2] : 0,

        'buy_orders' => null,

        'price_history' => null,

        'updated_at' => gmdate(DATE_ATOM),

        'steam_price_source' => 'steam_pricehistory',

    ];

    cachedFileSave($marketName, 'steam', $snap);



    return [

        'price' => $price,

        'volume' => (int)($snap['volume_24h'] ?? 0),

        'market_name' => $marketName,

        'source' => 'steam_pricehistory',

    ];

}



function steamResolveSouvenirWearPrice(

    string $marketName,

    bool $preferLive,

    ?array $dbBatch = null,

    bool $allowLive = true

): ?array {

    $resolved = steamResolveWearPrice($marketName, false, '', '', $dbBatch, null);

    if ($resolved !== null) {

        return $resolved;

    }



    if (!$preferLive || !$allowLive) {

        return null;

    }



    usleep(450000);

    $live = steamWearPriceLive($marketName);

    if ($live !== null) {

        return $live;

    }



    usleep(250000);

    return steamWearPriceFromHistory($marketName);

}



function steamWearExtractListingBucketPrices(string $html): array

{

    if ($html === '') {

        return [];

    }



    $candidates = [

        $html,

        html_entity_decode($html, ENT_QUOTES | ENT_HTML5, 'UTF-8'),

        stripcslashes($html),

        str_replace(['\\"', '\\/', '\\\\'], ['"', '/', '\\'], $html),

    ];



    $decoded = html_entity_decode($html, ENT_QUOTES | ENT_HTML5, 'UTF-8');

    $candidates[] = stripcslashes($decoded);

    $candidates[] = str_replace(['\\"', '\\/', '\\\\'], ['"', '/', '\\'], $decoded);



    $prices = [];

    foreach ($candidates as $candidate) {

        if (!is_string($candidate) || $candidate === '') {

            continue;

        }

        if (!preg_match_all('/"bucket_id"\s*:\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"/u', $candidate, $matches, PREG_OFFSET_CAPTURE)) {

            continue;

        }



        foreach ($matches[1] as $match) {

            $name = steamWearDecodeListingBucketName(stripcslashes((string)$match[0]));

            if ($name === '' || isset($prices[$name])) {

                continue;

            }

            // Only look forward from bucket_id so we don't steal the previous bucket's min_price.

            $pos = (int)$match[1] + strlen((string)$match[0]);

            $window = substr($candidate, $pos, 420);

            if (!preg_match('/"min_price"\s*:\s*"(\d+)"/', $window, $priceMatch)) {

                continue;

            }

            $cents = (int)$priceMatch[1];

            if ($cents <= 0) {

                continue;

            }

            $price = round($cents / 100, 2);

            if ($price > 0) {

                $prices[$name] = $price;

            }

        }



        if ($prices) {

            break;

        }

    }



    return $prices;

}



function steamWearFetchListingBucketPrices(string $marketName): array

{

    $marketName = trim($marketName);

    if ($marketName === '' || steamCircuitOpen()) {

        return [];

    }



    for ($attempt = 0; $attempt < 3; $attempt++) {

        $ch = curl_init(steamWearListingPageUrl($marketName));

        curl_setopt_array($ch, [

            CURLOPT_RETURNTRANSFER => true,

            CURLOPT_TIMEOUT => 25,

            CURLOPT_CONNECTTIMEOUT => 6,

            CURLOPT_FOLLOWLOCATION => true,

            CURLOPT_SSL_VERIFYPEER => true,

            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',

            CURLOPT_HTTPHEADER => ['Accept: text/html,*/*;q=0.8', 'Accept-Language: en-US,en;q=0.9'],

        ]);

        $body = (string)(curl_exec($ch) ?: '');

        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);

        curl_close($ch);



        $rateLimited = $code === 429 || stripos($body, 'too many requests') !== false;

        if ($rateLimited) {

            steamCircuitTrip();

            return [];

        }

        if ($code !== 200 || $body === '') {

            if ($attempt < 2) {

                usleep(400000 * ($attempt + 1));

            }

            continue;

        }



        $prices = steamWearExtractListingBucketPrices($body);

        if ($prices) {

            return $prices;

        }

        if ($attempt < 2) {

            usleep(400000 * ($attempt + 1));

        }

    }



    return [];

}



function steamWearDbBatch(array $marketNames): array

{

    $marketNames = array_values(array_filter(array_map('strval', $marketNames), static fn (string $name) => $name !== ''));

    if (!$marketNames) {

        return [];

    }



    try {

        $pdo = marketDataPdoConnection();

        $placeholders = implode(',', array_fill(0, count($marketNames), '?'));

        $stmt = $pdo->prepare(

            "SELECT market_hash_name, current_price, sell_orders, updated_at

             FROM roi_prices

             WHERE market_hash_name IN ({$placeholders}) AND source = 'steam'"

        );

        $stmt->execute($marketNames);

        $rows = [];

        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {

            $name = (string)($row['market_hash_name'] ?? '');

            $price = isset($row['current_price']) ? round((float)$row['current_price'], 2) : null;

            if ($name === '' || $price === null || $price <= 0) {

                continue;

            }

            $rows[$name] = [

                'price' => $price,

                'volume' => isset($row['sell_orders']) ? (int)$row['sell_orders'] : 0,

                'market_name' => $name,

                'source' => 'roi_prices',

                'updated_at' => $row['updated_at'] ?? null,

            ];

        }



        return $rows;

    } catch (Throwable) {

        return [];

    }

}



function steamWearAnalystBatch(string $baseName): array

{

    try {

        $connection = marketHistoryPdoConnection();

        $itemId = resolveDataDbItemId($connection, 0, $baseName);

        if ($itemId <= 0) {

            return [];

        }



        $statement = $connection->prepare(

            'SELECT wear, price, volume, market_name

             FROM steam_analyst_prices

             WHERE item_id = :item_id

             ORDER BY recorded_at DESC'

        );

        $statement->execute([':item_id' => $itemId]);



        $rows = [];

        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {

            $wear = (string)($row['wear'] ?? '');

            if ($wear === '' || isset($rows[$wear])) {

                continue;

            }



            $price = round((float)($row['price'] ?? 0), 2);

            if ($price <= 0) {

                continue;

            }



            $rows[$wear] = [

                'price' => $price,

                'volume' => (int)($row['volume'] ?? 0),

                'market_name' => (string)($row['market_name'] ?? steamWearMarketName($baseName, $wear)),

                'source' => 'steam_analyst',

            ];

        }



        return $rows;

    } catch (Throwable) {

        return [];

    }

}



function steamResolveWearPrice(

    string $marketName,

    bool $preferLive,

    string $baseName = '',

    string $wear = '',

    ?array $dbBatch = null,

    ?array $analystBatch = null

): ?array {

    if (is_array($dbBatch) && isset($dbBatch[$marketName])) {

        return $dbBatch[$marketName];

    }



    if ($baseName !== '' && $wear !== '' && strpos($marketName, 'StatTrak') !== 0) {

        if (is_array($analystBatch) && isset($analystBatch[$wear])) {

            return $analystBatch[$wear];

        }



        $analyst = steamWearPriceFromAnalystTable($baseName, $wear);

        if ($analyst !== null) {

            return $analyst;

        }

    }



    $cached = steamWearPriceFromCache($marketName);

    if ($cached !== null) {

        return $cached;

    }



    $catalog = steamWearPriceFromCatalog($marketName);

    if ($catalog !== null) {

        return $catalog;

    }



    if ($preferLive) {

        $live = steamWearPriceLive($marketName);

        if ($live !== null) {

            return $live;

        }



        return steamWearPriceFromHistory($marketName);

    }



    return null;

}



/** Retry live + pricehistory for wears that missed cache/catalog/DB. */

function steamFillMissingWearPrice(string $marketName, bool $preferLive): ?array

{

    $marketName = trim($marketName);

    if ($marketName === '') {

        return null;

    }



    if ($preferLive) {

        usleep(350000);

    }



    $live = steamWearPriceLive($marketName);

    if ($live !== null) {

        return $live;

    }



    if ($preferLive) {

        usleep(250000);

    }



    return steamWearPriceFromHistory($marketName);

}



function steamWebApiKey(): string
{
    try {
        if (!function_exists('appConfig')) {
            return '';
        }
        return trim((string)(appConfig()['steam_web']['api_key'] ?? ''));
    } catch (Throwable) {
        return '';
    }
}



function steamWearAppendWebApiKey(string $url): string
{
    $key = steamWebApiKey();
    if ($key === '') {
        return $url;
    }

    return $url . (str_contains($url, '?') ? '&' : '?') . 'key=' . rawurlencode($key);
}



function steamWearPriceoverviewUrl(string $marketName): string
{
    // Community priceoverview does not require the Web API key.
    return 'https://steamcommunity.com/market/priceoverview/?appid=730&currency=3&market_hash_name='
        . rawurlencode($marketName);
}



function steamWearPricehistoryUrl(string $marketName): string
{
    return steamWearAppendWebApiKey(
        'https://steamcommunity.com/market/pricehistory/?appid=730&currency=3&market_hash_name='
        . rawurlencode($marketName)
    );
}



function steamWearListingPageUrl(string $marketName): string
{
    return 'https://steamcommunity.com/market/listings/730/' . rawurlencode($marketName);
}



/**
 * Staggered Steam quotes (same path as inventory steam_fast_overview).
 * One hash name at a time — a 10-way parallel priceoverview 429s cheap skins.
 *
 * @param list<string> $marketNames
 * @return array<string, array{price:float,volume:int,market_name:string,source:string,snapshot:array}>
 */
function steamWearFetchOverviewBatch(array $marketNames, int $timeoutSeconds = 8): array
{
    $marketNames = array_values(array_unique(array_filter(
        array_map(static fn ($name): string => trim((string)$name), $marketNames),
        static fn (string $name): bool => $name !== ''
    )));
    if (!$marketNames) {
        return [];
    }

    if (steamCircuitOpen()) {
        return [];
    }

    $budgetSeconds = max(3, min(8, $timeoutSeconds));
    $started = microtime(true);
    $results = [];
    foreach ($marketNames as $index => $name) {
        if ((microtime(true) - $started) >= $budgetSeconds) {
            break;
        }
        $ch = curl_init(steamWearPriceoverviewUrl($name));
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 3,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            CURLOPT_HTTPHEADER => [
                'Accept: application/json,text/plain,*/*',
                'Accept-Language: en-US,en;q=0.9',
            ],
        ]);
        $body = (string)(curl_exec($ch) ?: '');
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if (steamCircuitNote($code, $body)) {
            // Limited: the rest of the batch would be too. Stop here.
            break;
        }
        if ($code === 200 && $body !== '') {
            $data = json_decode($body, true);
            if (is_array($data) && !empty($data['success'])) {
                $lowest = cachedParseSteamPrice((string)($data['lowest_price'] ?? ''));
                $median = cachedParseSteamPrice((string)($data['median_price'] ?? ''));
                $price = $lowest ?? $median;
                if ($price !== null && $price > 0) {
                    $volume = isset($data['volume'])
                        ? (int)str_replace(',', '', (string)$data['volume'])
                        : 0;
                    $snap = [
                        'current_price' => $price,
                        'sell_orders' => null,
                        'volume_24h' => $volume,
                        'buy_orders' => null,
                        'price_history' => null,
                        'updated_at' => gmdate(DATE_ATOM),
                        'steam_price_source' => 'steam_fast_overview',
                        'lowest_price' => $lowest,
                        'median_price' => $median,
                    ];
                    $results[$name] = [
                        'price' => $price,
                        'volume' => $volume,
                        'market_name' => $name,
                        'source' => 'steam_fast_overview',
                        'snapshot' => $snap,
                    ];
                }
            }
        }
        if ($index + 1 < count($marketNames) && (microtime(true) - $started) < $budgetSeconds) {
            usleep(160000);
        }
    }

    return $results;
}

/**
 * Exact listing-page quotes for wear hash names when priceoverview 429s.
 * One request per full market_hash_name — not catalog leftovers or shared buckets.
 *
 * @param list<string> $marketNames
 * @return array<string, array{price:float,volume:int,market_name:string,source:string,snapshot:array}>
 */
function steamWearFetchExactListingBatch(array $marketNames, int $timeoutSeconds = 8): array
{
    $marketNames = array_values(array_unique(array_filter(
        array_map(static fn ($name): string => trim((string)$name), $marketNames),
        static fn (string $name): bool => $name !== ''
    )));
    if (!$marketNames) {
        return [];
    }

    if (steamCircuitOpen()) {
        return [];
    }

    $timeoutSeconds = max(4, min(12, $timeoutSeconds));
    $multi = curl_multi_init();
    $handles = [];
    foreach ($marketNames as $name) {
        $ch = curl_init(steamWearListingPageUrl($name));
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            CURLOPT_HTTPHEADER => [
                'Accept: text/html,*/*;q=0.8',
                'Accept-Language: en-US,en;q=0.9',
            ],
        ]);
        curl_multi_add_handle($multi, $ch);
        $handles[$name] = $ch;
    }

    $running = 0;
    do {
        $status = curl_multi_exec($multi, $running);
        if ($running > 0) {
            curl_multi_select($multi, 0.4);
        }
    } while ($running > 0 && $status === CURLM_OK);

    $results = [];
    foreach ($handles as $name => $ch) {
        $body = (string)(curl_multi_getcontent($ch) ?: '');
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_multi_remove_handle($multi, $ch);
        curl_close($ch);
        if ($code !== 200 || $body === '') {
            continue;
        }
        if (!cachedSteamListingHtmlMatchesName($body, $name)) {
            continue;
        }
        $price = cachedExtractCompactSellOrderPrice($body);
        if ($price === null || $price <= 0) {
            continue;
        }
        $volume = cachedExtractSteamListingTotalCount($body);
        $snap = [
            'current_price' => $price,
            'sell_orders' => $volume,
            'volume_24h' => $volume,
            'buy_orders' => null,
            'price_history' => null,
            'updated_at' => gmdate(DATE_ATOM),
            'steam_price_source' => 'market_listing_wear',
        ];
        $results[$name] = [
            'price' => $price,
            'volume' => is_int($volume) ? $volume : 0,
            'market_name' => $name,
            'source' => 'market_listing_wear',
            'snapshot' => $snap,
        ];
        cachedFileSave($name, 'steam', $snap);
    }
    curl_multi_close($multi);

    return $results;
}



function steamWearApplyLiveOverviewBatch(
    array &$qualityRows,
    array $wearList,
    string $baseName,
    array $liveBatch,
    bool $supportsStatTrak,
    bool $supportsSouvenir
): void {
    if (!$liveBatch) {
        return;
    }

    $pdo = null;
    try {
        $pdo = marketDataPdoConnection();
    } catch (Throwable) {
        $pdo = null;
    }

    $imported = [];
    foreach ($wearList as $index => $wear) {
        $marketName = steamWearMarketName($baseName, $wear);
        if (isset($liveBatch[$marketName]) && !steamWearPriceMissing($liveBatch[$marketName]['price'] ?? null)) {
            $qualityRows[$index]['price'] = $liveBatch[$marketName]['price'];
            $qualityRows[$index]['volume'] = (int)($liveBatch[$marketName]['volume'] ?? 0);
            $qualityRows[$index]['source'] = (string)($liveBatch[$marketName]['source'] ?? 'priceoverview');
            $imported[$marketName] = $liveBatch[$marketName]['price'];
            if (isset($liveBatch[$marketName]['snapshot']) && is_array($liveBatch[$marketName]['snapshot'])) {
                cachedPersistSteamQuote($marketName, $liveBatch[$marketName]['snapshot'], $pdo);
            }
        }

        if ($supportsStatTrak) {
            $stName = steamStatTrakMarketName($baseName, $wear);
            if (isset($liveBatch[$stName]) && !steamWearPriceMissing($liveBatch[$stName]['price'] ?? null)) {
                $qualityRows[$index]['stattrak'] = $liveBatch[$stName]['price'];
                $imported[$stName] = $liveBatch[$stName]['price'];
                if (isset($liveBatch[$stName]['snapshot']) && is_array($liveBatch[$stName]['snapshot'])) {
                    cachedPersistSteamQuote($stName, $liveBatch[$stName]['snapshot'], $pdo);
                }
            }
        }

        if ($supportsSouvenir) {
            $svName = steamSouvenirMarketName($baseName, $wear);
            if (isset($liveBatch[$svName]) && !steamWearPriceMissing($liveBatch[$svName]['price'] ?? null)) {
                $qualityRows[$index]['souvenir'] = $liveBatch[$svName]['price'];
                $imported[$svName] = $liveBatch[$svName]['price'];
                if (isset($liveBatch[$svName]['snapshot']) && is_array($liveBatch[$svName]['snapshot'])) {
                    cachedPersistSteamQuote($svName, $liveBatch[$svName]['snapshot'], $pdo);
                }
            }
        }
    }

    if ($imported) {
        steamWearSaveBucketSidecar($baseName, $imported);
    }
}



function steamWearPriceFromDb(string $marketName): ?array

{

    $batch = steamWearDbBatch([$marketName]);

    return $batch[$marketName] ?? null;

}



function steamWearPriceFromAnalystTable(string $baseName, string $wear): ?array

{

    $batch = steamWearAnalystBatch($baseName);

    return $batch[$wear] ?? null;

}



function steamWearBucketSidecarPath(string $baseName): string
{
    $dir = __DIR__ . '/assets/roi-price-cache';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    return $dir . '/steam_wear_buckets_' . md5(mb_strtolower(trim($baseName))) . '.json';
}



function steamWearLoadBucketSidecar(string $baseName): array
{
    $path = steamWearBucketSidecarPath($baseName);
    if (!is_file($path)) {
        return [];
    }

    $decoded = json_decode((string)file_get_contents($path), true);
    $prices = is_array($decoded['prices'] ?? null) ? $decoded['prices'] : (is_array($decoded) ? $decoded : []);
    $out = [];
    foreach ($prices as $name => $price) {
        $marketName = trim((string)$name);
        $value = round((float)$price, 2);
        if ($marketName === '' || $value <= 0) {
            continue;
        }
        $out[$marketName] = $value;
    }

    return $out;
}



function steamWearSaveBucketSidecar(string $baseName, array $prices): void
{
    $merged = steamWearLoadBucketSidecar($baseName);
    foreach ($prices as $name => $price) {
        $marketName = trim((string)$name);
        $value = round((float)$price, 2);
        if ($marketName === '' || $value <= 0) {
            continue;
        }
        $merged[$marketName] = $value;
    }
    if (!$merged) {
        return;
    }

    file_put_contents(steamWearBucketSidecarPath($baseName), json_encode([
        'lookup_name' => $baseName,
        'updated_at' => gmdate(DATE_ATOM),
        // Which special variant this file was built for. The reader compares it
        // against the current decision and ignores the cache when they differ,
        // so a skin that changes variant refetches once instead of serving the
        // old answer forever. See steamWearBucketSidecarVariant().
        'variant' => steamWearCurrentVariant($baseName),
        'prices' => $merged,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

/** "stattrak" | "souvenir" | "none" — the variant this skin should be priced for. */
function steamWearCurrentVariant(string $baseName): string
{
    if (steamWearSupportsStatTrak($baseName)) {
        return 'stattrak';
    }

    return steamWearSupportsSouvenir($baseName) ? 'souvenir' : 'none';
}

/**
 * The variant a cached sidecar was written for, or '' when the file predates
 * the marker. '' never matches a current decision, which is deliberate: those
 * files were written before the Harlequin/Achroma collections were corrected
 * from StatTrak to Souvenir, so they must be refetched once.
 */
function steamWearBucketSidecarVariant(string $baseName): string
{
    $path = steamWearBucketSidecarPath($baseName);
    if (!is_file($path)) {
        return '';
    }

    $decoded = json_decode((string)file_get_contents($path), true);

    return is_array($decoded) ? trim((string)($decoded['variant'] ?? '')) : '';
}



function steamWearPersistIfMissing(string $marketName, float $price, string $source, ?int $volume = null): void
{
    $marketName = trim($marketName);
    if ($marketName === '' || $price <= 0) {
        return;
    }

    cachedFileSave($marketName, 'steam', [
        'current_price' => $price,
        'sell_orders' => $volume,
        'volume_24h' => $volume,
        'buy_orders' => null,
        'price_history' => null,
        'updated_at' => gmdate(DATE_ATOM),
        'steam_price_source' => $source !== '' ? $source : 'steam_wear_import',
    ]);
}



function steamWearPersistImportedPrices(array $importedPrices, array $volumes = [], array $existing = []): void
{
    $names = array_keys($importedPrices);
    if (!$names) {
        return;
    }

    try {
        if (!$existing) {
            $existing = steamWearDbBatch($names);
        }
        $missing = [];
        foreach ($importedPrices as $marketName => $price) {
            $marketName = trim((string)$marketName);
            if ($marketName === '' || steamWearPriceMissing($price)) {
                continue;
            }
            if (isset($existing[$marketName]) && !steamWearPriceMissing($existing[$marketName]['price'] ?? null)) {
                continue;
            }
            $missing[$marketName] = $price;
        }
        if (!$missing) {
            return;
        }
        $pdo = marketDataPdoConnection();
        foreach ($importedPrices as $marketName => $price) {
            $marketName = trim((string)$marketName);
            $value = round((float)$price, 2);
            if ($marketName === '' || $value <= 0) {
                continue;
            }
            if (isset($existing[$marketName]) && !steamWearPriceMissing($existing[$marketName]['price'] ?? null)) {
                continue;
            }
            $volume = isset($volumes[$marketName]) && is_numeric($volumes[$marketName])
                ? (int)$volumes[$marketName]
                : null;
            roiPricesUpsert($pdo, [
                'market_hash_name' => $marketName,
                'source' => 'steam',
                'current_price' => $value,
                'sell_orders' => $volume,
                'market_url' => 'https://steamcommunity.com/market/listings/730/' . rawurlencode($marketName),
            ]);
        }
    } catch (Throwable) {
        // File cache / sidecar already hold the imported wears.
    }
}



function steamWearExportQualityPrices(array $qualityRows, string $baseName, bool $supportsStatTrak, bool $supportsSouvenir): array
{
    $importedPrices = [];
    $importedVolumes = [];
    foreach ($qualityRows as $row) {
        $wear = (string)($row['wear'] ?? '');
        if ($wear === '') {
            continue;
        }
        $price = isset($row['price']) ? (float)$row['price'] : 0.0;
        if ($price > 0) {
            $marketName = steamWearMarketName($baseName, $wear);
            $importedPrices[$marketName] = $price;
            $importedVolumes[$marketName] = (int)($row['volume'] ?? 0);
            $rowSource = trim((string)($row['source'] ?? 'steam_wear_import'));
            steamWearPersistIfMissing($marketName, $price, $rowSource !== '' ? $rowSource : 'steam_wear_import', (int)($row['volume'] ?? 0));
        }
        if ($supportsStatTrak && !steamWearPriceMissing($row['stattrak'] ?? null)) {
            $stName = steamStatTrakMarketName($baseName, $wear);
            $importedPrices[$stName] = (float)$row['stattrak'];
            steamWearPersistIfMissing($stName, (float)$row['stattrak'], 'steam_listing_buckets');
        }
        if ($supportsSouvenir && !steamWearPriceMissing($row['souvenir'] ?? null)) {
            $svName = steamSouvenirMarketName($baseName, $wear);
            $importedPrices[$svName] = (float)$row['souvenir'];
            steamWearPersistIfMissing($svName, (float)$row['souvenir'], 'steam_listing_buckets');
        }
    }

    return [$importedPrices, $importedVolumes];
}



function steamWearEmptyQualityRows(string $baseName, array $wearList): array
{
    $rows = [];
    foreach ($wearList as $wear) {
        $rows[] = [
            'wear' => $wear,
            'price' => null,
            'volume' => 0,
            'market_name' => steamWearMarketName($baseName, $wear),
            'stattrak' => null,
            'souvenir' => null,
            'source' => null,
        ];
    }

    return $rows;
}



function steamWearNamedPricesCoverSteam(array $namedPrices, string $baseName, array $wearList): bool
{
    if (!$namedPrices || !$wearList) {
        return false;
    }
    foreach ($wearList as $wear) {
        $marketName = steamWearMarketName($baseName, $wear);
        if (!isset($namedPrices[$marketName]) || (float)$namedPrices[$marketName] <= 0) {
            return false;
        }
    }

    return true;
}



function steamWearPayload(string $baseName, array $qualityRows, bool $supportsStatTrak, bool $supportsSouvenir): array
{
    $origin = trim((string)($_GET['origin'] ?? $_GET['collection'] ?? ''));

    return [
        'lookup_name' => $baseName,
        'origin' => $origin,
        'variant' => $supportsStatTrak ? 'stattrak' : ($supportsSouvenir ? 'souvenir' : null),
        'quality_rows' => $qualityRows,
        'updated_at' => gmdate(DATE_ATOM),
    ];
}

function steamWearLiveTableCacheHit(string $marketName): ?array
{
    $cached = cachedFileLoad($marketName, 'steam', STEAM_WEAR_LIVE_TABLE_TTL_SECONDS);
    if (!is_array($cached)) {
        return null;
    }

    $source = strtolower(trim((string)($cached['steam_price_source'] ?? '')));
    if (!in_array($source, [
        'priceoverview',
        'steam_pricehistory',
        'steam_fast_overview',
        'roi_prices',
        'steam_last_good',
        'steam_listing_buckets',
        'skinport',
        'csfloat',
        'skinport_fallback',
    ], true)) {
        return null;
    }

    $price = isset($cached['current_price']) && is_numeric($cached['current_price'])
        ? round((float)$cached['current_price'], 2)
        : null;
    if ($price === null || $price <= 0) {
        return null;
    }

    return [
        'price' => $price,
        'volume' => isset($cached['volume_24h']) ? (int)$cached['volume_24h'] : 0,
        'market_name' => $marketName,
        'source' => $source,
    ];
}

function steamWearFallbackSourceAllowed(string $source): bool
{
    $source = strtolower(trim($source));
    if (in_array($source, ['steam_catalog', 'steam_catalog_seed', 'market_listing', 'listing', 'steam_listing', 'market_listing_wear'], true)) {
        return false;
    }

    return $source === ''
        || $source === 'cache'
        || $source === 'roi_prices'
        || $source === 'steam_fast_overview'
        || $source === 'steam_wear_import'
        || $source === 'steam_last_good'
        || $source === 'steam_listing_buckets'
        || $source === 'skinport'
        || $source === 'csfloat'
        || $source === 'skinport_fallback'
        || in_array($source, cachedSteamLastGoodOrigins(), true)
        || $source === 'steam_pricehistory';
}

function steamWearQuoteFromTrustedSnap(?array $snap, string $defaultSource): ?array
{
    if (!is_array($snap)) {
        return null;
    }

    $price = isset($snap['current_price']) && is_numeric($snap['current_price'])
        ? round((float)$snap['current_price'], 2)
        : (isset($snap['price']) && is_numeric($snap['price']) ? round((float)$snap['price'], 2) : null);
    if ($price === null || $price <= 0) {
        return null;
    }

    $source = strtolower(trim((string)($snap['steam_price_source'] ?? $snap['source'] ?? $defaultSource)));
    if (!steamWearFallbackSourceAllowed($source)) {
        return null;
    }

    return [
        'price' => $price,
        'volume' => isset($snap['volume_24h']) ? (int)$snap['volume_24h'] : (int)($snap['sell_orders'] ?? $snap['volume'] ?? 0),
        'source' => $source !== '' ? $source : $defaultSource,
    ];
}

function steamWearApplyFallbackQuote(array &$qualityRows, int $index, string $field, ?array $quote): void
{
    if ($quote === null || !steamWearPriceMissing($qualityRows[$index][$field] ?? null)) {
        return;
    }
    if (steamWearPriceMissing($quote['price'] ?? null)) {
        return;
    }

    $qualityRows[$index][$field] = $quote['price'];
    if ($field === 'price') {
        $qualityRows[$index]['volume'] = (int)($quote['volume'] ?? 0);
        $qualityRows[$index]['source'] = (string)($quote['source'] ?? 'steam_cache');
    }
}

/**
 * Live Steam first. If priceoverview / listing 429s, reuse last-good Steam
 * file cache, deals index, roi_prices, and wear-bucket sidecars — never catalog.
 */
function steamWearFillMissingFromSteamBackedCache(
    array &$qualityRows,
    array $wearList,
    string $baseName,
    bool $supportsStatTrak,
    bool $supportsSouvenir
): void {
    $missingNames = [];
    foreach ($wearList as $index => $wear) {
        $normalName = steamWearMarketName($baseName, $wear);
        if (steamWearPriceMissing($qualityRows[$index]['price'] ?? null)) {
            $missingNames[] = $normalName;
        }
        if ($supportsStatTrak) {
            $stName = steamStatTrakMarketName($baseName, $wear);
            if (steamWearPriceMissing($qualityRows[$index]['stattrak'] ?? null)) {
                $missingNames[] = $stName;
            }
        }
        if ($supportsSouvenir) {
            $svName = steamSouvenirMarketName($baseName, $wear);
            if (steamWearPriceMissing($qualityRows[$index]['souvenir'] ?? null)) {
                $missingNames[] = $svName;
            }
        }
    }
    if (!$missingNames) {
        return;
    }

    $dbBatch = steamWearDbBatch($missingNames);
    $sidecar = steamWearLoadBucketSidecar($baseName);
    $dealsQuotes = function_exists('cachedDealsSteamIndexLoad')
        ? (cachedDealsSteamIndexLoad()['quotes'] ?? [])
        : [];

    foreach ($wearList as $index => $wear) {
        $slots = [
            'price' => steamWearMarketName($baseName, $wear),
        ];
        if ($supportsStatTrak) {
            $slots['stattrak'] = steamStatTrakMarketName($baseName, $wear);
        }
        if ($supportsSouvenir) {
            $slots['souvenir'] = steamSouvenirMarketName($baseName, $wear);
        }

        foreach ($slots as $field => $marketName) {
            if (!steamWearPriceMissing($qualityRows[$index][$field] ?? null)) {
                continue;
            }

            $quote = null;
            if (function_exists('cachedFileLoadSteamLastGood')) {
                $quote = steamWearQuoteFromTrustedSnap(
                    cachedFileLoadSteamLastGood($marketName, STEAM_LAST_GOOD_MAX_AGE_SECONDS),
                    'steam_last_good'
                );
            }
            if ($quote === null && isset($dealsQuotes[$marketName]) && is_array($dealsQuotes[$marketName])) {
                $quote = steamWearQuoteFromTrustedSnap($dealsQuotes[$marketName], 'steam_last_good');
            }
            if ($quote === null && isset($dbBatch[$marketName])) {
                $quote = steamWearQuoteFromTrustedSnap($dbBatch[$marketName], 'roi_prices');
            }
            if ($quote === null) {
                $fileQuote = steamWearPriceFromCache($marketName);
                if ($fileQuote !== null && steamWearFallbackSourceAllowed((string)($fileQuote['source'] ?? ''))) {
                    $quote = $fileQuote;
                }
            }
            if ($quote === null && isset($sidecar[$marketName]) && (float)$sidecar[$marketName] > 0) {
                $quote = [
                    'price' => round((float)$sidecar[$marketName], 2),
                    'volume' => 0,
                    'source' => 'steam_listing_buckets',
                ];
            }

            steamWearApplyFallbackQuote($qualityRows, $index, $field, $quote);
        }
    }
}

function steamWearCollectMissingMarketNames(
    array $qualityRows,
    array $wearList,
    string $baseName,
    bool $supportsStatTrak,
    bool $supportsSouvenir
): array {
    $missing = [];
    foreach ($wearList as $index => $wear) {
        if (steamWearPriceMissing($qualityRows[$index]['price'] ?? null)) {
            $missing[] = steamWearMarketName($baseName, $wear);
        }
        if ($supportsStatTrak && steamWearPriceMissing($qualityRows[$index]['stattrak'] ?? null)) {
            $missing[] = steamStatTrakMarketName($baseName, $wear);
        }
        if ($supportsSouvenir && steamWearPriceMissing($qualityRows[$index]['souvenir'] ?? null)) {
            $missing[] = steamSouvenirMarketName($baseName, $wear);
        }
    }

    return array_values(array_unique(array_filter($missing, static fn (string $name): bool => $name !== '')));
}

function steamWearApplyLiveForMissing(
    array &$qualityRows,
    array $wearList,
    string $baseName,
    bool $supportsStatTrak,
    bool $supportsSouvenir
): void {
    $missingNormal = [];
    $missingExtra = [];
    foreach ($wearList as $index => $wear) {
        if (steamWearPriceMissing($qualityRows[$index]['price'] ?? null)) {
            $missingNormal[] = steamWearMarketName($baseName, $wear);
        }
        if ($supportsStatTrak && steamWearPriceMissing($qualityRows[$index]['stattrak'] ?? null)) {
            $missingExtra[] = steamStatTrakMarketName($baseName, $wear);
        }
        if ($supportsSouvenir && steamWearPriceMissing($qualityRows[$index]['souvenir'] ?? null)) {
            $missingExtra[] = steamSouvenirMarketName($baseName, $wear);
        }
    }
    $missingNormal = array_values(array_unique(array_filter($missingNormal)));
    $missingExtra = array_values(array_unique(array_filter($missingExtra)));
    if (!$missingNormal && !$missingExtra) {
        return;
    }

    if ($missingNormal) {
        steamWearApplyLiveOverviewBatch(
            $qualityRows,
            $wearList,
            $baseName,
            steamWearFetchOverviewBatch($missingNormal, 4),
            $supportsStatTrak,
            $supportsSouvenir
        );
    }
    if ($missingExtra) {
        steamWearApplyLiveOverviewBatch(
            $qualityRows,
            $wearList,
            $baseName,
            steamWearFetchOverviewBatch($missingExtra, 4),
            $supportsStatTrak,
            $supportsSouvenir
        );
    }
}

function steamWearFetchListingBucketPricesQuick(string $marketName): array
{
    $marketName = trim($marketName);
    if ($marketName === '' || steamCircuitOpen()) {
        return [];
    }

    $ch = curl_init(steamWearListingPageUrl($marketName));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        CURLOPT_HTTPHEADER => ['Accept: text/html,*/*;q=0.8', 'Accept-Language: en-US,en;q=0.9'],
    ]);
    $body = (string)(curl_exec($ch) ?: '');
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    steamCircuitNote($code, $body);
    if ($code !== 200 || $body === '') {
        return [];
    }

    return steamWearExtractListingBucketPrices($body);
}

function steamWearFillMissingFromListingBuckets(
    array &$qualityRows,
    array $wearList,
    string $baseName,
    bool $supportsStatTrak,
    bool $supportsSouvenir
): void {
    $missing = steamWearCollectMissingMarketNames(
        $qualityRows,
        $wearList,
        $baseName,
        $supportsStatTrak,
        $supportsSouvenir
    );
    if (!$missing) {
        return;
    }

    $seeds = [
        steamWearMarketName($baseName, 'Field-Tested'),
        steamWearMarketName($baseName, 'Minimal Wear'),
        steamWearMarketName($baseName, 'Factory New'),
    ];
    if ($supportsStatTrak) {
        $seeds[] = steamStatTrakMarketName($baseName, 'Field-Tested');
    }

    $bucketPrices = [];
    foreach ($seeds as $seedName) {
        if ($seedName === '') {
            continue;
        }
        $bucketPrices = steamWearFetchListingBucketPricesQuick($seedName);
        if ($bucketPrices) {
            break;
        }
    }
    if (!$bucketPrices) {
        return;
    }

    $normalPrices = [];
    foreach ($wearList as $wear) {
        $marketName = steamWearMarketName($baseName, $wear);
        if (isset($bucketPrices[$marketName]) && (float)$bucketPrices[$marketName] > 0) {
            $normalPrices[] = round((float)$bucketPrices[$marketName], 2);
        }
    }
    if (count($normalPrices) >= 3 && count(array_unique($normalPrices, SORT_REGULAR)) === 1) {
        foreach ($wearList as $wear) {
            unset($bucketPrices[steamWearMarketName($baseName, $wear)]);
        }
    }

    steamWearApplyNamedPrices(
        $qualityRows,
        $wearList,
        $bucketPrices,
        'steam_listing_buckets',
        $supportsStatTrak,
        $supportsSouvenir,
        $baseName
    );
}

function steamWearCsfloatUsdToEur(): float
{
    try {
        return max(0.01, (float)(appConfig()['dmarket']['usd_to_eur'] ?? 0.92));
    } catch (Throwable) {
        return 0.92;
    }
}

/**
 * Per-wear Skinport asks from the items index already used on the item page.
 *
 * @param list<string> $marketNames
 * @return array<string, array{price:float,volume:int,source:string}>
 */
function steamWearLoadSkinportIndexQuotes(array $marketNames): array
{
    $index = [];
    try {
        $index = cachedSkinportLoadItemsIndex('', false);
    } catch (Throwable) {
        $index = [];
    }
    if (!$index) {
        return [];
    }

    $out = [];
    foreach ($marketNames as $name) {
        $row = is_array($index[$name] ?? null) ? $index[$name] : null;
        if ($row === null) {
            continue;
        }
        $price = cachedSkinportPickAskPrice($row);
        if ($price === null || $price <= 0) {
            continue;
        }
        $out[$name] = [
            'price' => $price,
            'volume' => (int)($row['quantity'] ?? 0),
            'source' => 'skinport',
        ];
    }

    return $out;
}

/**
 * Per-wear CSFloat asks from the price-list index / per-hash cache the item page uses.
 *
 * @param list<string> $marketNames
 * @return array<string, array{price:float,volume:int,source:string}>
 */
function steamWearLoadCsfloatIndexQuotes(array $marketNames): array
{
    $path = __DIR__ . '/assets/csfloat-cache/_price_list_index.json';
    $map = [];
    if (is_file($path)) {
        $payload = json_decode((string)@file_get_contents($path), true);
        $map = is_array($payload['map'] ?? null) ? $payload['map'] : [];
    }
    $usdToEur = steamWearCsfloatUsdToEur();
    $out = [];
    foreach ($marketNames as $name) {
        $row = is_array($map[$name] ?? null) ? $map[$name] : null;
        $cents = is_array($row) && isset($row['min_price']) ? (int)$row['min_price'] : 0;
        if ($cents > 0) {
            $out[$name] = [
                'price' => round(($cents / 100) * $usdToEur, 2),
                'volume' => max(0, (int)($row['quantity'] ?? 0)),
                'source' => 'csfloat',
            ];
            continue;
        }
        $file = __DIR__ . '/assets/csfloat-cache/' . md5($name) . '.json';
        if (!is_file($file)) {
            continue;
        }
        $cached = json_decode((string)@file_get_contents($file), true);
        $price = is_array($cached) && isset($cached['current_price']) && is_numeric($cached['current_price'])
            ? round((float)$cached['current_price'], 2)
            : 0.0;
        if ($price <= 0) {
            continue;
        }
        $out[$name] = [
            'price' => $price,
            'volume' => (int)($cached['listings'] ?? 0),
            'source' => 'csfloat',
        ];
    }

    return $out;
}

/**
 * When Steam 429s and roi/sidecar are empty, reuse Skinport / CSFloat quotes
 * already loaded for the item page so the wear table is not all dashes.
 */
function steamWearFillMissingFromMarketplaceQuotes(
    array &$qualityRows,
    array $wearList,
    string $baseName,
    bool $supportsStatTrak,
    bool $supportsSouvenir
): void {
    $missing = steamWearCollectMissingMarketNames(
        $qualityRows,
        $wearList,
        $baseName,
        $supportsStatTrak,
        $supportsSouvenir
    );
    if (!$missing) {
        return;
    }

    $skinport = steamWearLoadSkinportIndexQuotes($missing);
    $still = array_values(array_filter($missing, static fn (string $name): bool => !isset($skinport[$name])));
    $csfloat = $still ? steamWearLoadCsfloatIndexQuotes($still) : [];

    foreach ($wearList as $index => $wear) {
        $slots = [
            'price' => steamWearMarketName($baseName, $wear),
        ];
        if ($supportsStatTrak) {
            $slots['stattrak'] = steamStatTrakMarketName($baseName, $wear);
        }
        if ($supportsSouvenir) {
            $slots['souvenir'] = steamSouvenirMarketName($baseName, $wear);
        }
        foreach ($slots as $field => $marketName) {
            if (!steamWearPriceMissing($qualityRows[$index][$field] ?? null)) {
                continue;
            }
            $quote = $skinport[$marketName] ?? $csfloat[$marketName] ?? null;
            steamWearApplyFallbackQuote($qualityRows, $index, $field, $quote);
            if ($quote !== null && !steamWearPriceMissing($quote['price'] ?? null)) {
                $quoteSource = strtolower(trim((string)($quote['source'] ?? 'skinport')));
                if ($quoteSource === 'skinport' || $quoteSource === 'csfloat') {
                    cachedFileSave($marketName, $quoteSource, [
                        'current_price' => (float)$quote['price'],
                        'sell_orders' => (int)($quote['volume'] ?? 0),
                        'volume_24h' => (int)($quote['volume'] ?? 0),
                        'updated_at' => gmdate(DATE_ATOM),
                        'source' => $quoteSource,
                    ]);
                }
            }
        }
    }
}

/**
 * Item-page wear table: seed last-good / roi / sidecar, then live-fetch only the
 * gaps. A 10-way priceoverview (5 wears + 5 ST) 429s cheap skins like Torque and
 * left MW/FT/WW/BS empty because those wears are missing from roi_prices.
 */
function steamWearRefreshLiveTableRows(
    string $baseName,
    array $wearList,
    bool $supportsStatTrak,
    bool $supportsSouvenir
): array {
    $qualityRows = steamWearEmptyQualityRows($baseName, $wearList);

    foreach ($wearList as $index => $wear) {
        $normalName = steamWearMarketName($baseName, $wear);
        $cached = steamWearLiveTableCacheHit($normalName);
        if ($cached !== null) {
            $qualityRows[$index]['price'] = $cached['price'];
            $qualityRows[$index]['volume'] = $cached['volume'];
            $qualityRows[$index]['source'] = $cached['source'];
        }

        if ($supportsStatTrak) {
            $stCached = steamWearLiveTableCacheHit(steamStatTrakMarketName($baseName, $wear));
            if ($stCached !== null) {
                $qualityRows[$index]['stattrak'] = $stCached['price'];
            }
        }

        if ($supportsSouvenir) {
            $svCached = steamWearLiveTableCacheHit(steamSouvenirMarketName($baseName, $wear));
            if ($svCached !== null) {
                $qualityRows[$index]['souvenir'] = $svCached['price'];
            }
        }
    }

    steamWearFillMissingFromSteamBackedCache(
        $qualityRows,
        $wearList,
        $baseName,
        $supportsStatTrak,
        $supportsSouvenir
    );

    // Instant Skinport / CSFloat so the table is never empty while Steam 429s.
    steamWearFillMissingFromMarketplaceQuotes(
        $qualityRows,
        $wearList,
        $baseName,
        $supportsStatTrak,
        $supportsSouvenir
    );

    steamWearApplyLiveForMissing(
        $qualityRows,
        $wearList,
        $baseName,
        $supportsStatTrak,
        $supportsSouvenir
    );
    $missingAfterLive = steamWearCollectMissingMarketNames(
        $qualityRows,
        $wearList,
        $baseName,
        $supportsStatTrak,
        $supportsSouvenir
    );
    $steamColumnMissing = false;
    foreach ($qualityRows as $row) {
        if (steamWearPriceMissing($row['price'] ?? null)) {
            $steamColumnMissing = true;
            break;
        }
    }
    if ($steamColumnMissing && $missingAfterLive) {
        steamWearFillMissingFromListingBuckets(
            $qualityRows,
            $wearList,
            $baseName,
            $supportsStatTrak,
            $supportsSouvenir
        );
    }

    steamWearFillMissingFromMarketplaceQuotes(
        $qualityRows,
        $wearList,
        $baseName,
        $supportsStatTrak,
        $supportsSouvenir
    );

    $uniformSteam = steamWearDetectUniformListingPrice($qualityRows);
    if ($uniformSteam !== null) {
        foreach ($qualityRows as $index => $row) {
            $src = strtolower(trim((string)($row['source'] ?? '')));
            if (!in_array($src, ['market_listing', 'listing', 'steam_listing', 'market_listing_wear'], true)) {
                continue;
            }
            if (abs((float)($row['price'] ?? 0) - $uniformSteam) <= 0.009) {
                $qualityRows[$index]['price'] = null;
                $qualityRows[$index]['volume'] = 0;
                $qualityRows[$index]['source'] = null;
            }
        }
    }

    steamWearFillMissingFromSteamBackedCache(
        $qualityRows,
        $wearList,
        $baseName,
        $supportsStatTrak,
        $supportsSouvenir
    );

    [$importedPrices] = steamWearExportQualityPrices(
        $qualityRows,
        $baseName,
        $supportsStatTrak,
        $supportsSouvenir
    );
    if ($importedPrices) {
        steamWearSaveBucketSidecar($baseName, $importedPrices);
    }

    return $qualityRows;
}



function steamWearApplyNamedPrices(array &$qualityRows, array $wearList, array $namedPrices, string $source, bool $supportsStatTrak, bool $supportsSouvenir, string $baseName): void
{
    if (!$namedPrices) {
        return;
    }

    foreach ($wearList as $index => $wear) {
        $marketName = steamWearMarketName($baseName, $wear);
        $bucketPrice = isset($namedPrices[$marketName]) ? (float)$namedPrices[$marketName] : 0.0;
        if ($bucketPrice > 0 && steamWearPriceMissing($qualityRows[$index]['price'] ?? null)) {
            $qualityRows[$index]['price'] = $bucketPrice;
            $qualityRows[$index]['source'] = $source;
            steamWearPersistIfMissing($marketName, $bucketPrice, $source, (int)($qualityRows[$index]['volume'] ?? 0));
        }

        if ($supportsStatTrak) {
            $stName = steamStatTrakMarketName($baseName, $wear);
            $stPrice = isset($namedPrices[$stName]) ? (float)$namedPrices[$stName] : 0.0;
            if ($stPrice > 0 && steamWearPriceMissing($qualityRows[$index]['stattrak'] ?? null)) {
                $qualityRows[$index]['stattrak'] = $stPrice;
                steamWearPersistIfMissing($stName, $stPrice, $source);
            }
        }

        if ($supportsSouvenir) {
            $svName = steamSouvenirMarketName($baseName, $wear);
            $svPrice = isset($namedPrices[$svName]) ? (float)$namedPrices[$svName] : 0.0;
            if ($svPrice > 0 && steamWearPriceMissing($qualityRows[$index]['souvenir'] ?? null)) {
                $qualityRows[$index]['souvenir'] = $svPrice;
                steamWearPersistIfMissing($svName, $svPrice, $source);
            }
        }
    }
}



try {

    if (defined('STEAM_WEAR_LIB_ONLY')) {
        return;
    }

    $lookupName = trim((string)($_GET['lookup_name'] ?? ''));

    $baseName = steamWearEnsureStarPrefix(steamWearBaseName($lookupName));

    if ($baseName === '') {

        throw new RuntimeException('lookup_name is required.');

    }



    $preferLive = isset($_GET['prefer_live'])
        && filter_var((string)$_GET['prefer_live'], FILTER_VALIDATE_BOOLEAN);
    if (isset($_GET['force_live']) && filter_var((string)$_GET['force_live'], FILTER_VALIDATE_BOOLEAN)) {
        $preferLive = true;
    }
    if (isset($_GET['cache_only']) && filter_var((string)$_GET['cache_only'], FILTER_VALIDATE_BOOLEAN)) {
        $preferLive = false;
    }

    $requestedWear = trim((string)($_GET['wear'] ?? ''));

    $wearList = STEAM_WEAR_LABELS;

    if ($requestedWear !== '') {

        if (!in_array($requestedWear, STEAM_WEAR_LABELS, true)) {

            throw new RuntimeException('Invalid wear.');

        }

        $wearList = [$requestedWear];

    }

    $supportsStatTrak = steamWearSupportsStatTrak($baseName);
    $supportsSouvenir = steamWearSupportsSouvenir($baseName);

    // The sidecar short-circuit used to test base-wear coverage only, so once a
    // file existed the endpoint never asked Steam for the special variant again
    // — a skin whose sidecar was written while it was mis-classified could never
    // pick up its Souvenir prices, which is what left the SV column empty even
    // after the classification was fixed. Require the cache to have been built
    // for the variant we now want; if not, fall through and fetch once. The
    // refetch rewrites the marker, so this costs one request per skin, not one
    // per page view, even when Steam turns out to have no listings.
    $sidecarPrices = steamWearLoadBucketSidecar($baseName);
    if (!$preferLive
        && steamWearBucketSidecarVariant($baseName) === steamWearCurrentVariant($baseName)
        && steamWearNamedPricesCoverSteam($sidecarPrices, $baseName, $wearList)) {
        $sidecarHasStatTrak = false;
        $sidecarHasSouvenir = false;
        foreach ($sidecarPrices as $marketName => $_price) {
            $label = (string)$marketName;
            if (str_contains($label, 'StatTrak')) {
                $sidecarHasStatTrak = true;
            }
            if (str_starts_with($label, 'Souvenir ')) {
                $sidecarHasSouvenir = true;
            }
        }
        $qualityRows = steamWearEmptyQualityRows($baseName, $wearList);
        steamWearApplyNamedPrices(
            $qualityRows,
            $wearList,
            $sidecarPrices,
            'steam_listing_buckets',
            $sidecarHasStatTrak,
            $sidecarHasSouvenir,
            $baseName
        );
        respondJson(steamWearPayload($baseName, $qualityRows, $sidecarHasStatTrak, $sidecarHasSouvenir));
    }

    // $supportsStatTrak / $supportsSouvenir are computed above the sidecar check.

    if ($preferLive) {
        $qualityRows = steamWearRefreshLiveTableRows($baseName, $wearList, $supportsStatTrak, $supportsSouvenir);
        respondJson(steamWearPayload($baseName, $qualityRows, $supportsStatTrak, $supportsSouvenir));
    }

    $marketNames = array_map(static fn (string $wear) => steamWearMarketName($baseName, $wear), $wearList);

    $stattrakNames = $supportsStatTrak
        ? array_map(static fn (string $wear) => steamStatTrakMarketName($baseName, $wear), $wearList)
        : [];

    $souvenirNames = $supportsSouvenir
        ? array_map(static fn (string $wear) => steamSouvenirMarketName($baseName, $wear), $wearList)
        : [];

    $dbBatch = steamWearDbBatch(array_merge($marketNames, $stattrakNames, $souvenirNames));

    $analystBatch = [];
    foreach ($marketNames as $marketName) {
        if (!isset($dbBatch[$marketName]) || steamWearPriceMissing($dbBatch[$marketName]['price'] ?? null)) {
            $analystBatch = steamWearAnalystBatch($baseName);
            break;
        }
    }



    // When souvenir variants exist, reserve Steam live budget for them first.

    // Normal wears already have strong DB/catalog coverage; SV variants often only exist live.

    $deferNormalLive = $supportsSouvenir && $preferLive;



    $qualityRows = [];

    foreach ($wearList as $wear) {

        $marketName = steamWearMarketName($baseName, $wear);

        // Cache/DB/catalog/sidecar first. Sequential priceoverview used to burn
        // the request budget before listing-histogram could fill MW/FT/ST.

        $resolved = steamResolveWearPrice(

            $marketName,

            false,

            $baseName,

            $wear,

            $dbBatch,

            $analystBatch

        );



        $stattrakPrice = null;
        if ($supportsStatTrak) {
            $stResolved = steamResolveWearPrice(
                steamStatTrakMarketName($baseName, $wear),
                false,
                '',
                '',
                $dbBatch,
                null
            );
            if ($stResolved !== null && !steamWearPriceMissing($stResolved['price'] ?? null)) {
                $stattrakPrice = $stResolved['price'];
            }
        }

        $souvenirPrice = null;
        if ($supportsSouvenir) {
            $svResolved = steamResolveWearPrice(
                steamSouvenirMarketName($baseName, $wear),
                false,
                '',
                '',
                $dbBatch,
                null
            );
            if ($svResolved !== null && !steamWearPriceMissing($svResolved['price'] ?? null)) {
                $souvenirPrice = $svResolved['price'];
            }
        }

        $qualityRows[] = [

            'wear' => $wear,

            'price' => $resolved['price'] ?? null,

            'volume' => (int)($resolved['volume'] ?? 0),

            'market_name' => $marketName,

            'stattrak' => $stattrakPrice,

            'souvenir' => $souvenirPrice,

            'source' => $resolved['source'] ?? null,

        ];

    }



    // Reuse the last listing-histogram matrix so cache-only still fills MW/FT/ST/SV.
    steamWearApplyNamedPrices(
        $qualityRows,
        $wearList,
        $sidecarPrices ?: steamWearLoadBucketSidecar($baseName),
        'steam_listing_buckets',
        $supportsStatTrak,
        $supportsSouvenir,
        $baseName
    );

    steamWearFillMissingFromMarketplaceQuotes(
        $qualityRows,
        $wearList,
        $baseName,
        $supportsStatTrak,
        $supportsSouvenir
    );

    if (!$preferLive) {
        [$importedPrices, $importedVolumes] = steamWearExportQualityPrices(
            $qualityRows,
            $baseName,
            $supportsStatTrak,
            $supportsSouvenir
        );
        steamWearSaveBucketSidecar($baseName, $importedPrices);
        steamWearPersistImportedPrices($importedPrices, $importedVolumes, $dbBatch);
        respondJson(steamWearPayload($baseName, $qualityRows, $supportsStatTrak, $supportsSouvenir));
    }

    // Overwrite stale cache: all 5 wears + StatTrak (and souvenir) in one parallel priceoverview wave.
    steamWearApplyLiveOverviewBatch(
        $qualityRows,
        $wearList,
        $baseName,
        steamWearFetchOverviewBatch(array_merge($marketNames, $stattrakNames, $souvenirNames), 8),
        $supportsStatTrak,
        $supportsSouvenir
    );

    // Listing histogram often has every wear in one page — fill gaps Steam overview skipped.

    $missingNormal = false;

    foreach ($qualityRows as $row) {

        if (!isset($row['price']) || !is_numeric($row['price']) || (float)$row['price'] <= 0) {

            $missingNormal = true;

            break;

        }

    }

    $bucketPrices = [];
    $missingStatTrak = false;
    if ($supportsStatTrak) {
        foreach ($qualityRows as $row) {
            if (!isset($row['stattrak']) || !is_numeric($row['stattrak']) || (float)$row['stattrak'] <= 0) {
                $missingStatTrak = true;
                break;
            }
        }
    }

    if (($missingNormal || $missingStatTrak) && $preferLive) {

        $bucketSeedNames = [

            steamWearMarketName($baseName, 'Field-Tested'),

            steamWearMarketName($baseName, 'Factory New'),

            steamWearMarketName($baseName, 'Minimal Wear'),

        ];

        $bucketPrices = [];

        foreach ($bucketSeedNames as $seedName) {

            if ($seedName === '') {

                continue;

            }

            $bucketPrices = steamWearFetchListingBucketPrices($seedName);

            if ($bucketPrices) {

                break;

            }

            usleep(400000);

        }

        if ($bucketPrices) {
            steamWearSaveBucketSidecar($baseName, $bucketPrices);

            foreach ($wearList as $index => $wear) {

                $current = $qualityRows[$index]['price'] ?? null;

                if (isset($current) && is_numeric($current) && (float)$current > 0) {

                    continue;

                }

                $marketName = steamWearMarketName($baseName, $wear);

                $bucketPrice = isset($bucketPrices[$marketName]) ? (float)$bucketPrices[$marketName] : 0.0;

                if ($bucketPrice <= 0) {

                    continue;

                }

                $qualityRows[$index]['price'] = $bucketPrice;

                $qualityRows[$index]['source'] = 'steam_listing_buckets';

                cachedFileSave($marketName, 'steam', [

                    'current_price' => $bucketPrice,

                    'sell_orders' => null,

                    'volume_24h' => null,

                    'buy_orders' => null,

                    'price_history' => null,

                    'updated_at' => gmdate(DATE_ATOM),

                    'steam_price_source' => 'steam_listing_buckets',

                ]);

                if ($supportsStatTrak) {
                    $stName = steamStatTrakMarketName($baseName, $wear);
                    $stBucket = isset($bucketPrices[$stName]) ? (float)$bucketPrices[$stName] : 0.0;
                    $currentSt = $qualityRows[$index]['stattrak'] ?? null;
                    if ($stBucket > 0 && steamWearPriceMissing($currentSt)) {
                        $qualityRows[$index]['stattrak'] = $stBucket;
                        cachedFileSave($stName, 'steam', [
                            'current_price' => $stBucket,
                            'sell_orders' => null,
                            'volume_24h' => null,
                            'buy_orders' => null,
                            'price_history' => null,
                            'updated_at' => gmdate(DATE_ATOM),
                            'steam_price_source' => 'steam_listing_buckets',
                        ]);
                    }
                }

            }

        }

    }



    if ($supportsStatTrak && $bucketPrices) {
        foreach ($wearList as $index => $wear) {
            $stName = steamStatTrakMarketName($baseName, $wear);
            $stBucket = isset($bucketPrices[$stName]) ? (float)$bucketPrices[$stName] : 0.0;
            $currentSt = $qualityRows[$index]['stattrak'] ?? null;
            if ($stBucket > 0 && steamWearPriceMissing($currentSt)) {
                $qualityRows[$index]['stattrak'] = $stBucket;
                cachedFileSave($stName, 'steam', [
                    'current_price' => $stBucket,
                    'sell_orders' => null,
                    'volume_24h' => null,
                    'buy_orders' => null,
                    'price_history' => null,
                    'updated_at' => gmdate(DATE_ATOM),
                    'steam_price_source' => 'steam_listing_buckets',
                ]);
            }
        }
    }

    if ($bucketPrices) {
        steamWearPersistImportedPrices($bucketPrices, [], $dbBatch);
    }

    if ($supportsStatTrak && $preferLive) {
        $stStillMissing = false;
        foreach ($qualityRows as $row) {
            if (steamWearPriceMissing($row['stattrak'] ?? null)) {
                $stStillMissing = true;
                break;
            }
        }
        if ($stStillMissing) {
            $stBucketPrices = [];
            foreach ([
                steamStatTrakMarketName($baseName, 'Field-Tested'),
                steamStatTrakMarketName($baseName, 'Factory New'),
            ] as $seedName) {
                if ($seedName === '') {
                    continue;
                }
                usleep(400000);
                $stBucketPrices = steamWearFetchListingBucketPrices($seedName);
                if ($stBucketPrices) {
                    break;
                }
            }
            if ($stBucketPrices) {
                steamWearSaveBucketSidecar($baseName, $stBucketPrices);
                foreach ($wearList as $index => $wear) {
                    $stName = steamStatTrakMarketName($baseName, $wear);
                    $stBucket = isset($stBucketPrices[$stName]) ? (float)$stBucketPrices[$stName] : 0.0;
                    if ($stBucket > 0 && steamWearPriceMissing($qualityRows[$index]['stattrak'] ?? null)) {
                        $qualityRows[$index]['stattrak'] = $stBucket;
                        cachedFileSave($stName, 'steam', [
                            'current_price' => $stBucket,
                            'sell_orders' => null,
                            'volume_24h' => null,
                            'buy_orders' => null,
                            'price_history' => null,
                            'updated_at' => gmdate(DATE_ATOM),
                            'steam_price_source' => 'steam_listing_buckets',
                        ]);
                    }
                }
                steamWearPersistImportedPrices($stBucketPrices, [], $dbBatch);
            }
        }
    }

    [$importedPrices, $importedVolumes] = steamWearExportQualityPrices(
        $qualityRows,
        $baseName,
        $supportsStatTrak,
        $supportsSouvenir
    );
    steamWearSaveBucketSidecar($baseName, $importedPrices);
    steamWearPersistImportedPrices($importedPrices, $importedVolumes, $dbBatch);

    if ($supportsSouvenir) {

        foreach ($wearList as $index => $wear) {

            if (!steamWearPriceMissing($qualityRows[$index]['souvenir'] ?? null)) {

                continue;

            }

            $svName = steamSouvenirMarketName($baseName, $wear);

            $resolved = steamResolveSouvenirWearPrice($svName, $preferLive, $dbBatch, true);

            if ($resolved !== null && !steamWearPriceMissing($resolved['price'] ?? null)) {

                $qualityRows[$index]['souvenir'] = $resolved['price'];

            }

        }



        if ($preferLive) {

            $bucketSeedNames = [

                steamWearMarketName($baseName, 'Factory New'),

                steamSouvenirMarketName($baseName, 'Factory New'),

                steamWearMarketName($baseName, 'Field-Tested'),

            ];

            $bucketPrices = [];

            foreach ($bucketSeedNames as $seedName) {

                if ($seedName === '') {

                    continue;

                }

                $bucketPrices = steamWearFetchListingBucketPrices($seedName);

                if ($bucketPrices) {

                    break;

                }

                usleep(400000);

            }



            if ($bucketPrices) {
                steamWearSaveBucketSidecar($baseName, $bucketPrices);

                foreach ($wearList as $index => $wear) {

                    $svName = steamSouvenirMarketName($baseName, $wear);

                    $bucketPrice = isset($bucketPrices[$svName]) ? (float)$bucketPrices[$svName] : 0.0;

                    if ($bucketPrice <= 0) {

                        continue;

                    }

                    // Prefer the Steam listing matrix when available — it covers wears that

                    // priceoverview often omits for low-volume souvenir variants.

                    $qualityRows[$index]['souvenir'] = $bucketPrice;

                    cachedFileSave($svName, 'steam', [

                        'current_price' => $bucketPrice,

                        'sell_orders' => null,

                        'volume_24h' => null,

                        'buy_orders' => null,

                        'price_history' => null,

                        'updated_at' => gmdate(DATE_ATOM),

                        'steam_price_source' => 'steam_listing_buckets',

                    ]);

                }

            }

        }

    }



    if ($deferNormalLive || $preferLive) {

        foreach ($qualityRows as $index => $row) {

            if (isset($row['price']) && is_numeric($row['price']) && (float)$row['price'] > 0) {

                continue;

            }

            $marketName = steamWearMarketName($baseName, (string)$row['wear']);

            $live = steamFillMissingWearPrice($marketName, true);

            if ($live !== null && (float)$live['price'] > 0) {

                $qualityRows[$index]['price'] = $live['price'];

                $qualityRows[$index]['volume'] = (int)($live['volume'] ?? 0);

                $qualityRows[$index]['source'] = (string)($live['source'] ?? 'priceoverview');

            }

        }

    }



    $uniformWearPrice = steamWearDetectUniformListingPrice($qualityRows);

    if ($uniformWearPrice !== null) {

        foreach ($qualityRows as $index => $row) {

            $wear = (string)($row['wear'] ?? '');

            if ($wear === '' || abs((float)($row['price'] ?? 0) - $uniformWearPrice) > 0.009) {

                continue;

            }

            $marketName = steamWearMarketName($baseName, $wear);

            $live = steamWearPriceLive($marketName);

            if ($live !== null && (float)$live['price'] > 0) {

                $qualityRows[$index]['price'] = $live['price'];

                $qualityRows[$index]['volume'] = (int)($live['volume'] ?? 0);

                $qualityRows[$index]['source'] = (string)($live['source'] ?? 'priceoverview');

            }

        }

    }



    if ($supportsStatTrak) {

        foreach ($wearList as $index => $wear) {

            if (!steamWearPriceMissing($qualityRows[$index]['stattrak'] ?? null)) {

                continue;

            }

            $stName = steamStatTrakMarketName($baseName, $wear);

            $resolved = steamResolveWearPrice($stName, $preferLive, '', '', $dbBatch, null);

            if ($resolved === null && $preferLive) {

                $resolved = steamFillMissingWearPrice($stName, true);

            }

            if ($resolved !== null && !steamWearPriceMissing($resolved['price'] ?? null)) {

                $qualityRows[$index]['stattrak'] = $resolved['price'];

            }

        }

    }



    [$importedPrices, $importedVolumes] = steamWearExportQualityPrices(
        $qualityRows,
        $baseName,
        $supportsStatTrak,
        $supportsSouvenir
    );
    steamWearSaveBucketSidecar($baseName, $importedPrices);
    steamWearPersistImportedPrices($importedPrices, $importedVolumes, $dbBatch);

    respondJson([

        'lookup_name' => $baseName,

        'origin' => steamWearRequestOrigin($baseName),

        'variant' => $supportsStatTrak ? 'stattrak' : ($supportsSouvenir ? 'souvenir' : null),

        'quality_rows' => $qualityRows,

        'updated_at' => gmdate(DATE_ATOM),

    ]);

} catch (Throwable $exception) {

    respondJson(['error' => $exception->getMessage()], 500);

}

