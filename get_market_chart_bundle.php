<?php
declare(strict_types=1);

require_once __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/csfloat_history_lib.php';
require_once __DIR__ . '/white_market_history_lib.php';
require_once __DIR__ . '/dmarket_helpers.php';
require_once __DIR__ . '/market_csgo_helpers.php';
require_once __DIR__ . '/shadowpay_helpers.php';
require_once __DIR__ . '/waxpeer_helpers.php';
require_once __DIR__ . '/mannco_helpers.php';
require_once __DIR__ . '/haloskins_helpers.php';
require_once __DIR__ . '/rapidskins_helpers.php';
require_once __DIR__ . '/supabase_client.php';

if (!defined('STEAM_MARKET_HISTORY_LIB_ONLY')) {
    define('STEAM_MARKET_HISTORY_LIB_ONLY', true);
}
require_once __DIR__ . '/get_steam_market_activity.php';

require_once __DIR__ . '/market_chart_bundle_cache.php';
if (!defined('MARKET_CHART_BUNDLE_LIB_ONLY')) {
    header('Content-Type: application/json; charset=utf-8');
    // Serve the cached bundle when there is one (see market_chart_bundle_cache.php);
    // otherwise buffer this run's output so it gets stored for the next visitor.
    marketChartBundleCacheStart($_GET);
}

/* ────────────────────────────────────────────────────────────────
   Wear-specific price anchors (€ midpoints per source)
   Used when the database has no real history yet.
──────────────────────────────────────────────────────────────── */
const WEAR_PRICE_ANCHORS = [
    'Factory New'   => ['steam' => 229.21, 'skinport' => 157.04, 'csfloat' => 162.50, 'white_market' => 154.40, 'dmarket' => 139.51, 'market_csgo' => 140.10, 'shadowpay' => 139.80, 'waxpeer' => 139.50, 'mannco' => 139.30, 'haloskins' => 139.20, 'rapidskins' => 139.10],
    'Minimal Wear'  => ['steam' => 108.46, 'skinport' =>  98.80, 'csfloat' => 105.30, 'white_market' =>  96.40, 'dmarket' =>  92.10, 'market_csgo' =>  92.60, 'shadowpay' =>  92.30, 'waxpeer' =>  92.00, 'mannco' =>  91.85, 'haloskins' =>  91.70, 'rapidskins' =>  91.60],
    'Field-Tested'  => ['steam' =>  60.36, 'skinport' =>  54.20, 'csfloat' =>  57.90, 'white_market' =>  52.40, 'dmarket' =>  49.90, 'market_csgo' =>  50.20, 'shadowpay' =>  49.95, 'waxpeer' =>  49.70, 'mannco' =>  49.55, 'haloskins' =>  49.40, 'rapidskins' =>  49.30],
    'Well-Worn'     => ['steam' =>  54.24, 'skinport' =>  49.10, 'csfloat' =>  52.00, 'white_market' =>  47.60, 'dmarket' =>  45.40, 'market_csgo' =>  45.70, 'shadowpay' =>  45.50, 'waxpeer' =>  45.30, 'mannco' =>  45.15, 'haloskins' =>  45.00, 'rapidskins' =>  44.90],
    'Battle-Scarred'=> ['steam' =>  53.06, 'skinport' =>  47.50, 'csfloat' =>  50.40, 'white_market' =>  46.20, 'dmarket' =>  43.80, 'market_csgo' =>  44.10, 'shadowpay' =>  43.90, 'waxpeer' =>  43.70, 'mannco' =>  43.55, 'haloskins' =>  43.40, 'rapidskins' =>  43.30],
];

/* Volume typical per source (listings per day) */
const WEAR_VOLUME_BASE = [
    'Factory New'    => ['steam' => 38, 'skinport' => 22, 'csfloat' => 31, 'white_market' => 16, 'dmarket' => 14, 'market_csgo' => 20, 'shadowpay' => 18, 'waxpeer' => 16, 'mannco' => 15, 'haloskins' => 14, 'rapidskins' => 13],
    'Minimal Wear'   => ['steam' => 55, 'skinport' => 30, 'csfloat' => 42, 'white_market' => 23, 'dmarket' => 20, 'market_csgo' => 28, 'shadowpay' => 24, 'waxpeer' => 22, 'mannco' => 21, 'haloskins' => 20, 'rapidskins' => 19],
    'Field-Tested'   => ['steam' => 72, 'skinport' => 41, 'csfloat' => 58, 'white_market' => 33, 'dmarket' => 28, 'market_csgo' => 40, 'shadowpay' => 32, 'waxpeer' => 30, 'mannco' => 29, 'haloskins' => 28, 'rapidskins' => 27],
    'Well-Worn'      => ['steam' => 24, 'skinport' => 12, 'csfloat' => 18, 'white_market' => 10, 'dmarket' => 9, 'market_csgo' => 14, 'shadowpay' => 12, 'waxpeer' => 11, 'mannco' => 10, 'haloskins' => 10, 'rapidskins' => 9],
    'Battle-Scarred' => ['steam' => 16, 'skinport' =>  8, 'csfloat' => 11, 'white_market' =>  7, 'dmarket' => 6, 'market_csgo' => 10, 'shadowpay' => 8, 'waxpeer' => 7, 'mannco' => 7, 'haloskins' => 6, 'rapidskins' => 6],
];

function marketChartPriceRatios(): array
{
    static $ratios = null;
    if ($ratios !== null) {
        return $ratios;
    }

    $ratios = [];
    foreach (WEAR_PRICE_ANCHORS as $wear => $sources) {
        $steamAnchor = max(0.01, (float)($sources['steam'] ?? 0.01));
        foreach ($sources as $source => $anchor) {
            $ratios[$wear][$source] = round(((float)$anchor) / $steamAnchor, 6);
        }
    }

    return $ratios;
}

function marketChartVolumeRatios(): array
{
    static $ratios = null;
    if ($ratios !== null) {
        return $ratios;
    }

    $ratios = [];
    foreach (WEAR_VOLUME_BASE as $wear => $sources) {
        $steamVolume = max(1, (int)($sources['steam'] ?? 1));
        foreach ($sources as $source => $volume) {
            $ratios[$wear][$source] = ((int)$volume) / $steamVolume;
        }
    }

    return $ratios;
}

function marketChartSplitLookupName(string $lookupName): array
{
    $cleanName = trim($lookupName);
    if (preg_match('/^(.*)\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i', $cleanName, $matches)) {
        return [trim((string)$matches[1]), trim((string)$matches[2])];
    }

    return [$cleanName, ''];
}

/**
 * Agent names look like a skin ("Sir Bloody Miami Darryl | The Professionals")
 * but have no wear; asking Steam for "... (Factory New)" returns nothing and
 * the chart stayed empty. Names come from agents.html's group map, with the
 * faction suffix as a fallback for agents missing there.
 *
 * @return array<string, true>
 */
function marketChartAgentNames(): array
{
    static $names = null;
    if (is_array($names)) {
        return $names;
    }
    $names = [];
    $mapFile = __DIR__ . '/react/agent-group-map.js';
    if (is_file($mapFile) && preg_match_all('/"([^"|]+\|[^"]+)"/u', (string)file_get_contents($mapFile), $m)) {
        foreach ($m[1] as $raw) {
            $names[mb_strtolower(trim((string)$raw))] = true;
        }
    }
    return $names;
}

function marketChartLooksLikeAgent(string $title): bool
{
    $clean = mb_strtolower(trim($title));
    if ($clean === '' || !str_contains($clean, '|')) {
        return false;
    }
    if (isset(marketChartAgentNames()[$clean])) {
        return true;
    }
    return (bool)preg_match(
        '/\|\s*(the professionals|gendarmerie nationale|swat|seal frogman|nswc seal|fbi(?: swat| hrt| sniper)?|sabre(?: footsoldier)?|elite crew|phoenix|guerrilla warfare|tacp cavalry|usaf tacp|ksk|brazilian 1st battalion|nzsas|ground rebel|anarchist|balkan|pirate|separatist|leet crew)\s*$/u',
        $clean
    );
}

function marketChartItemExcludesWearVariants(string $title): bool
{
    $cleanTitle = trim($title);
    if ($cleanTitle === '') {
        return true;
    }

    // "Souvenir Charm | ..." and "StatTrak™ Music Kit | ..." carry a prefix
    // before the type word; they have no wear either.
    if (preg_match('/^(?:Souvenir\s+|StatTrak(?:™|\x{2122})?\s+)?(Sticker|Patch|Sealed Graffiti|Graffiti|Music Kit|Charm|Agent|Pin|Collectible|Tool|Key|Name Tag|Pass)\s*\|/iu', $cleanTitle)) {
        return true;
    }

    if (marketChartLooksLikeAgent($cleanTitle)) {
        return true;
    }

    if (preg_match('/^(Storage Unit|Sticker Capsule|Autograph Capsule|Souvenir Package|Patch Pack|Music Kit Box|Graffiti Box|Sticker Collection)\b/i', $cleanTitle)) {
        return true;
    }

    if (preg_match('/\bcase\b/i', $cleanTitle)) {
        return true;
    }

    return false;
}

function marketChartSupportsWearRows(string $lookupName): bool
{
    [$baseName, $existingWear] = marketChartSplitLookupName($lookupName);
    if ($baseName === '' || !str_contains($baseName, '|')) {
        return false;
    }

    if ($existingWear !== '') {
        return !marketChartItemExcludesWearVariants($baseName);
    }

    return !marketChartItemExcludesWearVariants($baseName);
}

function marketChartFlatAnchorWear(): string
{
    return '__flat__';
}

function marketChartBootstrapAnchors(bool $supportsWear, string $lookupName, string $marketHashName, string $requestedWear): string
{
    if ($supportsWear) {
        $validWears = array_keys(WEAR_PRICE_ANCHORS);
        $anchorWear = in_array($requestedWear, $validWears, true) ? $requestedWear : 'Field-Tested';
        marketChartApplyLiveAnchors($anchorWear, $marketHashName);
        return $anchorWear;
    }

    $flatKey = marketChartFlatAnchorWear();
    $basePrice = marketChartCatalogPrice($lookupName);
    if ($basePrice === null || $basePrice <= 0) {
        $basePrice = marketChartLoadProviderCacheAnchor($marketHashName, 'steam');
    }

    $referenceWear = 'Field-Tested';
    $referenceSteam = max(0.01, (float)(WEAR_PRICE_ANCHORS[$referenceWear]['steam'] ?? 60.0));
    $scale = ($basePrice !== null && $basePrice > 0) ? ($basePrice / $referenceSteam) : 1.0;

    $GLOBALS['__dynamic_anchors'][$flatKey] = [];
    $GLOBALS['__dynamic_volumes'][$flatKey] = [];
    foreach (WEAR_PRICE_ANCHORS[$referenceWear] as $source => $defaultAnchor) {
        $livePrice = marketChartLoadProviderCacheAnchor($marketHashName, $source);
        $defaultRatio = (float)$defaultAnchor / $referenceSteam;
        $GLOBALS['__dynamic_anchors'][$flatKey][$source] = $livePrice ?? round($referenceSteam * $defaultRatio * $scale, 2);
        $GLOBALS['__dynamic_volumes'][$flatKey][$source] = (int)(WEAR_VOLUME_BASE[$referenceWear][$source] ?? 1);
    }

    return $flatKey;
}

function marketChartCatalogPrice(string $lookupName): ?float
{
    static $priceLookup = null;
    if ($priceLookup === null) {
        $priceLookup = [];
        $catalogPath = __DIR__ . '/assets/steam-market-cache/catalog.json';
        $catalog = is_file($catalogPath) ? json_decode((string)file_get_contents($catalogPath), true) : null;
        foreach ((array)($catalog['items'] ?? []) as $item) {
            if (!is_array($item)) {
                continue;
            }
            $price = isset($item['sell_price']) && is_numeric($item['sell_price'])
                ? (float)$item['sell_price']
                : 0.0;
            if ($price <= 0) {
                continue;
            }

            foreach (array_unique(array_filter([
                trim((string)($item['market_hash_name'] ?? '')),
                trim((string)($item['name'] ?? '')),
            ])) as $name) {
                $priceLookup[$name] = $price;
            }
        }
    }

    $cleanName = trim($lookupName);
    if ($cleanName === '') {
        return null;
    }

    if (isset($priceLookup[$cleanName]) && $priceLookup[$cleanName] > 0) {
        return (float)$priceLookup[$cleanName];
    }

    [$baseName] = marketChartSplitLookupName($cleanName);
    if ($baseName !== '' && isset($priceLookup[$baseName]) && $priceLookup[$baseName] > 0) {
        return (float)$priceLookup[$baseName];
    }

    return null;
}

function marketChartAllLatestWearData(?PDO $pdo, int $itemId): array
{
    static $cache = [];
    $cacheKey = $itemId . '|' . ($pdo ? spl_object_id($pdo) : 'none');
    if (isset($cache[$cacheKey])) {
        return $cache[$cacheKey];
    }

    $sources = ['steam', 'skinport', 'csfloat', 'white_market', 'dmarket', 'market_csgo', 'shadowpay', 'waxpeer', 'mannco', 'haloskins', 'rapidskins'];
    $rows = [];
    foreach ($sources as $source) {
        $rows[$source] = $pdo ? tryLoadLatestWearPrices($pdo, $itemId, $source) : [];
    }

    return $cache[$cacheKey] = $rows;
}

function marketChartDynamicMaps(?PDO $pdo, int $itemId, string $lookupName, string $selectedWear): array
{
    $selectedWear = isset(WEAR_PRICE_ANCHORS[$selectedWear]) ? $selectedWear : 'Field-Tested';
    $observed = marketChartAllLatestWearData($pdo, $itemId);
    $priceRatios = marketChartPriceRatios();
    $volumeRatios = marketChartVolumeRatios();
    $selectedDefaultSteam = max(0.01, (float)(WEAR_PRICE_ANCHORS[$selectedWear]['steam'] ?? 0.01));
    $selectedDefaultVolume = max(1, (int)(WEAR_VOLUME_BASE[$selectedWear]['steam'] ?? 1));

    $selectedSteamAnchor = isset($observed['steam'][$selectedWear]['price']) && (float)$observed['steam'][$selectedWear]['price'] > 0
        ? (float)$observed['steam'][$selectedWear]['price']
        : null;

    if ($selectedSteamAnchor === null) {
        foreach (['skinport', 'csfloat', 'white_market', 'dmarket', 'market_csgo', 'shadowpay', 'waxpeer', 'mannco', 'haloskins', 'rapidskins'] as $source) {
            $sourcePrice = (float)($observed[$source][$selectedWear]['price'] ?? 0);
            $ratio = (float)($priceRatios[$selectedWear][$source] ?? 0);
            if ($sourcePrice > 0 && $ratio > 0) {
                $selectedSteamAnchor = round($sourcePrice / $ratio, 2);
                break;
            }
        }
    }

    if ($selectedSteamAnchor === null) {
        $selectedSteamAnchor = marketChartCatalogPrice($lookupName);
    }

    if ($selectedSteamAnchor === null || $selectedSteamAnchor <= 0) {
        $selectedSteamAnchor = (float)(WEAR_PRICE_ANCHORS[$selectedWear]['steam'] ?? WEAR_PRICE_ANCHORS['Factory New']['steam']);
    }

    $selectedSteamVolume = isset($observed['steam'][$selectedWear]['volume']) && (int)$observed['steam'][$selectedWear]['volume'] > 0
        ? (int)$observed['steam'][$selectedWear]['volume']
        : max(1, (int)round($selectedDefaultVolume * max(0.4, min(3.5, $selectedSteamAnchor / $selectedDefaultSteam))));

    $anchors = [];
    $volumes = [];
    foreach (array_keys(WEAR_PRICE_ANCHORS) as $wear) {
        $defaultSteamAnchor = max(0.01, (float)(WEAR_PRICE_ANCHORS[$wear]['steam'] ?? 0.01));
        $defaultSteamVolume = max(1, (int)(WEAR_VOLUME_BASE[$wear]['steam'] ?? 1));
        $steamBase = isset($observed['steam'][$wear]['price']) && (float)$observed['steam'][$wear]['price'] > 0
            ? (float)$observed['steam'][$wear]['price']
            : null;

        if ($steamBase === null) {
            $derivedAnchors = [];
            foreach (['skinport', 'csfloat', 'white_market', 'dmarket', 'market_csgo', 'shadowpay', 'waxpeer', 'mannco', 'haloskins', 'rapidskins'] as $source) {
                $sourcePrice = (float)($observed[$source][$wear]['price'] ?? 0);
                $ratio = (float)($priceRatios[$wear][$source] ?? 0);
                if ($sourcePrice > 0 && $ratio > 0) {
                    $derivedAnchors[] = $sourcePrice / $ratio;
                }
            }
            if ($derivedAnchors) {
                $steamBase = round(array_sum($derivedAnchors) / count($derivedAnchors), 2);
            }
        }

        if ($steamBase === null) {
            $steamBase = round($selectedSteamAnchor * ($defaultSteamAnchor / $selectedDefaultSteam), 2);
        }

        $steamVolume = isset($observed['steam'][$wear]['volume']) && (int)$observed['steam'][$wear]['volume'] > 0
            ? (int)$observed['steam'][$wear]['volume']
            : max(1, (int)round($selectedSteamVolume * ($defaultSteamVolume / $selectedDefaultVolume)));

        foreach (WEAR_PRICE_ANCHORS[$wear] as $source => $defaultAnchor) {
            $observedPrice = (float)($observed[$source][$wear]['price'] ?? 0);
            $observedVolume = (int)($observed[$source][$wear]['volume'] ?? 0);
            $priceRatio = (float)($priceRatios[$wear][$source] ?? 1.0);
            // Flat items use wear key __flat__, which is not in WEAR_VOLUME_BASE — fall back
            // to Field-Tested ratios so invented listing shares stay distinct (not Steam clones).
            $ratioWear = isset($volumeRatios[$wear]) ? $wear : 'Field-Tested';
            $volumeRatio = (float)($volumeRatios[$ratioWear][$source] ?? ($volumeRatios['Field-Tested'][$source] ?? 0.35));

            $anchors[$wear][$source] = $observedPrice > 0
                ? round($observedPrice, 2)
                : round($steamBase * $priceRatio, 2);
            if ($observedVolume > 0) {
                $volumes[$wear][$source] = $observedVolume;
            } elseif ($source === 'steam') {
                $volumes[$wear][$source] = max(1, (int)round($steamVolume * $volumeRatio));
            } else {
                // Distinct relative listing share for every marketplace (cases/stickers included).
                $volumes[$wear][$source] = max(1, (int)round($steamVolume * $volumeRatio));
            }
        }
    }

    return [
        'anchors' => $anchors,
        'volumes' => $volumes,
    ];
}

function marketChartActiveAnchors(string $wear): array
{
    return $GLOBALS['__dynamic_anchors'][$wear]
        ?? WEAR_PRICE_ANCHORS[$wear]
        ?? ($wear === marketChartFlatAnchorWear() ? ($GLOBALS['__dynamic_anchors'][marketChartFlatAnchorWear()] ?? WEAR_PRICE_ANCHORS['Field-Tested'])
        : WEAR_PRICE_ANCHORS['Field-Tested']);
}

function marketChartActiveVolumes(string $wear): array
{
    return $GLOBALS['__dynamic_volumes'][$wear]
        ?? WEAR_VOLUME_BASE[$wear]
        ?? ($wear === marketChartFlatAnchorWear() ? ($GLOBALS['__dynamic_volumes'][marketChartFlatAnchorWear()] ?? WEAR_VOLUME_BASE['Field-Tested'])
        : WEAR_VOLUME_BASE['Field-Tested']);
}

/* ────────────────────────────────────────────────────────────────
   Helpers
──────────────────────────────────────────────────────────────── */

function normalizeMarketChartSource(string $value): string
{
    return match (strtolower(trim($value))) {
        'steam', 'steam market'            => 'steam',
        'skinport'                         => 'skinport',
        'csfloat', 'cs.float', 'cs float' => 'csfloat',
        'white_market', 'whitemarket', 'white.market', 'white market' => 'white_market',
        'dmarket', 'd market' => 'dmarket',
        'market_csgo', 'market.csgo', 'market csgo', 'marketcsgo' => 'market_csgo',
        'shadowpay', 'shadow pay', 'shadow.pay' => 'shadowpay',
        'waxpeer', 'wax peer', 'wax.peer' => 'waxpeer',
        'mannco', 'mannco.store', 'mannco store', 'mannco-store' => 'mannco',
        'haloskins', 'halo skins', 'halo.skins', 'haloskin' => 'haloskins',
        'rapidskins', 'rapid skins', 'rapid.skins', 'rapidskin' => 'rapidskins',
        default                            => 'steam',
    };
}

function marketChartRangeDays(string $range): int
{
    return match (strtoupper(trim($range))) {
        '7D'  => 7,
        '30D' => 30,
        '90D' => 90,
        '180D' => 180,
        '1M'  => 30,
        '3M'  => 90,
        '6M'  => 180,
        '1Y'  => 365,
        'ALL', 'MAX' => 5000,
        default => 365,
    };
}

function marketChartIsoDate(string $driver): string
{
    return match ($driver) {
        'sqlsrv' => "CONVERT(VARCHAR(10), recorded_at, 120)",
        'pgsql'  => "TO_CHAR(recorded_at, 'YYYY-MM-DD')",
        default  => "DATE_FORMAT(recorded_at, '%Y-%m-%d')",
    };
}

/**
 * Generate realistic-looking price history using seeded pseudo-noise.
 * Produces a smooth trend with small daily fluctuations.
 */
function generateFallbackSeries(string $wear, string $source, int $days): array
{
    $anchors = marketChartActiveAnchors($wear);
    $volBase = marketChartActiveVolumes($wear);
    $basePrice = (float)($anchors[$source] ?? $anchors['steam']);
    $baseVol   = (int)($volBase[$source]   ?? $volBase['steam']);

    // Seed from wear+source so curves are consistent per item/wear/source
    $seed = crc32((string)($GLOBALS['__chart_seed'] ?? 'global') . '|' . $wear . '|' . $source);

    $rows = [];
    $price = $basePrice * 0.88; // start ~12% below current
    $today = new DateTimeImmutable('today', new DateTimeZone('UTC'));

    for ($i = $days; $i >= 0; $i--) {
        $day = $today->modify("-{$i} day");

        // Seeded noise in range [-1, 1]
        $noise1 = sin($seed * 12.9898 + $i * 78.233) * 43758.5453;
        $noise1 -= floor($noise1);
        $noise2 = sin($seed * 1.2345  + $i * 43.112) * 18271.9812;
        $noise2 -= floor($noise2);

        $dailySwing  = ($noise1 - 0.5) * $basePrice * 0.012;
        $trendNudge  = ($basePrice - $price) * 0.06; // pull toward target
        $price      += $dailySwing + $trendNudge;
        $price       = max($price, $basePrice * 0.78);

        $volNoise = ($noise2 * 2 - 1) * $baseVol * 0.35;
        $vol = max(1, (int)round($baseVol + $volNoise));

        $rows[] = [
            'date'   => $day->format('Y-m-d'),
            'price'  => round($price, 2),
            'volume' => $vol,
            'synthetic' => true,
        ];
    }

    return $rows;
}

/**
 * Try to load real price history. Tries Supabase first, then falls back to local DB.
 */
function tryLoadDbSeries(PDO $pdo, int $itemId, string $wear, string $source, int $days, bool $supportsWear = true): array
{
    try {
        $driver   = pdoDriverName($pdo);
        $dateExpr = marketChartIsoDate($driver);
        $dbSource = marketChartDbSource($source);
        $cutoff = (new DateTimeImmutable("today -{$days} days", new DateTimeZone('UTC')))->format('Y-m-d');
        $rows = [];

        if (dbTableExists($pdo, 'provider_price_history') && (!$supportsWear || dbColumnExists($pdo, 'provider_price_history', 'wear'))) {
            $providerSql = $supportsWear
                ? "SELECT {$dateExpr} AS day, ROUND(AVG(price),2) AS price, COUNT(*) AS volume
                   FROM provider_price_history
                   WHERE item_id = :iid AND wear = :wear AND provider = :source
                     AND recorded_at >= :cutoff
                   GROUP BY {$dateExpr}
                   ORDER BY day ASC"
                : "SELECT {$dateExpr} AS day, ROUND(AVG(price),2) AS price, COUNT(*) AS volume
                   FROM provider_price_history
                   WHERE item_id = :iid AND provider = :source
                     AND recorded_at >= :cutoff
                   GROUP BY {$dateExpr}
                   ORDER BY day ASC";
            $stmt = $pdo->prepare($providerSql);
            $params = [':iid' => $itemId, ':source' => $dbSource, ':cutoff' => $cutoff];
            if ($supportsWear) {
                $params[':wear'] = $wear;
            }
            $stmt->execute($params);
            foreach ($stmt->fetchAll() as $row) {
                $rows[] = [
                    'date'   => (string)$row['day'],
                    'price'  => round((float)$row['price'], 2),
                    'volume' => (int)$row['volume'],
                ];
            }
        }

        if (count($rows) < 3 && dbTableExists($pdo, 'price_history') && (!$supportsWear || dbColumnExists($pdo, 'price_history', 'wear'))) {
            $historySql = $supportsWear
                ? "SELECT {$dateExpr} AS day, ROUND(AVG(price),2) AS price, COALESCE(SUM(volume),0) AS volume
                   FROM price_history
                   WHERE item_id = :iid AND wear = :wear AND source = :source
                     AND recorded_at >= :cutoff
                   GROUP BY {$dateExpr}
                   ORDER BY day ASC"
                : "SELECT {$dateExpr} AS day, ROUND(AVG(price),2) AS price, COALESCE(SUM(volume),0) AS volume
                   FROM price_history
                   WHERE item_id = :iid AND source = :source
                     AND recorded_at >= :cutoff
                   GROUP BY {$dateExpr}
                   ORDER BY day ASC";
            $stmt = $pdo->prepare($historySql);
            $params = [':iid' => $itemId, ':source' => $dbSource, ':cutoff' => $cutoff];
            if ($supportsWear) {
                $params[':wear'] = $wear;
            }
            $stmt->execute($params);

            $rows = [];
            foreach ($stmt->fetchAll() as $row) {
                $rows[] = [
                    'date'   => (string)$row['day'],
                    'price'  => round((float)$row['price'], 2),
                    'volume' => (int)$row['volume'],
                ];
            }
        }

        if (count($rows) >= 3) {
            return $rows;
        }
    } catch (Throwable) {
        // Fall back to Supabase below if the local connection fails.
    }

    return [];
}

/** Trim a series to the last $days data-points chronologically. */
function trimSeriesToDays(array $rows, int $days): array
{
    if (!$rows || $days <= 0) {
        return $rows;
    }
    $cutoff = (new DateTimeImmutable("today -{$days} days", new DateTimeZone('UTC')))->format('Y-m-d');
    return array_values(array_filter($rows, fn($r) => $r['date'] >= $cutoff));
}

function trimSeriesToSince(array $rows, string $since): array
{
    $since = trim($since);
    if ($since === '' || !$rows) {
        return $rows;
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $since)) {
        return $rows;
    }
    return array_values(array_filter($rows, static fn(array $row): bool => (string)($row['date'] ?? '') >= $since));
}

function latestPoint(array $rows): ?array
{
    return $rows ? $rows[array_key_last($rows)] : null;
}

function marketChartMedian(array $values): float
{
    $clean = array_values(array_filter(array_map(static fn($value): float => (float)$value, $values), static fn(float $value): bool => $value > 0));
    sort($clean, SORT_NUMERIC);
    $count = count($clean);
    if ($count === 0) {
        return 0.0;
    }
    $mid = intdiv($count, 2);
    return $count % 2 === 1 ? $clean[$mid] : ($clean[$mid - 1] + $clean[$mid]) / 2;
}

function marketChartFilterOutlierRows(array $rows, ?float $referencePrice = null, bool $marketplace = false, bool $allowLowOutliers = false): array
{
    if (count($rows) < 4) {
        return $rows;
    }

    $prices = array_map(static fn(array $row): float => (float)($row['price'] ?? 0), $rows);
    $median = marketChartMedian($prices);
    $reference = ($referencePrice !== null && $referencePrice > 0) ? $referencePrice : $median;
    $deviations = array_map(static fn(float $price): float => abs($price - $median), $prices);
    $mad = marketChartMedian($deviations);
    $spread = max($mad * 1.4826, $reference * 0.035, 0.01);
    $lowFence = max(0.0, $median - ($spread * 4));
    $highFence = $median + ($spread * 4);

    return array_values(array_filter($rows, static function (array $row) use ($lowFence, $highFence, $reference, $marketplace, $allowLowOutliers): bool {
        $price = (float)($row['price'] ?? 0);
        if ($price <= 0) {
            return false;
        }
        if ($price > $highFence) {
            return false;
        }
        if (!$allowLowOutliers && $price < $lowFence) {
            return false;
        }
        if ($reference > 0) {
            $ratio = $price / $reference;
            if ($marketplace) {
                if ($ratio > 80 || $ratio < 0.008) {
                    return false;
                }
                if ($ratio > 2.35) {
                    return false;
                }
                return true;
            }
            if ($ratio > 5) {
                return false;
            }
            if (!$allowLowOutliers && $ratio < 0.12) {
                return false;
            }
        }
        return true;
    }));
}

function marketChartDbSource(string $source): string
{
    return match ($source) {
        'skinport'     => 'Skinport',
        'csfloat'      => 'CSFloat',
        'white_market' => 'White.Market',
        'dmarket'      => 'DMarket',
        'market_csgo'  => 'Market.CSGO',
        'shadowpay'    => 'ShadowPay',
        'waxpeer'      => 'Waxpeer',
        'mannco'       => 'Mannco.store',
        'haloskins'    => 'HaloSkins',
        'rapidskins'   => 'RapidSkins',
        default        => 'Steam',
    };
}

function marketChartSourceLabel(string $source): string
{
    return match ($source) {
        'skinport'     => 'Skinport',
        'csfloat'      => 'CSFloat',
        'white_market' => 'White.Market',
        'dmarket'      => 'DMarket',
        'market_csgo'  => 'Market.CSGO',
        'shadowpay'    => 'ShadowPay',
        'waxpeer'      => 'Waxpeer',
        'mannco'       => 'Mannco.store',
        'haloskins'    => 'HaloSkins',
        'rapidskins'   => 'RapidSkins',
        default        => 'Steam',
    };
}

function marketChartStatTrakMultiplier(string $source): float
{
    return match ($source) {
        'skinport'     => 1.12,
        'csfloat'      => 1.14,
        'white_market' => 1.13,
        'dmarket'      => 1.11,
        'market_csgo'  => 1.09,
        'shadowpay'    => 1.08,
        'waxpeer'      => 1.07,
        'mannco'       => 1.05,
        'haloskins'    => 1.06,
        'rapidskins'   => 1.04,
        default        => 1.16,
    };
}

function buildMarketChartUrl(string $source, string $lookupName, string $wear): string
{
    $resolvedLookup = trim($lookupName) !== '' ? trim($lookupName) : 'M4A1-S | Vaporwave';
    [$baseName] = marketChartSplitLookupName($resolvedLookup);
    $supportsWear = marketChartSupportsWearRows($resolvedLookup);
    $marketName = $supportsWear && trim($wear) !== ''
        ? "{$baseName} ({$wear})"
        : ($baseName !== '' ? $baseName : $resolvedLookup);

    return match ($source) {
        'skinport' => (static function () use ($marketName): string {
            if (function_exists('cachedSkinportItemUrlFromName')) {
                $itemUrl = cachedSkinportItemUrlFromName($marketName);
                if ($itemUrl !== '') {
                    return $itemUrl;
                }
            }
            // Fallback slug builder (same rules as ROI helper).
            $slug = strtolower($marketName);
            $slug = str_replace(['★', '☆', '™', '©', '®'], '', $slug);
            $slug = str_replace(['|', '/', '\\', '_', ',', '.', '(', ')', '[', ']', '{', '}'], ' ', $slug);
            $slug = preg_replace('/\s+/', '-', trim($slug)) ?? '';
            $slug = preg_replace('/[^a-z0-9\-]+/', '', $slug) ?? '';
            $slug = trim((string)preg_replace('/-+/', '-', $slug), '-');
            if ($slug !== '') {
                return 'https://skinport.com/item/' . $slug;
            }
            return 'https://skinport.com/market/730?' . http_build_query(['search' => $marketName]);
        })(),
        'csfloat'  => 'https://csfloat.com/search?' . http_build_query(['market_hash_name' => $marketName]),
        'white_market' => whiteMarketBuildItemUrl($marketName),
        'dmarket' => 'https://dmarket.com/ingame-items/item-list/csgo-skins?title=' . rawurlencode($marketName),
        'market_csgo' => marketCsgoItemUrl($marketName),
        'shadowpay' => shadowpayItemUrl($marketName),
        'waxpeer' => waxpeerItemUrl($marketName),
        'mannco' => manncoItemUrl($marketName),
        'haloskins' => haloskinsItemUrl($marketName),
        'rapidskins' => rapidskinsItemUrl($marketName),
        default    => 'https://steamcommunity.com/market/listings/730/' . rawurlencode($marketName) . '?l=english',
    };
}

function tryLoadLatestWearPrices(PDO $pdo, int $itemId, string $source): array
{
    try {
        $dbSource = marketChartDbSource($source);
        $latest = [];

        $rememberRows = static function (array $rows) use (&$latest): void {
            foreach ($rows as $row) {
                $wear = (string)($row['wear'] ?? '');
                $price = (float)($row['price'] ?? 0);
                if ($wear === '' || $price <= 0 || isset($latest[$wear])) {
                    continue;
                }

                $latest[$wear] = [
                    'price' => round($price, 2),
                    'volume' => (int)($row['volume'] ?? 0),
                    'updated_at' => (string)($row['recorded_at'] ?? ''),
                ];
            }
        };

        // Skinport: prefer live min-ask snapshots over stale provider_price_history
        // medians that were synced historically.
        if ($source === 'skinport') {
            try {
                $primaryPdo = dbPdoConnection('db');
                if (dbTableExists($primaryPdo, 'skinport_item_snapshots')) {
                    $skinportBatchSql = pdoDriverName($primaryPdo) === 'sqlsrv'
                        ? "SELECT TOP 1 batch_id
                           FROM skinport_item_snapshots
                           WHERE item_id = :iid
                           ORDER BY recorded_at DESC, id DESC"
                        : "SELECT batch_id
                           FROM skinport_item_snapshots
                           WHERE item_id = :iid
                           ORDER BY recorded_at DESC, id DESC
                           LIMIT 1";
                    $batchStmt = $primaryPdo->prepare(
                        $skinportBatchSql
                    );
                    $batchStmt->execute([':iid' => $itemId]);
                    $batchId = $batchStmt->fetchColumn();

                    if ($batchId) {
                        $stmt = $primaryPdo->prepare(
                            "SELECT wear,
                                    COALESCE(min_price, suggested_price, mean_price, median_price) AS price,
                                    quantity AS volume,
                                    recorded_at
                             FROM skinport_item_snapshots
                             WHERE item_id = :iid AND batch_id = :batch_id AND wear IS NOT NULL
                             ORDER BY recorded_at DESC"
                        );
                        $stmt->execute([':iid' => $itemId, ':batch_id' => $batchId]);
                        $rememberRows($stmt->fetchAll(PDO::FETCH_ASSOC));
                    }
                }
            } catch (Throwable) {
                // Skinport snapshots live in the primary DB in this project; ignore if unavailable.
            }
        }

        // Skip stale Skinport history rows when snapshots already covered wears.
        if (
            ($source !== 'skinport' || count($latest) < count(WEAR_PRICE_ANCHORS))
            && dbTableExists($pdo, 'provider_price_history')
            && dbColumnExists($pdo, 'provider_price_history', 'wear')
        ) {
            $stmt = $pdo->prepare(
                "SELECT wear, price, 0 AS volume, recorded_at
                 FROM provider_price_history
                 WHERE item_id = :iid AND provider = :source AND wear IS NOT NULL
                 ORDER BY recorded_at DESC"
            );
            $stmt->execute([':iid' => $itemId, ':source' => $dbSource]);
            $rememberRows($stmt->fetchAll(PDO::FETCH_ASSOC));
        }

        if ($source === 'steam' && count($latest) < count(WEAR_PRICE_ANCHORS) && dbTableExists($pdo, 'steam_analyst_prices')) {
            $stmt = $pdo->prepare(
                "SELECT wear, price, volume, recorded_at
                 FROM steam_analyst_prices
                 WHERE item_id = :iid AND wear IS NOT NULL
                 ORDER BY recorded_at DESC"
            );
            $stmt->execute([':iid' => $itemId]);
            $rememberRows($stmt->fetchAll(PDO::FETCH_ASSOC));
        }

        if (count($latest) < count(WEAR_PRICE_ANCHORS) && dbTableExists($pdo, 'price_history')) {
            $stmt = $pdo->prepare(
                "SELECT wear, price, volume, recorded_at
                 FROM price_history
                 WHERE item_id = :iid AND source = :source AND wear IS NOT NULL
                 ORDER BY recorded_at DESC"
            );
            $stmt->execute([':iid' => $itemId, ':source' => $dbSource]);
            $rememberRows($stmt->fetchAll(PDO::FETCH_ASSOC));
        }

        if (count($latest) >= 1) {
            return $latest;
        }
    } catch (Throwable) {
        // Fall back to Supabase below if the local connection fails.
    }

    return [];
}

function tryLoadLatestStatTrakPrice(PDO $pdo, string $source, string $lookupName, string $wear): ?float
{
    if (!marketChartSupportsWearRows($lookupName)) {
        return null;
    }

    [$baseName] = marketChartSplitLookupName($lookupName);
    if ($baseName === '' || !str_contains($baseName, '|')) {
        return null;
    }

    $stattrakName = "StatTrak™ {$baseName} ({$wear})";
    $stattrakItemId = resolveDataDbItemId($pdo, 0, $stattrakName);
    if ($stattrakItemId <= 0) {
        return null;
    }

    $latest = tryLoadLatestWearPrices($pdo, $stattrakItemId, $source);
    if (isset($latest[$wear]['price']) && (float)$latest[$wear]['price'] > 0) {
        return round((float)$latest[$wear]['price'], 2);
    }

    $series = tryLoadDbSeries($pdo, $stattrakItemId, $wear, $source, 365, true);
    $last = latestPoint($series);
    if ($last && (float)($last['price'] ?? 0) > 0) {
        return round((float)$last['price'], 2);
    }

    return null;
}

/** Prefer Skinport's live buyer ask (cheapest listed offer). */
function marketChartSkinportAskFromRow(array $row): ?float
{
    foreach (['min_price', 'suggested_price', 'mean_price', 'median_price'] as $key) {
        $price = isset($row[$key]) ? (float)$row[$key] : 0.0;
        if ($price > 0) {
            return round($price, 2);
        }
    }

    return null;
}

/**
 * Overlay wear asks from the Skinport items index (min_price).
 * Overwrites stale DB/history medians so the wear table matches live offers.
 */
function marketChartFillWearPricesFromSkinportIndex(array $latest, string $lookupName): array
{
    if (!marketChartSupportsWearRows($lookupName)) {
        return $latest;
    }

    $indexPath = __DIR__ . '/assets/skinport-cache/items_index.json';
    if (!is_file($indexPath)) {
        return $latest;
    }

    $decoded = json_decode((string)file_get_contents($indexPath), true);
    $items = is_array($decoded['items'] ?? null) ? $decoded['items'] : [];
    if (!$items) {
        return $latest;
    }

    $updatedAt = isset($decoded['fetched_at'])
        ? (string)$decoded['fetched_at']
        : gmdate('Y-m-d\TH:i:s', (int)@filemtime($indexPath));

    foreach (array_keys(WEAR_PRICE_ANCHORS) as $wear) {
        $hash = marketChartResolveMarketHashName($lookupName, $wear);
        if ($hash === '') {
            continue;
        }

        $row = is_array($items[$hash] ?? null) ? $items[$hash] : null;
        if (!$row) {
            continue;
        }

        $price = marketChartSkinportAskFromRow($row);
        if ($price === null || $price <= 0) {
            continue;
        }

        $latest[$wear] = [
            'price' => $price,
            'volume' => max(0, (int)($row['quantity'] ?? 0)),
            'updated_at' => $updatedAt,
        ];
    }

    return $latest;
}

function marketChartFillWearPricesFromMarketplaceCache(
    array $latest,
    string $source,
    string $lookupName,
    ?PDO $pdo
): array {
    if (!$pdo || !marketChartSupportsWearRows($lookupName)) {
        return $latest;
    }

    if (!in_array($source, ['white_market', 'dmarket', 'csfloat', 'market_csgo', 'shadowpay', 'waxpeer', 'mannco', 'haloskins', 'rapidskins'], true)) {
        return $latest;
    }

    if (count($latest) >= count(WEAR_PRICE_ANCHORS) || !dbTableExists($pdo, 'marketplace_price_cache')) {
        return $latest;
    }

    $names = [];
    $nameToWear = [];
    foreach (array_keys(WEAR_PRICE_ANCHORS) as $wear) {
        if (isset($latest[$wear])) {
            continue;
        }

        $hash = marketChartResolveMarketHashName($lookupName, $wear);
        if ($hash === '') {
            continue;
        }

        $names[] = $hash;
        $nameToWear[$hash] = $wear;
    }

    if (!$names) {
        return $latest;
    }

    try {
        $placeholders = implode(',', array_fill(0, count($names), '?'));
        $stmt = $pdo->prepare(
            "SELECT market_hash_name, price, listings, market_url, updated_at
             FROM marketplace_price_cache
             WHERE marketplace = ?
               AND market_hash_name IN ({$placeholders})"
        );
        $stmt->execute(array_merge([$source], $names));

        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $hash = trim((string)($row['market_hash_name'] ?? ''));
            $wear = $nameToWear[$hash] ?? '';
            $price = isset($row['price']) ? (float)$row['price'] : 0.0;
            if ($wear === '' || $price <= 0 || isset($latest[$wear])) {
                continue;
            }

            $latest[$wear] = [
                'price' => round($price, 2),
                'volume' => max(1, (int)($row['listings'] ?? 0)),
                'updated_at' => (string)($row['updated_at'] ?? gmdate('Y-m-d\TH:i:s')),
            ];
        }
    } catch (Throwable) {
        return $latest;
    }

    return $latest;
}

function buildWearPriceRows(string $source, string $lookupName, int $itemId, int $days, ?PDO $pdo): array
{
    if (!marketChartSupportsWearRows($lookupName)) {
        return [];
    }

    $latest = $pdo ? tryLoadLatestWearPrices($pdo, $itemId, $source) : [];
    $latest = marketChartFillWearPricesFromMarketplaceCache($latest, $source, $lookupName, $pdo);
    if ($source === 'skinport') {
        $latest = marketChartFillWearPricesFromSkinportIndex($latest, $lookupName);
    }
    $rows = [];

    foreach (array_keys(WEAR_PRICE_ANCHORS) as $wear) {
        $price = isset($latest[$wear]['price'])
            ? (float)$latest[$wear]['price']
            : 0.0;
        if ($price <= 0) {
            continue;
        }

        $stattrakPrice = $pdo ? tryLoadLatestStatTrakPrice($pdo, $source, $lookupName, $wear) : null;
        $rows[] = [
            'wear' => $wear,
            'source' => $source,
            'source_label' => marketChartSourceLabel($source),
            'price' => round($price, 2),
            'stattrak_price' => $stattrakPrice,
            'volume' => (int)($latest[$wear]['volume'] ?? 0),
            'updated_at' => $latest[$wear]['updated_at'] ?? gmdate('Y-m-d\TH:i:s'),
            'market_url' => buildMarketChartUrl($source, $lookupName, $wear),
        ];
    }

    return $rows;
}

function mergeSeries(array $a, array $b): array
{
    $map = [];
    foreach ($a as $r) {
        $map[$r['date']] = $r;
    }
    foreach ($b as $r) {
        if (!isset($map[$r['date']])) {
            $map[$r['date']] = $r;
        }
    }
    ksort($map);
    return array_values($map);
}

function marketChartResolveMarketHashName(string $lookupName, string $wear): string
{
    $lookupName = trim($lookupName);
    if ($lookupName === '') {
        return '';
    }

    if (preg_match('/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i', $lookupName)) {
        return $lookupName;
    }

    if ($wear !== '' && marketChartSupportsWearRows($lookupName)) {
        return "{$lookupName} ({$wear})";
    }

    return $lookupName;
}

function marketChartRoiCachePath(string $source, string $marketHashName): string
{
    return __DIR__ . '/assets/roi-price-cache/' . $source . '_' . md5($marketHashName) . '.json';
}

function marketChartParseHistoryPayload(mixed $raw): array
{
    if (is_string($raw) && $raw !== '') {
        $decoded = json_decode($raw, true);
        $raw = is_array($decoded) ? $decoded : [];
    }

    if (!is_array($raw)) {
        return [];
    }

    return marketChartPointsFromActivityHistory(normalizeMarketActivityHistory($raw));
}

function marketChartLoadRoiCacheSeries(string $marketHashName, string $source, int $days): array
{
    if ($marketHashName === '') {
        return [];
    }

    $path = marketChartRoiCachePath($source, $marketHashName);
    if (!is_file($path)) {
        return [];
    }

    $decoded = json_decode((string)file_get_contents($path), true);
    if (!is_array($decoded)) {
        return [];
    }

    $rows = marketChartParseHistoryPayload($decoded['price_history'] ?? []);
    if (count($rows) < 2 && isset($decoded['current_price']) && is_numeric($decoded['current_price'])) {
        $price = round((float)$decoded['current_price'], 2);
        $today = (new DateTimeImmutable('today', new DateTimeZone('UTC')))->format('Y-m-d');
        $rows = [[
            'date' => $today,
            'price' => $price,
            'volume' => max(1, (int)($decoded['sell_orders'] ?? 1)),
        ]];
    }

    return trimSeriesToDays($rows, $days);
}

function marketChartLoadDmarketSalesHistory(string $marketHashName, int $days): array
{
    if ($marketHashName === '') {
        return [];
    }

    $config = appConfig()['dmarket'] ?? [];
    $points = dmarketFetchLastSalesHistory($marketHashName, $config, false);
    return trimSeriesToDays($points, $days);
}

function marketChartLoadMarketCsgoSalesHistory(string $marketHashName, int $days): array
{
    if ($marketHashName === '') {
        return [];
    }

    $config = appConfig()['market_csgo'] ?? [];
    if (trim((string)($config['api_key'] ?? '')) === '') {
        return [];
    }

    $points = marketCsgoFetchSalesHistory($marketHashName, $config);
    return trimSeriesToDays($points, $days);
}

function marketChartLoadShadowpaySalesHistory(string $marketHashName, int $days): array
{
    if ($marketHashName === '') {
        return [];
    }

    $config = appConfig()['shadowpay'] ?? [];
    if (trim((string)($config['api_token'] ?? '')) === '') {
        return [];
    }

    $points = shadowpayFetchSalesHistory($marketHashName, $config);
    return trimSeriesToDays($points, $days);
}

function marketChartLoadWaxpeerSalesHistory(string $marketHashName, int $days): array
{
    if ($marketHashName === '') {
        return [];
    }

    $config = appConfig()['waxpeer'] ?? [];
    if (trim((string)($config['api_key'] ?? '')) === '') {
        return [];
    }

    $points = waxpeerFetchSalesHistory($marketHashName, $config);
    return trimSeriesToDays($points, $days);
}

function marketChartLoadManncoSalesHistory(string $marketHashName, int $days): array
{
    if ($marketHashName === '') {
        return [];
    }

    $config = appConfig()['mannco'] ?? [];
    if (trim((string)($config['api_key'] ?? '')) === '') {
        return [];
    }

    $points = manncoFetchSalesHistory($marketHashName, $config);
    return trimSeriesToDays($points, $days);
}

function marketChartLoadHaloskinsSalesHistory(string $marketHashName, int $days): array
{
    if ($marketHashName === '') {
        return [];
    }

    $config = appConfig()['haloskins'] ?? [];
    if (trim((string)($config['api_key'] ?? '')) === '') {
        return [];
    }

    $points = haloskinsFetchSalesHistory($marketHashName, $config);
    return trimSeriesToDays($points, $days);
}

function marketChartLoadRapidskinsSalesHistory(string $marketHashName, int $days): array
{
    if ($marketHashName === '') {
        return [];
    }

    $config = appConfig()['rapidskins'] ?? [];
    if (trim((string)($config['api_key'] ?? '')) === '') {
        return [];
    }

    $points = rapidskinsFetchSalesHistory($marketHashName, $config);
    return trimSeriesToDays($points, $days);
}

function marketChartLoadWhiteMarketListingHistory(string $marketHashName, int $days): array
{
    if ($marketHashName === '') {
        return [];
    }

    $cfg = appConfig()['white_market'] ?? [];
    $partnerToken = trim((string)($cfg['partner_token'] ?? ''));
    if ($partnerToken === '') {
        return [];
    }

    $cacheDir = __DIR__ . '/assets/white-market-cache';
    $points = whiteMarketFetchListingHistory(
        $marketHashName,
        $cacheDir,
        $partnerToken,
        whiteMarketUsdToEurRate(),
        false
    );

    return trimSeriesToDays($points, $days);
}

function marketChartLoadCsfloatGraphHistory(string $marketHashName, int $days): array
{
    if ($marketHashName === '') {
        return [];
    }

    $cfg = appConfig();
    $apiKey = trim((string)($cfg['csfloat']['api_key'] ?? ''));
    $usdToEur = max(0.01, (float)($cfg['dmarket']['usd_to_eur'] ?? 0.92));
    $cacheDir = __DIR__ . '/assets/csfloat-cache';
    $points = csfloatFetchHistoryGraph($marketHashName, $cacheDir, $apiKey, $usdToEur, false);

    return trimSeriesToDays($points, $days);
}

function marketChartLoadProviderCacheAnchor(string $marketHashName, string $source): ?float
{
    if ($marketHashName === '') {
        return null;
    }

    if ($source === 'skinport') {
        $indexPath = __DIR__ . '/assets/skinport-cache/items_index.json';
        if (is_file($indexPath)) {
            $decoded = json_decode((string)file_get_contents($indexPath), true);
            $items = is_array($decoded['items'] ?? null) ? $decoded['items'] : [];
            $row = is_array($items[$marketHashName] ?? null) ? $items[$marketHashName] : null;
            if ($row) {
                foreach (['min_price', 'suggested_price', 'mean_price', 'median_price'] as $key) {
                    $price = isset($row[$key]) ? (float)$row[$key] : 0.0;
                    if ($price > 0) {
                        return round($price, 2);
                    }
                }
            }
        }
    }

    $roiPath = marketChartRoiCachePath($source, $marketHashName);
    if (is_file($roiPath)) {
        $decoded = json_decode((string)file_get_contents($roiPath), true);
        $price = isset($decoded['current_price']) ? (float)$decoded['current_price'] : 0.0;
        if ($price > 0) {
            return round($price, 2);
        }
    }

    if ($source === 'csfloat') {
        $cacheFile = __DIR__ . '/assets/csfloat-cache/' . md5($marketHashName) . '.json';
        if (is_file($cacheFile)) {
            $decoded = json_decode((string)file_get_contents($cacheFile), true);
            foreach (['current_price', 'lowest_price', 'price'] as $key) {
                $price = isset($decoded[$key]) ? (float)$decoded[$key] : 0.0;
                if ($price > 0) {
                    return round($price, 2);
                }
            }
        }
    }

    if ($source === 'white_market') {
        $cacheFile = __DIR__ . '/assets/white-market-cache/prices_730.json';
        if (is_file($cacheFile)) {
            $decoded = json_decode((string)file_get_contents($cacheFile), true);
            $items = is_array($decoded['items'] ?? null) ? $decoded['items'] : (is_array($decoded) ? $decoded : []);
            foreach ($items as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $name = trim((string)($item['market_hash_name'] ?? $item['name'] ?? ''));
                if ($name !== $marketHashName) {
                    continue;
                }
                foreach (['current_price', 'price', 'min_price'] as $key) {
                    if (!isset($item[$key]) || !is_numeric($item[$key])) {
                        continue;
                    }
                    $price = $key === 'price'
                        ? whiteMarketExportPriceToEur((float)$item[$key], whiteMarketUsdToEurRate())
                        : (float)$item[$key];
                    if ($price !== null && $price > 0) {
                        return round($price, 2);
                    }
                }
            }
        }
    }

    if ($source === 'dmarket') {
        $cacheFile = __DIR__ . '/assets/dmarket-cache/' . md5($marketHashName) . '.json';
        if (is_file($cacheFile)) {
            $decoded = json_decode((string)file_get_contents($cacheFile), true);
            foreach (['current_price', 'price', 'lowest_price'] as $key) {
                $price = isset($decoded[$key]) ? (float)$decoded[$key] : 0.0;
                if ($price > 0) {
                    return round($price, 2);
                }
            }
        }
    }

    if ($source === 'market_csgo') {
        $currency = strtoupper(trim((string)((appConfig()['market_csgo']['currency'] ?? 'EUR'))) ?: 'EUR');
        $cacheFile = marketCsgoPricesCachePath($currency);
        if (is_file($cacheFile)) {
            $decoded = json_decode((string)file_get_contents($cacheFile), true);
            $index = is_array($decoded['index'] ?? null) ? $decoded['index'] : [];
            $entry = $index[$marketHashName] ?? null;
            if (is_array($entry) && isset($entry['price']) && is_numeric($entry['price'])) {
                $price = (float)$entry['price'];
                if ($price > 0) {
                    return round($price, $price < 1 ? 4 : 2);
                }
            } elseif (is_numeric($entry)) {
                $price = (float)$entry;
                if ($price > 0) {
                    return round($price, $price < 1 ? 4 : 2);
                }
            }
        }
    }

    if ($source === 'shadowpay') {
        $cacheFile = shadowpayPricesCachePath();
        if (is_file($cacheFile)) {
            $decoded = json_decode((string)file_get_contents($cacheFile), true);
            $index = is_array($decoded['index'] ?? null) ? $decoded['index'] : [];
            $entry = $index[$marketHashName] ?? null;
            if (is_array($entry) && isset($entry['price']) && is_numeric($entry['price'])) {
                $price = (float)$entry['price'];
                if ($price > 0) {
                    return round($price, $price < 1 ? 4 : 2);
                }
            }
        }
    }

    if ($source === 'waxpeer') {
        $cacheFile = waxpeerPricesCachePath();
        if (is_file($cacheFile)) {
            $decoded = json_decode((string)file_get_contents($cacheFile), true);
            $index = is_array($decoded['index'] ?? null) ? $decoded['index'] : [];
            $entry = $index[$marketHashName] ?? null;
            if (is_array($entry) && isset($entry['price']) && is_numeric($entry['price'])) {
                $price = (float)$entry['price'];
                if ($price > 0) {
                    return round($price, $price < 1 ? 4 : 2);
                }
            }
        }
    }

    if ($source === 'mannco') {
        $cacheFile = manncoPricesCachePath();
        if (is_file($cacheFile)) {
            $decoded = json_decode((string)file_get_contents($cacheFile), true);
            $index = is_array($decoded['index'] ?? null) ? $decoded['index'] : [];
            $entry = $index[$marketHashName] ?? null;
            if (is_array($entry) && isset($entry['price']) && is_numeric($entry['price'])) {
                $price = (float)$entry['price'];
                if ($price > 0) {
                    return round($price, $price < 1 ? 4 : 2);
                }
            }
        }
    }

    if ($source === 'haloskins') {
        $config = appConfig()['haloskins'] ?? [];
        $entry = haloskinsLoadCachedQuote($marketHashName, is_array($config) ? $config : [], true);
        if (is_array($entry) && isset($entry['price']) && is_numeric($entry['price'])) {
            $price = (float)$entry['price'];
            if ($price > 0) {
                return round($price, $price < 1 ? 4 : 2);
            }
        }
    }

    if ($source === 'rapidskins') {
        $config = appConfig()['rapidskins'] ?? [];
        $entry = rapidskinsLoadCachedQuote($marketHashName, is_array($config) ? $config : [], true);
        if (is_array($entry) && isset($entry['price']) && is_numeric($entry['price'])) {
            $price = (float)$entry['price'];
            if ($price > 0) {
                return round($price, $price < 1 ? 4 : 2);
            }
        }
    }

    return null;
}

function marketChartApplyLiveAnchors(string $wear, string $marketHashName): void
{
    if ($marketHashName === '' || !isset(WEAR_PRICE_ANCHORS[$wear])) {
        return;
    }

    foreach (array_keys(WEAR_PRICE_ANCHORS[$wear]) as $source) {
        $livePrice = marketChartLoadProviderCacheAnchor($marketHashName, $source);
        if ($livePrice !== null && $livePrice > 0) {
            $GLOBALS['__dynamic_anchors'][$wear][$source] = $livePrice;
        }
    }
}

function marketChartBlendRealAndFallback(array $realRows, array $fallbackRows): array
{
    if (!$realRows) {
        return $fallbackRows;
    }
    if (!$fallbackRows) {
        return $realRows;
    }

    $realByDate = [];
    foreach ($realRows as $row) {
        $realByDate[(string)$row['date']] = $row;
    }

    $merged = [];
    foreach ($fallbackRows as $row) {
        $date = (string)$row['date'];
        $merged[] = $realByDate[$date] ?? $row;
    }

    foreach ($realByDate as $date => $row) {
        if (!array_filter($merged, static fn (array $entry): bool => (string)$entry['date'] === $date)) {
            $merged[] = $row;
        }
    }

    usort($merged, static fn (array $a, array $b): int => strcmp((string)$a['date'], (string)$b['date']));
    return $merged;
}

function marketChartSeriesSpread(array $rows): float
{
    $prices = array_values(array_filter(
        array_map(static fn(array $row): float => (float)($row['price'] ?? 0), $rows),
        static fn(float $price): bool => $price > 0
    ));
    if (count($prices) < 2) {
        return 0.0;
    }

    $min = min($prices);
    $max = max($prices);
    return $max > 0 ? ($max - $min) / $max : 0.0;
}

function marketChartShapeFromSteam(array $steamRows, float $providerAnchor): array
{
    if (count($steamRows) < 2 || $providerAnchor <= 0) {
        return [];
    }

    $last = $steamRows[array_key_last($steamRows)] ?? null;
    $baseSteam = isset($last['price']) ? (float)$last['price'] : 0.0;
    if ($baseSteam <= 0) {
        $first = $steamRows[0] ?? null;
        $baseSteam = isset($first['price']) ? (float)$first['price'] : 0.0;
    }
    if ($baseSteam <= 0) {
        return [];
    }

    $scale = $providerAnchor / $baseSteam;
    $shaped = [];
    foreach ($steamRows as $row) {
        $date = (string)($row['date'] ?? '');
        $price = round((float)($row['price'] ?? 0) * $scale, 2);
        if ($date === '' || $price <= 0) {
            continue;
        }
        $shaped[] = [
            'date'   => $date,
            'price'  => $price,
            'volume' => max(1, (int)($row['volume'] ?? 1)),
            'synthetic' => true,
        ];
    }

    return $shaped;
}

function marketChartBackfillFromSteam(array $steamRows, array $providerRows): array
{
    if (count($steamRows) < 2) {
        return $providerRows;
    }

    $realRows = array_values(array_filter(
        $providerRows,
        static fn(array $row): bool => empty($row['synthetic'])
    ));
    $provider = count($realRows) >= 2 ? $realRows : $providerRows;
    if (count($provider) < 2) {
        $last = $provider[array_key_last($provider)] ?? null;
        $anchor = isset($last['price']) ? (float)$last['price'] : 0.0;
        return $anchor > 0 ? marketChartShapeFromSteam($steamRows, $anchor) : $provider;
    }

    $firstDate = substr((string)($provider[0]['date'] ?? ''), 0, 10);
    if ($firstDate === '') {
        return $provider;
    }

    $steamStart = substr((string)($steamRows[0]['date'] ?? ''), 0, 10);
    if ($steamStart !== '' && $firstDate <= $steamStart) {
        return $provider;
    }

    $joinSteam = null;
    for ($i = count($steamRows) - 1; $i >= 0; $i--) {
        $date = substr((string)($steamRows[$i]['date'] ?? ''), 0, 10);
        if ($date !== '' && $date <= $firstDate) {
            $joinSteam = $steamRows[$i];
            break;
        }
    }
    if ($joinSteam === null) {
        $joinSteam = $steamRows[0];
    }

    $joinSteamPrice = (float)($joinSteam['price'] ?? 0);
    $joinProviderPrice = (float)($provider[0]['price'] ?? 0);
    if ($joinSteamPrice <= 0 || $joinProviderPrice <= 0) {
        return $provider;
    }

    $rawScale = $joinProviderPrice / $joinSteamPrice;
    $scale = max(0.78, min(1.18, $rawScale));
    $byDate = [];
    foreach ($steamRows as $row) {
        $date = substr((string)($row['date'] ?? ''), 0, 10);
        if ($date === '' || $date >= $firstDate) {
            continue;
        }
        $price = round((float)($row['price'] ?? 0) * $scale, ((float)($row['price'] ?? 0) * $scale) < 1 ? 4 : 2);
        if ($price <= 0) {
            continue;
        }
        $byDate[$date] = [
            'date' => $date,
            'price' => $price,
            'volume' => max(1, (int)($row['volume'] ?? 1)),
            'synthetic' => true,
        ];
    }

    foreach ($provider as $row) {
        $date = substr((string)($row['date'] ?? ''), 0, 10);
        if ($date === '') {
            continue;
        }
        $steamPrice = 0.0;
        for ($i = count($steamRows) - 1; $i >= 0; $i--) {
            $steamDate = substr((string)($steamRows[$i]['date'] ?? ''), 0, 10);
            if ($steamDate !== '' && $steamDate <= $date) {
                $steamPrice = (float)($steamRows[$i]['price'] ?? 0);
                break;
            }
        }
        $price = (float)($row['price'] ?? 0);
        if ($steamPrice > 0) {
            $ratio = $price / $steamPrice;
            if ($ratio > 1.55 || $ratio < 0.55) {
                continue;
            }
        }
        $byDate[$date] = [
            'date' => $date,
            'price' => $price,
            'volume' => max(1, (int)($row['volume'] ?? 1)),
            'synthetic' => false,
        ];
    }

    ksort($byDate);
    return array_values($byDate);
}

function marketChartAlignProvidersToSteam(array $resolved, string $marketHashName): array
{
    $steamRows = $resolved['steam'] ?? [];
    if (count($steamRows) < 2) {
        return $resolved;
    }

    $steamSpread = marketChartSeriesSpread($steamRows);

            foreach (['skinport', 'csfloat', 'white_market', 'dmarket', 'market_csgo', 'shadowpay', 'waxpeer', 'mannco', 'haloskins', 'rapidskins'] as $source) {
        $rows = $resolved[$source] ?? [];
            if (!$rows) {
            $anchor = marketChartLoadProviderCacheAnchor($marketHashName, $source);
            // Stickers/charms/agents must not inherit weapon-skin wear anchors (€150 FN, etc.).
            if (($anchor === null || $anchor <= 0) && !marketChartItemExcludesWearVariants($marketHashName)) {
                $anchors = marketChartActiveAnchors((string)($GLOBALS['__wear'] ?? 'Field-Tested'));
                $anchor = (float)($anchors[$source] ?? 0.0);
            }
            if (($anchor === null || $anchor <= 0) && marketChartItemExcludesWearVariants($marketHashName)) {
                $steamLast = latestPoint($steamRows);
                $steamPrice = $steamLast ? (float)($steamLast['price'] ?? 0) : 0.0;
                $ratio = (float)(marketChartPriceRatios()['Field-Tested'][$source] ?? 0.92);
                if ($steamPrice > 0 && $ratio > 0) {
                    $anchor = round($steamPrice * $ratio, 4);
                }
            }
            if ($anchor > 0) {
                $shaped = marketChartShapeFromSteam($steamRows, $anchor);
                if (count($shaped) >= 2) {
                    $resolved[$source] = $shaped;
                }
            }
            continue;
        }

        $providerSpread = marketChartSeriesSpread($rows);
        $lastRow = $rows[array_key_last($rows)] ?? null;
        $anchor = (float)($lastRow['price'] ?? 0);
        if ($anchor <= 0) {
            $anchor = (float)(marketChartLoadProviderCacheAnchor($marketHashName, $source) ?? 0);
        }

        // Flat bucket/median histories (common for Skinport) should track Steam movement.
        $uniquePrices = [];
        foreach ($rows as $row) {
            $price = (float)($row['price'] ?? 0);
            if ($price > 0) {
                $uniquePrices[number_format($price, $price < 1 ? 3 : 2, '.', '')] = true;
            }
        }
        $isNearFlat = ($steamSpread > 0.06 && $providerSpread < max(0.035, $steamSpread * 0.32))
            || ($steamSpread > 0.08 && count($uniquePrices) <= 4);

        // White.Market listing createdAt clusters can have many points in a short window.
        // Use sample density vs Steam days — not first→last date span (2 distant points
        // used to look like full coverage and skip reshape into flat Chart.js chords).
        $steamDateSet = [];
        foreach ($steamRows as $steamRow) {
            $day = substr((string)($steamRow['date'] ?? ''), 0, 10);
            if ($day !== '') {
                $steamDateSet[$day] = true;
            }
        }
        $providerHits = 0;
        foreach ($rows as $row) {
            $day = substr((string)($row['date'] ?? ''), 0, 10);
            if ($day !== '' && isset($steamDateSet[$day])) {
                $providerHits++;
            }
        }
        $steamDayCount = max(1, count($steamDateSet));
        $density = $providerHits / $steamDayCount;
        $lowCoverage = $density < 0.08
            || count($rows) < max(4, (int)floor($steamDayCount * 0.06))
            || ($density < 0.28 && $isNearFlat);

        if (($isNearFlat || $lowCoverage) && $anchor > 0) {
            $shaped = marketChartShapeFromSteam($steamRows, $anchor);
            if (count($shaped) >= 2) {
                $resolved[$source] = $shaped;
                continue;
            }
        }

        // Always prefix from Steam release → first real provider point on Max/ALL.
        $filled = marketChartBackfillFromSteam($steamRows, $rows);
        if (count($filled) >= 2) {
            $resolved[$source] = $filled;
        }
    }

    return $resolved;
}

function marketChartMarketActivityCachePath(string $marketHashName, int $appId = 730): string
{
    $key = md5(strtolower($appId . '|' . trim($marketHashName)));
    return rtrim(sys_get_temp_dir(), '\\/') . DIRECTORY_SEPARATOR . 'csgo_market_activity_' . $key . '.json';
}

function marketChartPointsFromActivityHistory(array $points): array
{
    $rows = [];
    foreach ($points as $point) {
        if (!is_array($point)) {
            continue;
        }

        $date = substr((string)($point['date'] ?? ''), 0, 10);
        $price = isset($point['price']) ? (float)$point['price'] : 0.0;
        if ($date === '' || $price <= 0) {
            continue;
        }

        $rows[$date] = [
            'date' => $date,
            'price' => round($price, $price < 1 ? 4 : 2),
            'volume' => max(1, (int)($point['quantity'] ?? $point['volume'] ?? 1)),
        ];
    }

    ksort($rows);
    return array_values($rows);
}

function marketChartFetchSteamPriceHistoryApi(string $marketHashName, int $appId = 730, int $currency = 3): array
{
    return marketChartPointsFromActivityHistory(steamFetchPriceHistoryApi($marketHashName, $appId, $currency));
}

function marketChartLoadSteamLiveHistory(string $marketHashName, int $days): array
{
    if ($marketHashName === '') {
        return [];
    }

    $isLifetime = $days <= 0 || $days >= 4000;
    $maxPoints = $isLifetime
        ? 3500
        : max(120, min(1200, (int)ceil($days * 1.5)));

    $rows = [];

    if ($isLifetime) {
        $rows = mergeSeries($rows, marketChartLoadRoiCacheSeries($marketHashName, 'steam', $days));

        $realHistory = loadRealMarketActivityHistory($marketHashName);
        if (count($realHistory) >= 2) {
            $rows = mergeSeries($rows, marketChartPointsFromActivityHistory($realHistory));
        }

        $rows = mergeSeries($rows, marketChartFetchSteamPriceHistoryApi($marketHashName));
    }

    $history = resolveSteamMarketHistoryPoints($marketHashName, 730, $maxPoints);
    if (count($history) >= 2) {
        $rows = mergeSeries($rows, marketChartPointsFromActivityHistory($history));
    } elseif (count($rows) < 3) {
        $rows = mergeSeries($rows, marketChartLoadRoiCacheSeries($marketHashName, 'steam', $days));
        $rows = mergeSeries($rows, marketChartFetchSteamPriceHistoryApi($marketHashName));
    }

    return trimSeriesToDays($rows, $days);
}

function marketChartSeriesLooksSynthetic(array $rows): bool
{
    if (!$rows) {
        return false;
    }

    foreach ($rows as $row) {
        if (empty($row['synthetic'])) {
            return false;
        }
    }

    return true;
}

function marketChartResolveSourceRows(
    ?PDO $pdo,
    int $itemId,
    string $wear,
    string $anchorWear,
    string $marketHashName,
    int $days,
    bool $supportsWear
): array
{
    $sources = ['steam', 'skinport', 'csfloat', 'white_market', 'dmarket', 'market_csgo', 'shadowpay', 'waxpeer', 'mannco', 'haloskins', 'rapidskins'];
    $resolved = [];
    $isLifetime = $days <= 0 || $days >= 4000;

    foreach ($sources as $source) {
        $rows = [];
        try {
            $rows = $pdo ? tryLoadDbSeries($pdo, $itemId, $wear, $source, $days, $supportsWear) : [];
            if (count($rows) < 3) {
                $rows = mergeSeries($rows, marketChartLoadRoiCacheSeries($marketHashName, $source, $days));
            }

            if ($source === 'steam' && $marketHashName !== '') {
                $liveSteamRows = marketChartLoadSteamLiveHistory($marketHashName, $days);
                if (count($liveSteamRows) >= 2) {
                    $rows = count($rows) >= 2 ? mergeSeries($rows, $liveSteamRows) : $liveSteamRows;
                }
            }

            if ($source === 'csfloat' && $marketHashName !== '' && count($rows) < 3) {
                $liveCsfloatRows = marketChartLoadCsfloatGraphHistory($marketHashName, $days);
                if (count($liveCsfloatRows) >= 2) {
                    $rows = $liveCsfloatRows;
                }
            }

            if ($source === 'white_market' && $marketHashName !== '') {
                $liveWhiteRows = marketChartLoadWhiteMarketListingHistory($marketHashName, $days);
                $whiteAnchor = marketChartLoadProviderCacheAnchor($marketHashName, $source);
                $liveWhiteRows = marketChartFilterOutlierRows($liveWhiteRows, $whiteAnchor, true);
                if (count($liveWhiteRows) >= 2) {
                    // Always merge listing-history samples — White.Market DB series is often thin.
                    $rows = count($rows) >= 2 ? mergeSeries($rows, $liveWhiteRows) : $liveWhiteRows;
                }
            }

            if ($source === 'dmarket' && $marketHashName !== '' && count($rows) < 3) {
                $liveDmarketRows = marketChartLoadDmarketSalesHistory($marketHashName, $days);
                if (count($liveDmarketRows) >= 2) {
                    $rows = $liveDmarketRows;
                }
            }

            if ($source === 'market_csgo' && $marketHashName !== '' && count($rows) < 3) {
                $liveMarketCsgoRows = marketChartLoadMarketCsgoSalesHistory($marketHashName, $days);
                if (count($liveMarketCsgoRows) >= 2) {
                    $rows = $liveMarketCsgoRows;
                }
            }

            if ($source === 'shadowpay' && $marketHashName !== '' && count($rows) < 3) {
                $liveShadowpayRows = marketChartLoadShadowpaySalesHistory($marketHashName, $days);
                // Thin/single-point series densified from Steam later via marketChartAlignProvidersToSteam.
                if (count($liveShadowpayRows) >= 1) {
                    $rows = count($rows) >= 1 ? mergeSeries($rows, $liveShadowpayRows) : $liveShadowpayRows;
                }
            }

            if ($source === 'waxpeer' && $marketHashName !== '' && count($rows) < 3) {
                $liveWaxpeerRows = marketChartLoadWaxpeerSalesHistory($marketHashName, $days);
                if (count($liveWaxpeerRows) >= 1) {
                    $rows = count($rows) >= 1 ? mergeSeries($rows, $liveWaxpeerRows) : $liveWaxpeerRows;
                }
            }

            if ($source === 'mannco' && $marketHashName !== '' && count($rows) < 3) {
                $liveManncoRows = marketChartLoadManncoSalesHistory($marketHashName, $days);
                if (count($liveManncoRows) >= 1) {
                    $rows = count($rows) >= 1 ? mergeSeries($rows, $liveManncoRows) : $liveManncoRows;
                }
            }

            if ($source === 'haloskins' && $marketHashName !== '' && count($rows) < 3) {
                $liveHaloskinsRows = marketChartLoadHaloskinsSalesHistory($marketHashName, $days);
                if (count($liveHaloskinsRows) >= 1) {
                    $rows = count($rows) >= 1 ? mergeSeries($rows, $liveHaloskinsRows) : $liveHaloskinsRows;
                }
            }

            if ($source === 'rapidskins' && $marketHashName !== '' && count($rows) < 3) {
                $liveRapidskinsRows = marketChartLoadRapidskinsSalesHistory($marketHashName, $days);
                if (count($liveRapidskinsRows) >= 1) {
                    $rows = count($rows) >= 1 ? mergeSeries($rows, $liveRapidskinsRows) : $liveRapidskinsRows;
                }
            }

            $targetDays = $days <= 0 ? 5000 : max(14, min($days, 5000));
            $minimumPoints = min(12, max(3, (int)floor($targetDays / 14)));
            if (count($rows) < $minimumPoints) {
                if ($source === 'steam' && $marketHashName !== '') {
                    $liveSteamRows = marketChartLoadSteamLiveHistory($marketHashName, $days);
                    if (count($liveSteamRows) >= 2) {
                        $rows = count($rows) >= 2 ? mergeSeries($rows, $liveSteamRows) : $liveSteamRows;
                    }
                }

                if ($source !== 'steam' && count($rows) < $minimumPoints) {
                    $generated = generateFallbackSeries($anchorWear, $source, $targetDays);
                    $rows = count($rows) >= 2
                        ? marketChartBlendRealAndFallback($rows, $generated)
                        : $generated;
                }
            }
        } catch (Throwable) {
            // One marketplace must not wipe the whole Price History bundle.
            $rows = [];
        }

        if (!is_array($rows)) {
            $rows = [];
        }

        $trimmed = trimSeriesToDays($rows, $days);
        $isMarketplace = in_array($source, ['skinport', 'csfloat', 'white_market', 'dmarket', 'market_csgo', 'shadowpay', 'waxpeer', 'mannco', 'haloskins', 'rapidskins'], true);
        $isLifetime = $days <= 0 || $days >= 4000;
        $reference = marketChartLoadProviderCacheAnchor($marketHashName, $source);
        if ($isMarketplace && $source !== 'steam') {
            $steamAnchor = marketChartLoadProviderCacheAnchor($marketHashName, 'steam');
            if ($steamAnchor !== null && $steamAnchor > 0) {
                $reference = $steamAnchor;
            }
        }
        $filtered = marketChartFilterOutlierRows(
            $trimmed,
            $reference,
            $isMarketplace,
            $source === 'steam' && $isLifetime
        );
        $resolved[$source] = count($filtered) >= 2 ? $filtered : $trimmed;
    }

    return $resolved;
}

function buildCard(string $id, string $label, array $rows, string $source): array
{
    $last  = latestPoint($rows);
    $anchors = marketChartActiveAnchors((string)($GLOBALS['__wear'] ?? 'Field-Tested'));

    return [
        'id'            => $id,
        'label'         => $label,
        'price'         => $last ? (float)$last['price'] : (float)($anchors[$source] ?? 0),
        'volume'        => $last ? (int)$last['volume'] : 0,
        'updated_at'    => gmdate('Y-m-d\TH:i:s'),
        'market_url'    => null,
        'note'          => '',
    ];
}

/* ── Bundle builder (HTTP + in-process AI chat) ── */
function marketChartBuildBundlePayload(array $query = []): array
{
    $get = static function (string $key, mixed $default = null) use ($query): mixed {
        if (array_key_exists($key, $query)) {
            return $query[$key];
        }
        return $_GET[$key] ?? $default;
    };

    // In-process callers (the AI chat building a chart reply) share the HTTP
    // endpoint's response cache: a bundle the item page already built answers
    // in milliseconds instead of another 7–25 s rebuild, and a bundle the chat
    // builds is stored for the item page.
    $cacheFile = marketChartBundleCachePath([
        'lookup_name' => (string)$get('lookup_name', ''),
        'wear' => (string)$get('wear', ''),
        'range' => (string)$get('range', 'ALL'),
        'source' => (string)$get('source', 'steam'),
        'item_id' => (string)$get('item_id', 1),
        'since' => (string)$get('since', ''),
    ]);
    $inProcess = defined('MARKET_CHART_BUNDLE_LIB_ONLY');
    if ($inProcess && empty($query['nocache']) && is_file($cacheFile) && (time() - (int)filemtime($cacheFile)) <= MARKET_CHART_CACHE_STALE_TTL) {
        $cachedRaw = @gzdecode((string)@file_get_contents($cacheFile));
        $cached = is_string($cachedRaw) ? json_decode($cachedRaw, true) : null;
        if (is_array($cached) && ($cached['success'] ?? false) === true) {
            return $cached;
        }
    }

try {
    $requestedItemId = max(1, (int)($get('item_id', 1)));
    $itemId     = $requestedItemId;
    $requestedWear = trim((string)$get('wear', ''));
    $sourceId   = normalizeMarketChartSource((string)$get('source', 'steam'));
    $range      = strtoupper(trim((string)$get('range', 'ALL')));
    $lookupName = trim((string)$get('lookup_name', ''));
    $since      = trim((string)$get('since', ''));
    $days       = marketChartRangeDays($range);
    $supportsWear = marketChartSupportsWearRows($lookupName);

    $validWears = array_keys(WEAR_PRICE_ANCHORS);
    $requestedAnchorWear = in_array($requestedWear, $validWears, true) ? $requestedWear : 'Field-Tested';
    $wear = $supportsWear ? $requestedAnchorWear : '';

    $GLOBALS['__response_wear'] = $wear;
    $GLOBALS['__supports_wear'] = $supportsWear;
    $GLOBALS['__lookup_name'] = $lookupName;

    // Resolve the item against the local DB first so the chart never waits on Supabase.
    $pdo = null;
    try {
        $pdo = marketHistoryPdoConnection();
        if ($lookupName !== '') {
            $itemId = resolveDataDbItemId($pdo, $requestedItemId, $lookupName);
        }
    } catch (Throwable) {}

    if ($pdo === null && $lookupName !== '' && $itemId === $requestedItemId) {
        $itemId = supabaseResolveItemId($lookupName, $requestedItemId);
    }

    // A name that is NOT in the items table must not inherit the fallback
    // id's rows: item 1 carries three seeded demo prices, which drew the
    // same "€229 V" for every unresolved skin. History then comes from the
    // Steam caches / live fetches only (DB queries with id 0 return nothing).
    if ($lookupName !== '' && $itemId === $requestedItemId) {
        $matchesFallback = false;
        try {
            $primaryItem = loadPrimaryItemById($requestedItemId);
            $primaryName = is_array($primaryItem) ? trim((string)($primaryItem['name'] ?? '')) : '';
            [$lookupBase] = splitSteamWear($lookupName);
            $matchesFallback = $primaryName !== ''
                && (strcasecmp($primaryName, $lookupName) === 0 || strcasecmp($primaryName, (string)$lookupBase) === 0);
        } catch (Throwable) {
            $matchesFallback = false;
        }
        if (!$matchesFallback) {
            $itemId = 0;
        }
    }

    $GLOBALS['__chart_seed'] = $lookupName !== '' ? $lookupName : (string)$itemId;
    $marketHashName = marketChartResolveMarketHashName($lookupName, $supportsWear ? $requestedAnchorWear : '');

    $dynamicMaps = $supportsWear
        ? marketChartDynamicMaps($pdo, $itemId, $lookupName, $requestedAnchorWear)
        : ['anchors' => [], 'volumes' => []];
    $GLOBALS['__dynamic_anchors'] = $dynamicMaps['anchors'];
    $GLOBALS['__dynamic_volumes'] = $dynamicMaps['volumes'];
    $anchorWear = marketChartBootstrapAnchors($supportsWear, $lookupName, $marketHashName, $requestedAnchorWear);
    $GLOBALS['__wear'] = $anchorWear;

    $sourceRows = marketChartResolveSourceRows(
        $pdo,
        $itemId,
        $wear,
        $anchorWear,
        $marketHashName,
        $days,
        $supportsWear
    );
    $sourceRows = marketChartAlignProvidersToSteam($sourceRows, $marketHashName);
    if ($since !== '') {
        foreach ($sourceRows as $key => $rows) {
            if (!is_array($rows)) {
                continue;
            }
            $sourceRows[$key] = trimSeriesToSince($rows, $since);
        }
    }

    // Steam came back empty (item not in the caches and Steam refused the live
    // fetch, e.g. rate-limited): draw the REAL marketplace history (CSFloat,
    // Market.CSGO, ... rows that are not synthetic) instead of an empty panel.
    $GLOBALS['__steam_history_fallback'] = '';
    $steamReal = array_values(array_filter((array)($sourceRows['steam'] ?? []), static fn($r) => is_array($r) && empty($r['synthetic'])));
    if (count($steamReal) < 3) {
        $realByDate = [];
        foreach ($sourceRows as $srcKey => $rows) {
            if ($srcKey === 'steam' || !is_array($rows)) {
                continue;
            }
            foreach ($rows as $row) {
                if (!is_array($row) || !empty($row['synthetic'])) {
                    continue;
                }
                $date = (string)($row['date'] ?? '');
                $price = (float)($row['price'] ?? 0);
                if ($date === '' || $price <= 0) {
                    continue;
                }
                if (!isset($realByDate[$date])) {
                    $realByDate[$date] = ['sum' => 0.0, 'cnt' => 0, 'volume' => 0];
                }
                $realByDate[$date]['sum'] += $price;
                $realByDate[$date]['cnt']++;
                $realByDate[$date]['volume'] += (int)($row['volume'] ?? 0);
            }
        }
        if (count($realByDate) >= 3) {
            ksort($realByDate);
            $fallbackRows = [];
            foreach ($realByDate as $date => $bucket) {
                $fallbackRows[] = [
                    'date' => (string)$date,
                    'price' => round($bucket['sum'] / max(1, $bucket['cnt']), 2),
                    'volume' => (int)$bucket['volume'],
                ];
            }
            $sourceRows['steam'] = $fallbackRows;
            $GLOBALS['__steam_history_fallback'] = 'marketplace_aggregate';
        }
    }

    $allByDate = [];
    foreach ($sourceRows as $rows) {
        foreach ($rows as $row) {
            $date = (string)($row['date'] ?? '');
            $price = (float)($row['price'] ?? 0);
            if ($date === '' || $price <= 0) {
                continue;
            }
            if (!isset($allByDate[$date])) {
                $allByDate[$date] = ['date' => $date, 'priceSum' => 0.0, 'cnt' => 0, 'volume' => 0];
            }
            $allByDate[$date]['priceSum'] += $price;
            $allByDate[$date]['cnt']++;
            $allByDate[$date]['volume'] += (int)($row['volume'] ?? 0);
        }
    }
    ksort($allByDate);
    $allRows = array_values(array_map(static function (array $bucket): array {
        return [
            'date' => $bucket['date'],
            'price' => round($bucket['priceSum'] / max(1, $bucket['cnt']), 2),
            'volume' => (int)$bucket['volume'],
        ];
    }, $allByDate));

    $providerDefinitions = [
        'steam' => 'Steam',
        'skinport' => 'Skinport',
        'csfloat' => 'CSFloat',
        'white_market' => 'White.Market',
        'dmarket' => 'DMarket',
        'market_csgo' => 'Market.CSGO',
        'shadowpay' => 'ShadowPay',
        'waxpeer' => 'Waxpeer',
        'mannco' => 'Mannco.store',
        'haloskins' => 'HaloSkins',
        'rapidskins' => 'RapidSkins',
    ];

    $snapshotCards = [];
    $seriesPayload = [];
    foreach ($providerDefinitions as $providerKey => $providerLabel) {
        $rows = $sourceRows[$providerKey] ?? [];
        $last = latestPoint($rows);
        $currentPrice = $last ? round((float)$last['price'], 2) : null;
        $currentVolume = $last ? (int)($last['volume'] ?? 0) : 0;
        $updatedAt = $last && !empty($last['date'])
            ? ((string)$last['date'] . 'T00:00:00')
            : gmdate('Y-m-d\TH:i:s');

        $seriesEntry = [
            'id' => $providerKey,
            'label' => $providerLabel,
            'points' => $rows,
            'point_count' => count($rows),
            'current_price' => $currentPrice,
            'current_volume' => $currentVolume,
            'updated_at' => $updatedAt,
            'market_url' => buildMarketChartUrl($providerKey, $lookupName, $wear),
        ];
        if ($providerKey === 'steam' && !marketChartSeriesLooksSynthetic($rows)) {
            $seriesEntry['history_source'] = 'steam_pricehistory';
            $seriesEntry['live_history'] = true;
            if (!empty($GLOBALS['__steam_history_fallback'])) {
                $seriesEntry['history_source'] = (string)$GLOBALS['__steam_history_fallback'];
                $seriesEntry['live_history'] = false;
            }
        }
        $seriesPayload[$providerKey] = $seriesEntry;

        $snapshotCards[] = [
            'id' => $providerKey,
            'label' => $providerLabel,
            'price' => $currentPrice,
            'volume' => $currentVolume,
            'updated_at' => $updatedAt,
            'market_url' => buildMarketChartUrl($providerKey, $lookupName, $wear),
        ];
    }

    usort($snapshotCards, static function (array $left, array $right): int {
        $leftPrice = isset($left['price']) ? (float)$left['price'] : 0.0;
        $rightPrice = isset($right['price']) ? (float)$right['price'] : 0.0;
        if ($leftPrice <= 0 && $rightPrice <= 0) {
            return strcmp((string)$left['label'], (string)$right['label']);
        }
        if ($leftPrice <= 0) {
            return 1;
        }
        if ($rightPrice <= 0) {
            return -1;
        }
        return $leftPrice <=> $rightPrice;
    });

    $wearPrices = [
        'steam' => buildWearPriceRows('steam', $lookupName, $itemId, $days, $pdo),
        'skinport' => buildWearPriceRows('skinport', $lookupName, $itemId, $days, $pdo),
        'csfloat' => buildWearPriceRows('csfloat', $lookupName, $itemId, $days, $pdo),
        'white_market' => buildWearPriceRows('white_market', $lookupName, $itemId, $days, $pdo),
        'dmarket' => buildWearPriceRows('dmarket', $lookupName, $itemId, $days, $pdo),
        'market_csgo' => buildWearPriceRows('market_csgo', $lookupName, $itemId, $days, $pdo),
        'shadowpay' => buildWearPriceRows('shadowpay', $lookupName, $itemId, $days, $pdo),
        'waxpeer' => buildWearPriceRows('waxpeer', $lookupName, $itemId, $days, $pdo),
        'mannco' => buildWearPriceRows('mannco', $lookupName, $itemId, $days, $pdo),
        'haloskins' => buildWearPriceRows('haloskins', $lookupName, $itemId, $days, $pdo),
        'rapidskins' => buildWearPriceRows('rapidskins', $lookupName, $itemId, $days, $pdo),
    ];

    $allLast = latestPoint($allRows);
    $seriesPayload['all'] = [
        'id' => 'all',
        'label' => 'All Sources',
        'points' => $allRows,
        'point_count' => count($allRows),
        'current_price' => $allLast ? round((float)$allLast['price'], 2) : null,
        'current_volume' => $allLast ? (int)($allLast['volume'] ?? 0) : 0,
        'updated_at' => $allLast && !empty($allLast['date']) ? ((string)$allLast['date'] . 'T00:00:00') : gmdate('Y-m-d\TH:i:s'),
        'market_url' => '',
    ];

    $payload = [
        'success' => true,
        'item_id' => $itemId > 0 ? $itemId : $requestedItemId,
        'wear' => $wear,
        'range' => $range,
        'selected_source' => $sourceId,
        'series' => $seriesPayload,
        'snapshot_cards' => $snapshotCards,
        'wear_prices' => $wearPrices,
    ];
    if ($inProcess) {
        marketChartBundleCacheStore((string)json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $cacheFile);
    }
    return $payload;

} catch (Throwable $e) {
    return [
        'success' => true,
        'item_id' => 0,
        'wear' => (string)($GLOBALS['__response_wear'] ?? ''),
        'range' => strtoupper(trim((string)($query['range'] ?? $_GET['range'] ?? 'ALL'))),
        'selected_source' => normalizeMarketChartSource((string)($query['source'] ?? $_GET['source'] ?? 'steam')),
        'series' => [
            'steam' => ['id' => 'steam', 'label' => 'Steam', 'points' => [], 'point_count' => 0, 'current_price' => null, 'current_volume' => 0, 'updated_at' => gmdate('Y-m-d\TH:i:s'), 'market_url' => ''],
            'skinport' => ['id' => 'skinport', 'label' => 'Skinport', 'points' => [], 'point_count' => 0, 'current_price' => null, 'current_volume' => 0, 'updated_at' => gmdate('Y-m-d\TH:i:s'), 'market_url' => ''],
            'csfloat' => ['id' => 'csfloat', 'label' => 'CSFloat', 'points' => [], 'point_count' => 0, 'current_price' => null, 'current_volume' => 0, 'updated_at' => gmdate('Y-m-d\TH:i:s'), 'market_url' => ''],
            'white_market' => ['id' => 'white_market', 'label' => 'White.Market', 'points' => [], 'point_count' => 0, 'current_price' => null, 'current_volume' => 0, 'updated_at' => gmdate('Y-m-d\TH:i:s'), 'market_url' => ''],
            'dmarket' => ['id' => 'dmarket', 'label' => 'DMarket', 'points' => [], 'point_count' => 0, 'current_price' => null, 'current_volume' => 0, 'updated_at' => gmdate('Y-m-d\TH:i:s'), 'market_url' => ''],
            'market_csgo' => ['id' => 'market_csgo', 'label' => 'Market.CSGO', 'points' => [], 'point_count' => 0, 'current_price' => null, 'current_volume' => 0, 'updated_at' => gmdate('Y-m-d\TH:i:s'), 'market_url' => ''],
            'shadowpay' => ['id' => 'shadowpay', 'label' => 'ShadowPay', 'points' => [], 'point_count' => 0, 'current_price' => null, 'current_volume' => 0, 'updated_at' => gmdate('Y-m-d\TH:i:s'), 'market_url' => ''],
            'waxpeer' => ['id' => 'waxpeer', 'label' => 'Waxpeer', 'points' => [], 'point_count' => 0, 'current_price' => null, 'current_volume' => 0, 'updated_at' => gmdate('Y-m-d\TH:i:s'), 'market_url' => ''],
            'haloskins' => ['id' => 'haloskins', 'label' => 'HaloSkins', 'points' => [], 'point_count' => 0, 'current_price' => null, 'current_volume' => 0, 'updated_at' => gmdate('Y-m-d\TH:i:s'), 'market_url' => ''],
            'rapidskins' => ['id' => 'rapidskins', 'label' => 'RapidSkins', 'points' => [], 'point_count' => 0, 'current_price' => null, 'current_volume' => 0, 'updated_at' => gmdate('Y-m-d\TH:i:s'), 'market_url' => ''],
            'all' => ['id' => 'all', 'label' => 'All Sources', 'points' => [], 'point_count' => 0, 'current_price' => null, 'current_volume' => 0, 'updated_at' => gmdate('Y-m-d\TH:i:s'), 'market_url' => ''],
        ],
        'snapshot_cards' => [],
        'wear_prices' => [
            'steam' => [],
            'skinport' => [],
            'csfloat' => [],
            'white_market' => [],
            'dmarket' => [],
            'market_csgo' => [],
            'shadowpay' => [],
            'waxpeer' => [],
            'haloskins' => [],
            'rapidskins' => [],
        ],
    ];
}
}

if (!defined('MARKET_CHART_BUNDLE_LIB_ONLY')) {
    echo json_encode(marketChartBuildBundlePayload($_GET), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

