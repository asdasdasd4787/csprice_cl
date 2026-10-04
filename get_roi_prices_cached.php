<?php
declare(strict_types=1);
/**
 * Serve ROI price data from Azure SQL cache.
 * Falls back to live Steam scraping for items not yet in the DB.
 * Drop-in replacement for get_roi_cases.php — same request/response format.
 */

require_once __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/price_cache_service.php';
require_once __DIR__ . '/lib/skinport_listing_stamps.php';
require_once __DIR__ . '/lib/steam_circuit.php';
set_time_limit(120);

// ── Shared helpers (mirrors get_roi_cases.php) ────────────────────────────────

function cachedParsePayload(): array
{
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $raw = (string)file_get_contents('php://input');
        if ($raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }
    }
    return $_GET;
}

function cachedRequestedNames(array $payload): array
{
    $names = $payload['market_hash_names'] ?? [];
    if (is_string($names)) {
        $names = array_map('trim', explode(',', $names));
    }
    if (!is_array($names)) {
        return [];
    }
    $result = [];
    foreach ($names as $n) {
        $t = trim((string)$n);
        if ($t !== '') {
            $result[] = $t;
        }
    }
    return array_values(array_unique($result));
}

function cachedNormalizeSource(string $v): string
{
    return strtolower(trim($v)) === 'skinport' ? 'skinport' : 'steam';
}

function cachedNormalizeRange(string $v): string
{
    return match (strtolower(trim($v))) {
        '7d', '7', '1w'            => '7d',
        '90d', '90', '3m'          => '90d',
        '1y', '365d', '12m', 'year'=> '1y',
        'all', 'max'               => 'all',
        default                    => '30d',
    };
}

function cachedRangeDays(string $range): int
{
    return match ($range) {
        '7d'  => 7,
        '90d' => 90,
        '1y'  => 365,
        'all' => 0,
        default => 30,
    };
}

function cachedRangeLabel(string $range): string
{
    return match ($range) {
        '7d'  => '7D',
        '90d' => '90D',
        '1y'  => '1Y',
        'all' => 'MAX',
        default => '30D',
    };
}

function cachedFormatEuro(?float $v): string
{
    if ($v === null || !is_finite($v)) {
        return '—';
    }
    return '€' . number_format($v, 2, '.', '');
}

function cachedFormatSignedPct(?float $v): string
{
    if ($v === null || !is_finite($v)) {
        return '—';
    }
    return sprintf('%s%.2f%%', $v > 0 ? '+' : '', $v);
}

function cachedFormatSignedEuro(?float $v): string
{
    if ($v === null || !is_finite($v)) {
        return '—';
    }
    return sprintf('%s€%s', $v > 0 ? '+' : '', number_format($v, 2, '.', ''));
}

function cachedFormatInt(?int $v): string
{
    return $v === null ? '—' : number_format($v);
}

function cachedHistoryBaseline(array $history, int $days, ?float $currentPrice = null): array
{
    if (!$history) {
        return ['current_price' => $currentPrice, 'baseline_price' => null,
                'change_pct' => null, 'change_abs' => null, 'effective_days' => 0];
    }
    $latest     = $history[count($history) - 1];
    $latestTime = (int)$latest['time'];
    $current    = $currentPrice ?? round((float)$latest['price'], 2);
    $baseline   = $history[0];
    if ($days > 0) {
        $targetTime = $latestTime - ($days * 86400);
        foreach ($history as $pt) {
            if ((int)$pt['time'] <= $targetTime) {
                $baseline = $pt;
            } else {
                break;
            }
        }
    }
    $bp          = round((float)$baseline['price'], 2);
    $effectiveDays = max(0, (int)round(($latestTime - (int)$baseline['time']) / 86400));
    $changePct   = $bp > 0 ? round((($current - $bp) / $bp) * 100, 2) : null;
    $changeAbs   = $bp > 0 ? round($current - $bp, 2) : null;
    return ['current_price' => $current, 'baseline_price' => $bp,
            'change_pct' => $changePct, 'change_abs' => $changeAbs, 'effective_days' => $effectiveDays];
}

function cachedSampleSparkline(array $values, int $max = 24): array
{
    $series = array_values(array_filter(
        array_map(static fn ($v) => is_numeric($v) ? round((float)$v, 4) : null, $values),
        static fn (?float $v) => $v !== null
    ));
    $count = count($series);
    if ($count <= $max) {
        return $series;
    }
    $sampled = [];
    for ($i = 0; $i < $max; $i++) {
        $pos       = (int)round(($i / max(1, $max - 1)) * ($count - 1));
        $sampled[] = $series[$pos];
    }
    return $sampled;
}

function cachedSteamUrl(string $name): string
{
    return sprintf('https://steamcommunity.com/market/listings/730/%s', rawurlencode($name));
}

function cachedMarketHashHasWearSuffix(string $name): bool
{
    return (bool)preg_match(
        '/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i',
        trim($name)
    );
}

function cachedWearListingSnapshotIsTrusted(string $name, ?array $snap): bool
{
    if ($snap === null) {
        return false;
    }

    if (!cachedMarketHashHasWearSuffix($name)) {
        return true;
    }

    // Unified Steam listing pages redirect every wear URL to one page and return
    // the active tab price (usually Factory New). Never trust listing scrapes for
    // wear-specific market hash names.
    $origin = strtolower(trim((string)($snap['steam_price_source'] ?? '')));
    if ($origin === 'steam_catalog' || $origin === 'priceoverview' || $origin === 'steam_listing_buckets') {
        return true;
    }
    if ($origin === 'market_listing_wear' && cachedMarketHashHasWearSuffix($name)) {
        return false;
    }

    @unlink(cachedFileCachePath($name, 'steam'));
    return false;
}

function cachedSkinportUrl(string $name, string $itemPage = '', string $marketPage = ''): string
{
    $candidates = [trim($itemPage), trim($marketPage)];
    foreach ($candidates as $url) {
        if ($url === '') {
            continue;
        }
        // Prefer the item board (lists user offers) over category/search pages.
        if (stripos($url, 'skinport.com/item/') !== false) {
            return $url;
        }
    }
    foreach ($candidates as $url) {
        if ($url !== '') {
            // If a stale sync stored market_page in market_url, still try to
            // rebuild a better item link from the market hash name.
            break;
        }
    }

    $slugUrl = cachedSkinportItemUrlFromName($name);
    if ($slugUrl !== '') {
        return $slugUrl;
    }

    foreach ($candidates as $url) {
        if ($url !== '') {
            return $url;
        }
    }

    return 'https://skinport.com/market/730?search=' . rawurlencode($name);
}

/** Build Skinport item board URL from a market hash name (cheapest-offer page). */
function cachedSkinportItemUrlFromName(string $name): string
{
    $name = trim($name);
    if ($name === '') {
        return '';
    }

    $slug = strtolower($name);
    $slug = str_replace(['★', '☆', '™', '©', '®'], '', $slug);
    $slug = str_replace(['|', '/', '\\', '_', ',', '.', '(', ')', '[', ']', '{', '}'], ' ', $slug);
    $slug = preg_replace('/\s+/', '-', trim($slug)) ?? '';
    $slug = preg_replace('/[^a-z0-9\-]+/', '', $slug) ?? '';
    $slug = preg_replace('/-+/', '-', $slug) ?? '';
    $slug = trim($slug, '-');
    if ($slug === '') {
        return '';
    }

    return 'https://skinport.com/item/' . $slug;
}

/** Pick the live buyer ask (cheapest listed offer). Prefer min_price only. */
function cachedSkinportPickAskPrice(array $itemRow): ?float
{
    if (isset($itemRow['min_price']) && is_numeric($itemRow['min_price']) && (float)$itemRow['min_price'] > 0) {
        return round((float)$itemRow['min_price'], 2);
    }
    return null;
}

/** Skinport UI item-count fields — never /v1/items `quantity` (per-hash offer stack). */
function cachedSkinportUiListingKeys(): array
{
    return ['listings', 'items', 'total', 'count', 'filter_total'];
}

function cachedSkinportListingCountSources(): array
{
    return ['item_menus_listings', 'filter_total', 'other_sales_total'];
}

/**
 * Catalog "X items" count from a Skinport index/snapshot row.
 * Ignores `quantity` — that is the official API offer count, not the site header.
 */
function cachedSkinportListingCountFromRow(?array $row): ?int
{
    if (!is_array($row)) {
        return null;
    }
    $source = strtolower(trim((string)($row['listings_source'] ?? $row['skinport_listings_source'] ?? '')));
    foreach (cachedSkinportUiListingKeys() as $key) {
        if (!isset($row[$key]) || !is_numeric($row[$key])) {
            continue;
        }
        $count = (int)$row[$key];
        if ($count <= 0) {
            continue;
        }
        if ($source === 'quantity') {
            continue;
        }
        return $count;
    }

    return null;
}

function cachedSkinportCategoryFromSlug(string $slug): string
{
    $slug = strtolower(trim($slug));
    $map = [
        'pistol' => 'Pistol',
        'rifle' => 'Rifle',
        'smg' => 'SMG',
        'heavy' => 'Heavy',
        'knife' => 'Knife',
        'gloves' => 'Gloves',
        'agent' => 'Agent',
        'charm' => 'Charm',
        'sticker' => 'Sticker',
        'container' => 'Container',
        'key' => 'Key',
        'patch' => 'Patch',
        'graffiti' => 'Graffiti',
        'collectible' => 'Collectible',
        'pass' => 'Pass',
        'music-kit' => 'Music Kit',
        'music' => 'Music Kit',
        'tool' => 'Tool',
    ];
    if (isset($map[$slug])) {
        return $map[$slug];
    }
    $slug = str_replace('-', ' ', $slug);
    return $slug === '' ? '' : ucwords($slug);
}

/**
 * @return array{category:string,type:string,family:string}
 */
function cachedSkinportCatalogLookupParts(string $name, array $row = []): array
{
    $category = '';
    $type = '';
    $family = '';

    $marketPage = trim((string)($row['market_page'] ?? ''));
    if ($marketPage !== '' && preg_match('~skinport\.com/market/([^?]+)~i', $marketPage, $pathMatch)) {
        $segments = array_values(array_filter(explode('/', trim($pathMatch[1], '/'))));
        if (($segments[0] ?? '') === '730') {
            array_shift($segments);
        }
        $category = cachedSkinportCategoryFromSlug((string)($segments[0] ?? ''));
        $query = [];
        parse_str((string)parse_url($marketPage, PHP_URL_QUERY), $query);
        if (isset($query['cat']) && trim((string)$query['cat']) !== '') {
            $category = cachedSkinportCategoryFromSlug((string)$query['cat']);
        }
        if (isset($query['item']) && trim((string)$query['item']) !== '') {
            $family = trim((string)$query['item']);
        }
    }

    $stripped = trim($name);
    $stripped = preg_replace('/^(?:StatTrak™|StatTrak|Souvenir|★|☆)\s*/u', '', $stripped) ?? $stripped;
    $stripped = trim($stripped);

    if (preg_match('/^Sticker\s*\|\s*(.+)$/u', $stripped, $stickerMatch)) {
        $category = $category !== '' ? $category : 'Sticker';
        $family = $family !== '' ? $family : trim($stickerMatch[1]);
        return ['category' => $category, 'type' => '', 'family' => $family];
    }

    if (str_contains($stripped, '|')) {
        [$left, $right] = array_map('trim', explode('|', $stripped, 2));
        $type = $left;
        if ($family === '') {
            $family = trim((string)preg_replace(
                '/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/u',
                '',
                $right
            ));
        }
    } elseif ($family === '') {
        $family = $stripped;
    }

    if ($category === '' && preg_match('/\b(Case|Capsule|Package|Parcel|Pack|Box)\b/i', $family)) {
        $category = 'Container';
    }
    if ($category === '' && $type !== '') {
        $typeCategory = [
            'desert eagle' => 'Pistol', 'glock-18' => 'Pistol', 'usp-s' => 'Pistol',
            'p250' => 'Pistol', 'p2000' => 'Pistol', 'five-seven' => 'Pistol',
            'tec-9' => 'Pistol', 'cz75-auto' => 'Pistol', 'dual berettas' => 'Pistol',
            'r8 revolver' => 'Pistol', 'ak-47' => 'Rifle', 'm4a4' => 'Rifle',
            'm4a1-s' => 'Rifle', 'awp' => 'Rifle', 'aug' => 'Rifle', 'sg 553' => 'Rifle',
            'galil ar' => 'Rifle', 'famas' => 'Rifle', 'ssg 08' => 'Rifle',
            'g3sg1' => 'Rifle', 'scar-20' => 'Rifle', 'mac-10' => 'SMG', 'mp9' => 'SMG',
            'mp7' => 'SMG', 'mp5-sd' => 'SMG', 'ump-45' => 'SMG', 'p90' => 'SMG',
            'pp-bizon' => 'SMG', 'nova' => 'Heavy', 'xm1014' => 'Heavy',
            'mag-7' => 'Heavy', 'sawed-off' => 'Heavy', 'm249' => 'Heavy',
            'negev' => 'Heavy',
        ];
        $key = strtolower($type);
        if (isset($typeCategory[$key])) {
            $category = $typeCategory[$key];
        } elseif (str_starts_with($type, '★') || preg_match('/\b(knife|karambit|bayonet|butterfly|gloves?)\b/i', $type)) {
            $category = preg_match('/glove/i', $type) ? 'Gloves' : 'Knife';
        }
    }

    return [
        'category' => $category,
        'type' => $type,
        'family' => $family,
    ];
}

function cachedResolveNode(): string
{
    $override = trim((string)getenv('NODE_BIN'));
    if ($override !== '') {
        return $override;
    }
    $candidates = [
        'C:\\Users\\User\\AppData\\Local\\Programs\\cursor\\resources\\app\\resources\\helpers\\node.exe',
        'node',
    ];
    foreach ($candidates as $bin) {
        $bin = trim((string)$bin);
        if ($bin === '') {
            continue;
        }
        if ($bin === 'node' || is_file($bin)) {
            return $bin;
        }
    }
    return 'node';
}

function cachedSkinportListingCountsPath(): string
{
    return __DIR__ . '/assets/skinport-cache/listing_counts.json';
}

/** @return array<string, array<string, mixed>> */
function cachedSkinportListingCountsMap(): array
{
    static $map = null;
    if (is_array($map)) {
        return $map;
    }
    $path = cachedSkinportListingCountsPath();
    if (!is_file($path)) {
        $map = [];
        return $map;
    }
    $decoded = json_decode((string)@file_get_contents($path), true);
    $map = is_array($decoded['map'] ?? null) ? $decoded['map'] : [];
    return $map;
}

function cachedAttachSkinportListingTotal(array $snap, int $count, string $source): array
{
    $snap['sell_orders'] = $count;
    $snap['listings'] = $count;
    $snap['items'] = $count;
    $snap['listings_source'] = $source;
    $snap['listings_fetched_at'] = time();
    return $snap;
}

function cachedPersistSkinportListingCount(string $name, int $count, string $source): void
{
    $name = trim($name);
    if ($name === '' || $count <= 0) {
        return;
    }

    $path = cachedFileCachePath($name, 'skinport');
    $existing = [];
    if (is_file($path)) {
        $decoded = json_decode((string)@file_get_contents($path), true);
        if (is_array($decoded)) {
            $existing = $decoded;
        }
    }
    $existing['market_hash_name'] = $name;
    $existing = cachedAttachSkinportListingTotal($existing, $count, $source);
    if (empty($existing['updated_at'])) {
        $existing['updated_at'] = gmdate(DATE_ATOM);
    }
    @file_put_contents($path, json_encode($existing, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

    $indexPath = cachedSkinportListingCountsPath();
    $dir = dirname($indexPath);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $index = [];
    if (is_file($indexPath)) {
        $decoded = json_decode((string)@file_get_contents($indexPath), true);
        if (is_array($decoded)) {
            $index = $decoded;
        }
    }
    if (!isset($index['map']) || !is_array($index['map'])) {
        $index['map'] = [];
    }
    $index['fetched_at'] = time();
    $now = time();
    $index['map'][$name] = [
        'listings' => $count,
        'source' => $source,
        'fetched_at' => $now,
    ];
    $itemsIndexPath = cachedSkinportItemsIndexPath();
    if (is_file($itemsIndexPath)) {
        $itemsDecoded = json_decode((string)@file_get_contents($itemsIndexPath), true);
        $items = is_array($itemsDecoded['items'] ?? null) ? $itemsDecoded['items'] : [];
        $parts = cachedSkinportCatalogLookupParts($name, is_array($items[$name] ?? null) ? $items[$name] : []);
        $want = strtolower($parts['category'] . "\t" . $parts['type'] . "\t" . $parts['family']);
        if ($parts['family'] !== '') {
            foreach ($items as $itemName => $itemRow) {
                if (!is_string($itemName) || $itemName === $name) {
                    continue;
                }
                $other = cachedSkinportCatalogLookupParts($itemName, is_array($itemRow) ? $itemRow : []);
                $key = strtolower($other['category'] . "\t" . $other['type'] . "\t" . $other['family']);
                if ($key !== $want) {
                    continue;
                }
                $index['map'][$itemName] = [
                    'listings' => $count,
                    'source' => $source,
                    'fetched_at' => $now,
                ];
            }
        }
    }
    @file_put_contents($indexPath, json_encode($index, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

/**
 * Skinport catalog "X items" for this skin family (same number the site header shows).
 * Wear-specific /v1/items quantity is not used.
 *
 * @return array{count:int,source:string}|null
 */
function cachedLiveFetchSkinportListingTotal(string $name, array $indexRow = []): ?array
{
    $name = trim($name);
    if ($name === '') {
        return null;
    }

    $parts = cachedSkinportCatalogLookupParts($name, $indexRow);
    $category = trim($parts['category']);
    $type = trim($parts['type']);
    $family = trim($parts['family']);
    if ($category === '' || $family === '') {
        return null;
    }

    static $memory = [];
    $cacheKey = strtolower($category . "\t" . $type . "\t" . $family);
    if (isset($memory[$cacheKey]) && is_array($memory[$cacheKey])) {
        return $memory[$cacheKey];
    }

    $script = __DIR__ . '/scripts/fetch-skinport-listings.js';
    if (!is_file($script)) {
        return null;
    }

    $cmd = sprintf(
        '%s %s %s %s %s',
        escapeshellarg(cachedResolveNode()),
        escapeshellarg($script),
        escapeshellarg($category),
        escapeshellarg($type),
        escapeshellarg($family)
    );
    $pipes = [];
    // Shared hosting disables proc_open (undefined in PHP 8): fall back to cached data.
    $proc = function_exists('proc_open') ? proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes) : null;
    if (!is_resource($proc)) {
        return null;
    }
    $stdout = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $exit = proc_close($proc);
    if ($exit !== 0 || !is_string($stdout) || $stdout === '') {
        return null;
    }

    $decoded = json_decode($stdout, true);
    $count = is_array($decoded) ? (int)($decoded['listings'] ?? 0) : 0;
    $source = is_array($decoded) ? trim((string)($decoded['source'] ?? 'item_menus_listings')) : '';
    if ($count <= 0) {
        return null;
    }
    $live = [
        'count' => $count,
        'source' => $source !== '' ? $source : 'item_menus_listings',
    ];
    $memory[$cacheKey] = $live;
    return $live;
}

function cachedNormalizeEscapedMarketHtml(string $html): string
{
    $normalized = preg_replace('/\\\\+"/', '"', $html);
    return is_string($normalized) ? $normalized : $html;
}

function cachedExtractEscapedInteger(string $html, string $key): ?int
{
    $normalized = cachedNormalizeEscapedMarketHtml($html);
    foreach ([
        '/"' . preg_quote($key, '/') . '":([0-9]+)/',
        '/' . preg_quote($key, '/') . '":([0-9]+)/',
    ] as $pattern) {
        if (preg_match($pattern, $normalized, $matches)) {
            return (int)$matches[1];
        }
    }

    return null;
}

function cachedSteamListingCountSources(): array
{
    return ['steam_total_count', 'search_sell_listings', 'c_sell_listings', 'steam_catalog'];
}

function cachedSteamTrustedListingCount(?array $snap): ?int
{
    if (!is_array($snap)) {
        return null;
    }

    foreach (['total_count', 'listings', 'sell_listings', 'sell_orders'] as $key) {
        if (!isset($snap[$key]) || !is_numeric($snap[$key])) {
            continue;
        }
        $count = (int)$snap[$key];
        if ($count <= 0) {
            continue;
        }
        $source = strtolower(trim((string)($snap['listings_source'] ?? '')));
        if (in_array($source, cachedSteamListingCountSources(), true)) {
            return $count;
        }
    }

    $sell = isset($snap['sell_orders']) && is_numeric($snap['sell_orders']) ? (int)$snap['sell_orders'] : 0;
    $vol24 = isset($snap['volume_24h']) && is_numeric($snap['volume_24h'])
        ? (int)$snap['volume_24h']
        : (isset($snap['volume']) && is_numeric($snap['volume']) ? (int)$snap['volume'] : 0);
    $origin = strtolower(trim((string)($snap['steam_price_source'] ?? '')));
    if ($sell <= 0) {
        return null;
    }
    // priceoverview.volume is 24h sales, not "Found N results".
    if ($origin === 'priceoverview' || $origin === '' || $origin === 'steam_catalog' || $origin === 'steam_catalog_seed') {
        return null;
    }
    if ($vol24 > 0 && $sell === $vol24) {
        return null;
    }

    return null;
}

function cachedSteamBodyLooksLikeListingPage(string $body): bool
{
    if ($body === '') {
        return false;
    }
    $head = substr($body, 0, 400);
    if (str_contains($head, '<!DOCTYPE') || str_contains($head, '<html')) {
        return str_contains($body, 'cSellListings')
            || str_contains($body, 'market_listing_nav')
            || str_contains($body, 'id="searchResults_total"');
    }
    return true;
}

function cachedExtractSteamListingTotalCount(string $html): ?int
{
    if (!cachedSteamBodyLooksLikeListingPage($html)) {
        return null;
    }
    $normalized = cachedNormalizeEscapedMarketHtml($html);
    foreach (['cSellListings', 'cSellListingsOnHold'] as $key) {
        $value = cachedExtractEscapedInteger($normalized, $key);
        if ($key === 'cSellListings' && $value !== null && $value > 0) {
            return $value;
        }
    }
    foreach ([
        '/id="searchResults_total"[^>]*>\s*([0-9,]+)/i',
        '/searchResults_total[^>]*>\s*([0-9,]+)/i',
        '/m_cTotalCount\s*=\s*([0-9]+)/',
        '/"total_count"\s*:\s*([0-9]+)/',
    ] as $pattern) {
        if (preg_match($pattern, $normalized, $matches)) {
            $value = (int)str_replace(',', '', (string)$matches[1]);
            if ($value > 0) {
                return $value;
            }
        }
    }

    return null;
}

function cachedSteamHttpGet(string $url, int $timeout = 12): array
{
    if (steamCircuitOpen()) {
        return ['status' => 429, 'body' => ''];
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_ENCODING => '',
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        CURLOPT_HTTPHEADER => [
            'Accept: application/json,text/javascript,*/*;q=0.8',
            'Accept-Language: en-US,en;q=0.9',
            'Referer: https://steamcommunity.com/market/',
        ],
    ]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    steamCircuitNote($status, is_string($body) ? $body : '');

    return [
        'status' => $status,
        'body' => is_string($body) ? $body : '',
    ];
}

function cachedAttachSteamListingTotal(array $snap, int $count, string $source): array
{
    $snap['sell_orders'] = $count;
    $snap['listings'] = $count;
    $snap['total_count'] = $count;
    $snap['listings_source'] = $source;
    $snap['listings_fetched_at'] = time();
    return $snap;
}

function cachedSteamListingCountsIndexPath(): string
{
    return __DIR__ . '/assets/steam-market-cache/listing_counts.json';
}

function cachedSteamWearLabels(): array
{
    return ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
}

function cachedStripWearSuffix(string $name): string
{
    $stripped = preg_replace(
        '/\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/iu',
        '',
        trim($name)
    );
    return trim(is_string($stripped) ? $stripped : $name);
}

/**
 * Paint name without wear / StatTrak / Souvenir. Keeps the ★ prefix on knives/gloves.
 *
 * @return array{base:string,kind:string}
 */
function cachedSteamSkinFamilyBase(string $name): array
{
    $base = cachedStripWearSuffix($name);
    $kind = 'normal';
    if (preg_match('/^(★\s*)?(StatTrak™|StatTrak)\s+/u', $base)) {
        $kind = 'stattrak';
        $base = (string)preg_replace('/^(★\s*)?(StatTrak™|StatTrak)\s+/u', '$1', $base);
    } elseif (preg_match('/^Souvenir\s+/u', $base)) {
        $kind = 'souvenir';
        $base = (string)preg_replace('/^Souvenir\s+/u', '', $base);
    }
    return ['base' => trim($base), 'kind' => $kind];
}

function cachedSteamFamilyNameKnown(string $name): bool
{
    $name = trim($name);
    if ($name === '') {
        return false;
    }
    if (is_file(cachedFileCachePath($name, 'steam'))) {
        return true;
    }
    static $steamIndex = null;
    if ($steamIndex === null) {
        $path = cachedSteamListingCountsIndexPath();
        $decoded = is_file($path) ? json_decode((string)@file_get_contents($path), true) : null;
        $steamIndex = is_array($decoded['map'] ?? null) ? $decoded['map'] : [];
    }
    if (isset($steamIndex[$name])) {
        return true;
    }
    static $csfloat = null;
    if ($csfloat === null) {
        $path = __DIR__ . '/assets/csfloat-cache/_price_list_index.json';
        $decoded = is_file($path) ? json_decode((string)@file_get_contents($path), true) : null;
        $csfloat = is_array($decoded['map'] ?? null) ? $decoded['map'] : [];
    }
    if (isset($csfloat[$name])) {
        return true;
    }
    static $skinport = null;
    if ($skinport === null) {
        $path = __DIR__ . '/assets/skinport-cache/items_index.json';
        $decoded = is_file($path) ? json_decode((string)@file_get_contents($path), true) : null;
        $skinport = is_array($decoded['items'] ?? null) ? $decoded['items'] : [];
    }
    return isset($skinport[$name]);
}

/**
 * Regular + StatTrak wear hashes for a painted skin. Souvenir families stay souvenir-only.
 *
 * @return list<string>
 */
function cachedSteamFamilyMarketNames(string $lookupName): array
{
    $lookupName = trim($lookupName);
    if ($lookupName === '') {
        return [];
    }

    $hasWear = cachedMarketHashHasWearSuffix($lookupName);
    $info = cachedSteamSkinFamilyBase($lookupName);
    $base = $info['base'];
    if ($base === '') {
        return [$lookupName];
    }

    $star = str_starts_with($base, '★ ');
    $plain = $star ? trim(substr($base, strlen('★ '))) : $base;
    $names = [];
    $add = static function (string $value) use (&$names): void {
        $value = trim($value);
        if ($value !== '') {
            $names[$value] = true;
        }
    };
    if ($hasWear) {
        $add($lookupName);
    }

    if ($info['kind'] === 'souvenir') {
        foreach (cachedSteamWearLabels() as $wear) {
            $add('Souvenir ' . $plain . ' (' . $wear . ')');
        }
        return array_keys($names);
    }

    $looksPainted = $hasWear || str_contains($base, '|');
    if (!$looksPainted) {
        return array_keys($names);
    }

    foreach (cachedSteamWearLabels() as $wear) {
        $regular = ($star ? '★ ' : '') . $plain . ' (' . $wear . ')';
        $add($regular);
        if ($star) {
            $add('★ StatTrak™ ' . $plain . ' (' . $wear . ')');
        } else {
            $add('StatTrak™ ' . $plain . ' (' . $wear . ')');
            $add('Souvenir ' . $plain . ' (' . $wear . ')');
        }
    }

    $candidates = array_keys($names);
    if ($hasWear) {
        return $candidates;
    }

    $known = [];
    foreach ($candidates as $candidate) {
        if ($candidate === $lookupName || cachedSteamFamilyNameKnown($candidate)) {
            $known[] = $candidate;
        }
    }
    return $known ?: [$lookupName];
}

function cachedPersistSteamListingIndex(string $name, int $count, string $source, array $extra = []): void
{
    $name = trim($name);
    if ($name === '' || $count <= 0) {
        return;
    }
    $path = cachedSteamListingCountsIndexPath();
    $dir = dirname($path);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $decoded = is_file($path) ? json_decode((string)@file_get_contents($path), true) : [];
    $map = is_array($decoded['map'] ?? null) ? $decoded['map'] : [];
    $families = is_array($decoded['families'] ?? null) ? $decoded['families'] : [];
    $row = array_merge([
        'listings' => $count,
        'total_count' => $count,
        'listings_source' => $source,
        'fetched_at' => time(),
    ], $extra);
    if ($source === 'steam_family_sum') {
        $families[$name] = $row;
    } else {
        $map[$name] = $row;
    }
    @file_put_contents($path, (string)json_encode([
        'fetched_at' => time(),
        'map' => $map,
        'families' => $families,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

function cachedPersistSteamListingCountToRoiPrices(string $name, int $count): void
{
    $name = trim($name);
    if ($name === '' || $count <= 0) {
        return;
    }
    if (!function_exists('supabaseClient')) {
        $clientPath = __DIR__ . '/supabase_client.php';
        if (is_file($clientPath)) {
            require_once $clientPath;
        }
    }
    if (!function_exists('supabaseClient')) {
        return;
    }
    try {
        $client = supabaseClient();
        if ($client === null) {
            return;
        }
        $client->patch(
            'roi_prices',
            [
                'market_hash_name' => 'eq.' . $name,
                'source' => 'eq.steam',
            ],
            ['sell_orders' => $count]
        );
    } catch (Throwable) {
        // Listing files are the source of truth when REST is unavailable.
    }
}

function cachedReadSteamListingCount(string $name): int
{
    $name = trim($name);
    if ($name === '') {
        return 0;
    }
    $path = cachedSteamListingCountsIndexPath();
    if (is_file($path)) {
        $decoded = json_decode((string)@file_get_contents($path), true);
        $row = is_array($decoded['map'][$name] ?? null) ? $decoded['map'][$name] : null;
        if (is_array($row)) {
            $count = (int)($row['listings'] ?? $row['total_count'] ?? 0);
            if ($count > 0) {
                return $count;
            }
        }
    }
    $snap = [];
    $file = cachedFileCachePath($name, 'steam');
    if (is_file($file)) {
        $decoded = json_decode((string)@file_get_contents($file), true);
        if (is_array($decoded)) {
            $snap = $decoded;
        }
    }
    if (function_exists('cachedSteamTrustedListingCount')) {
        $trusted = cachedSteamTrustedListingCount($snap);
        if ($trusted !== null && $trusted > 0) {
            return $trusted;
        }
    }
    foreach (['total_count', 'listings', 'sell_listings'] as $key) {
        if (isset($snap[$key]) && is_numeric($snap[$key]) && (int)$snap[$key] > 0) {
            return (int)$snap[$key];
        }
    }
    return 0;
}

function cachedPersistSteamListingCount(string $name, int $count, string $source): void
{
    $name = trim($name);
    if ($name === '' || $count <= 0) {
        return;
    }
    $path = cachedFileCachePath($name, 'steam');
    $existing = [];
    if (is_file($path)) {
        $decoded = json_decode((string)@file_get_contents($path), true);
        if (is_array($decoded)) {
            $existing = $decoded;
        }
    }
    $hasPrice = isset($existing['current_price']) && is_numeric($existing['current_price'])
        && (float)$existing['current_price'] > 0;
    // Listing totals must not create/overwrite a Steam price file with no € quote.
    // Cheap wears (Torque MW/FT/WW/BS) were left as count-only snapshots, so the
    // item-page last-good fallback could not recover them.
    if ($hasPrice) {
        $existing['market_hash_name'] = $name;
        $existing = cachedAttachSteamListingTotal($existing, $count, $source);
        if (empty($existing['updated_at'])) {
            $existing['updated_at'] = gmdate(DATE_ATOM);
        }
        @file_put_contents($path, json_encode($existing, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }
    cachedPersistSteamListingIndex($name, $count, $source);
    cachedPersistSteamListingCountToRoiPrices($name, $count);
}

/**
 * Live-fetch Steam Market listing totals for every wear (and StatTrak) of a skin.
 *
 * @return array{total:int,by_name:array<string,int>,base:string,fetched:int,cached:int}
 */
function cachedRefreshSteamFamilyListingCounts(string $lookupName, int $staleSeconds = 43200): array
{
    $lookupName = trim($lookupName);
    $names = cachedSteamFamilyMarketNames($lookupName);
    $info = cachedSteamSkinFamilyBase($lookupName);
    $base = $info['base'] !== '' ? $info['base'] : cachedStripWearSuffix($lookupName);
    $byName = [];
    $fetched = 0;
    $cached = 0;
    $staleSeconds = max(0, $staleSeconds);

    $fromSearch = [];
    $familyFresh = false;
    $indexPath = cachedSteamListingCountsIndexPath();
    if ($staleSeconds > 0 && is_file($indexPath) && $base !== '') {
        $decoded = json_decode((string)@file_get_contents($indexPath), true);
        $familyRow = is_array($decoded['families'][$base] ?? null) ? $decoded['families'][$base] : null;
        $familyAt = is_array($familyRow) ? (int)($familyRow['fetched_at'] ?? 0) : 0;
        $familyTotal = is_array($familyRow) ? (int)($familyRow['listings'] ?? 0) : 0;
        $familyFresh = $familyTotal > 0 && $familyAt > 0 && (time() - $familyAt) < $staleSeconds;
        if ($familyFresh && is_array($familyRow['wears'] ?? null)) {
            foreach ($familyRow['wears'] as $wearName => $wearCount) {
                if ((int)$wearCount > 0) {
                    $byName[(string)$wearName] = (int)$wearCount;
                    $cached++;
                }
            }
        }
    }
    if (!$familyFresh) {
        try {
            $fromSearch = cachedLiveFetchSteamFamilySearchListings($lookupName);
        } catch (Throwable) {
            $fromSearch = [];
        }
    }
    foreach ($fromSearch as $name => $live) {
        $count = (int)($live['count'] ?? 0);
        $source = (string)($live['source'] ?? 'search_sell_listings');
        if ($count <= 0) {
            continue;
        }
        cachedPersistSteamListingCount($name, $count, $source);
        $byName[$name] = $count;
        $fetched++;
    }

    foreach ($familyFresh ? [] : $names as $index => $name) {
        if (isset($byName[$name]) && $byName[$name] > 0) {
            continue;
        }
        $existing = cachedReadSteamListingCount($name);
        $indexPath = cachedSteamListingCountsIndexPath();
        $indexRow = null;
        if (is_file($indexPath)) {
            $decoded = json_decode((string)@file_get_contents($indexPath), true);
            $indexRow = is_array($decoded['map'][$name] ?? null) ? $decoded['map'][$name] : null;
        }
        $fetchedAt = is_array($indexRow) ? (int)($indexRow['fetched_at'] ?? 0) : 0;
        if ($fetchedAt <= 0) {
            $file = cachedFileCachePath($name, 'steam');
            if (is_file($file)) {
                $snap = json_decode((string)@file_get_contents($file), true);
                $fetchedAt = is_array($snap) ? (int)($snap['listings_fetched_at'] ?? 0) : 0;
                if ($fetchedAt <= 0) {
                    $fetchedAt = (int)@filemtime($file);
                }
            }
        }
        $fresh = $existing > 0 && $fetchedAt > 0 && (time() - $fetchedAt) < $staleSeconds;
        if ($fresh) {
            $byName[$name] = $existing;
            $cached++;
            continue;
        }

        $live = cachedLiveFetchSteamListingTotalCount($name);
        $count = is_array($live) ? (int)($live['count'] ?? 0) : 0;
        $source = is_array($live) ? (string)($live['source'] ?? 'steam_total_count') : 'steam_total_count';
        if ($count > 0) {
            cachedPersistSteamListingCount($name, $count, $source);
            $byName[$name] = $count;
            $fetched++;
        } elseif ($existing > 0) {
            $byName[$name] = $existing;
            $cached++;
        }
        if ($index + 1 < count($names)) {
            usleep(350000);
        }
    }

    foreach (array_keys($byName) as $name) {
        if ($name === $base || !cachedMarketHashHasWearSuffix($name)) {
            unset($byName[$name]);
        }
    }
    $total = array_sum($byName);
    if ($total > 0 && $base !== '') {
        cachedPersistSteamListingIndex($base, $total, 'steam_family_sum', [
            'wears' => $byName,
            'variant_count' => count($byName),
        ]);
    }

    return [
        'total' => $total,
        'by_name' => $byName,
        'base' => $base,
        'fetched' => $fetched,
        'cached' => $cached,
    ];
}

/**
 * Current Steam Market listing count ("Found N results"), not 24h volume.
 *
 * @return array{count:int,source:string}|null
 */
function cachedLiveFetchSteamListingTotalCount(string $name): ?array
{
    $name = trim($name);
    if ($name === '') {
        return null;
    }

    $listingRender = cachedSteamHttpGet(sprintf(
        'https://steamcommunity.com/market/listings/730/%s/render/?query=&start=0&count=1&country=US&language=english&currency=3',
        rawurlencode($name)
    ));
    if ($listingRender['status'] === 200 && $listingRender['body'] !== '' && cachedSteamBodyLooksLikeListingPage($listingRender['body'])) {
        $decoded = json_decode($listingRender['body'], true);
        if (is_array($decoded) && !empty($decoded['success']) && isset($decoded['total_count']) && is_numeric($decoded['total_count'])) {
            $count = (int)$decoded['total_count'];
            if ($count > 0) {
                return ['count' => $count, 'source' => 'steam_total_count'];
            }
        }
        $fromHtml = cachedExtractSteamListingTotalCount($listingRender['body']);
        if ($fromHtml !== null && $fromHtml > 0) {
            return ['count' => $fromHtml, 'source' => 'steam_total_count'];
        }
    }

    $search = cachedSteamHttpGet(
        'https://steamcommunity.com/market/search/render/?appid=730&norender=1&search_descriptions=0&count=5&start=0&query='
        . rawurlencode(str_contains($name, '|') ? '"' . $name . '"' : $name)
    );
    if ($search['status'] === 200 && $search['body'] !== '') {
        $decoded = json_decode($search['body'], true);
        if (is_array($decoded) && !empty($decoded['success'])) {
            $results = is_array($decoded['results'] ?? null) ? $decoded['results'] : [];
            $want = mb_strtolower($name);
            foreach ($results as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $hash = mb_strtolower(trim((string)($row['hash_name'] ?? $row['name'] ?? '')));
                if ($hash !== $want) {
                    continue;
                }
                if (isset($row['sell_listings']) && is_numeric($row['sell_listings'])) {
                    $count = (int)$row['sell_listings'];
                    if ($count > 0) {
                        return ['count' => $count, 'source' => 'search_sell_listings'];
                    }
                }
            }
            // Exact one-item search: total_count is listings when results[0] matches.
            if (count($results) === 1 && isset($decoded['total_count']) && is_numeric($decoded['total_count'])) {
                $only = $results[0];
                $hash = mb_strtolower(trim((string)($only['hash_name'] ?? $only['name'] ?? '')));
                $count = (int)$decoded['total_count'];
                if ($hash === $want && $count > 0 && $count !== (int)($only['sell_listings'] ?? 0) && (int)($only['sell_listings'] ?? 0) > 0) {
                    return ['count' => (int)$only['sell_listings'], 'source' => 'search_sell_listings'];
                }
                if ($hash === $want && isset($only['sell_listings']) && is_numeric($only['sell_listings']) && (int)$only['sell_listings'] > 0) {
                    return ['count' => (int)$only['sell_listings'], 'source' => 'search_sell_listings'];
                }
            }
        }
    }

    $listingHtml = cachedSteamHttpGet(cachedSteamUrl($name), 15);
    if ($listingHtml['status'] === 200 && $listingHtml['body'] !== '' && cachedSteamBodyLooksLikeListingPage($listingHtml['body'])) {
        $fromHtml = cachedExtractSteamListingTotalCount($listingHtml['body']);
        if ($fromHtml !== null && $fromHtml > 0) {
            return ['count' => $fromHtml, 'source' => 'c_sell_listings'];
        }
    }

    return null;
}

/**
 * One Steam Market search covering every wear / StatTrak of a painted skin.
 *
 * @return array<string, array{count:int,source:string}>
 */
function cachedLiveFetchSteamFamilySearchListings(string $lookupName): array
{
    $info = cachedSteamSkinFamilyBase($lookupName);
    $query = $info['base'] !== '' ? $info['base'] : cachedStripWearSuffix($lookupName);
    $query = trim($query);
    if ($query === '') {
        return [];
    }

    $searchQuery = str_contains($query, '|') ? '"' . $query . '"' : $query;
    $wantBase = mb_strtolower($info['base']);
    $out = [];
    $start = 0;
    $pageSize = 50;
    for ($page = 0; $page < 3; $page++) {
        $search = cachedSteamHttpGet(
            'https://steamcommunity.com/market/search/render/?appid=730&norender=1&search_descriptions=0&count='
            . $pageSize . '&start=' . $start . '&query=' . rawurlencode($searchQuery),
            20
        );
        if ($search['status'] !== 200 || $search['body'] === '' || !cachedSteamBodyLooksLikeListingPage($search['body'])) {
            break;
        }
        $decoded = json_decode($search['body'], true);
        if (!is_array($decoded) || empty($decoded['success'])) {
            break;
        }
        $results = is_array($decoded['results'] ?? null) ? $decoded['results'] : [];
        if (!$results) {
            break;
        }
        foreach ($results as $row) {
            if (!is_array($row)) {
                continue;
            }
            $hash = trim((string)($row['hash_name'] ?? $row['name'] ?? ''));
            if ($hash === '') {
                continue;
            }
            $rowBase = mb_strtolower(cachedSteamSkinFamilyBase($hash)['base']);
            if ($rowBase !== $wantBase) {
                continue;
            }
            if (!isset($row['sell_listings']) || !is_numeric($row['sell_listings'])) {
                continue;
            }
            $count = (int)$row['sell_listings'];
            if ($count > 0) {
                $out[$hash] = ['count' => $count, 'source' => 'search_sell_listings'];
            }
        }
        $total = (int)($decoded['total_count'] ?? 0);
        $start += count($results);
        if ($start >= $total || count($results) < $pageSize) {
            break;
        }
        usleep(400000);
    }
    return $out;
}

function cachedExtractCompactSellOrderPrice(string $html): ?float
{
    $normalized = cachedNormalizeEscapedMarketHtml($html);
    foreach ([
        '/"rgCompactSellOrders":\[([0-9,]+)\]/',
        '/rgCompactSellOrders":\[([0-9,]+)\]/',
    ] as $pattern) {
        if (!preg_match($pattern, $normalized, $matches)) {
            continue;
        }

        $numbers = array_values(array_filter(array_map('trim', explode(',', $matches[1])), static fn ($value) => $value !== ''));
        $lowest = null;
        for ($index = 0; $index + 1 < count($numbers); $index += 2) {
            $priceCents = (int)$numbers[$index];
            $price = round($priceCents / 100, 2);
            if ($price <= 0 || $price > 1800) {
                continue;
            }
            $lowest = $lowest === null ? $price : min($lowest, $price);
        }
        if ($lowest !== null) {
            return $lowest;
        }
    }

    return null;
}

function cachedLiveFetchSteamListing(string $name, bool $allowWear = false): ?array
{
    if (!$allowWear && cachedMarketHashHasWearSuffix($name)) {
        return null;
    }
    if (steamCircuitOpen()) {
        return null;
    }

    $ch = curl_init(cachedSteamUrl($name));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        CURLOPT_HTTPHEADER     => ['Accept: text/html,*/*;q=0.8', 'Accept-Language: en-US,en;q=0.9'],
    ]);

    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    steamCircuitNote($status, is_string($body) ? $body : '');

    if ($body === false || $status >= 400 || $body === '') {
        return null;
    }

    if (!cachedSteamListingHtmlMatchesName((string)$body, $name)) {
        return null;
    }

    $currentPrice = cachedExtractCompactSellOrderPrice((string)$body);
    if ($currentPrice === null || $currentPrice <= 0 || $currentPrice > 1800) {
        return null;
    }

    $listingTotal = cachedExtractSteamListingTotalCount((string)$body);
    $snap = [
        'current_price' => $currentPrice,
        'sell_orders'   => $listingTotal,
        'buy_orders'    => null,
        'price_history' => null,
        'updated_at'    => gmdate(DATE_ATOM),
        'steam_price_source' => cachedMarketHashHasWearSuffix($name) ? 'market_listing_wear' : 'market_listing',
    ];
    if ($listingTotal !== null && $listingTotal > 0) {
        $snap = cachedAttachSteamListingTotal($snap, $listingTotal, 'c_sell_listings');
    }

    // Unified listing pages redirect every wear URL to one page and show the
    // active tab's price, so a wear-specific scrape can't be trusted here —
    // same rule already enforced on cache reads (cachedWearListingSnapshotIsTrusted).
    // Filtering it at the source stops a fresh live fetch from ever persisting
    // a wrong/duplicated price for a sibling wear in the first place.
    if (!cachedWearListingSnapshotIsTrusted($name, $snap)) {
        return null;
    }

    return $snap;
}

function cachedSteamListingHtmlMatchesName(string $html, string $name): bool
{
    $decoded = html_entity_decode($html, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $candidates = [
        $decoded,
        stripcslashes($decoded),
        str_replace(['\\"', '\\/'], ['"', '/'], $decoded),
        cachedNormalizeEscapedMarketHtml($decoded),
    ];
    $expected = trim($name);
    if ($expected === '') {
        return false;
    }

    foreach ($candidates as $candidate) {
        if (!is_string($candidate) || $candidate === '') {
            continue;
        }
        if (stripos($candidate, $expected) !== false) {
            return true;
        }
    }

    return false;
}

function cachedEnrichSteamSnapshot(?array $snap): ?array
{
    if ($snap === null) {
        return null;
    }

    $origin = strtolower(trim((string)($snap['steam_price_source'] ?? '')));
    if ($origin !== '' && $origin !== 'null') {
        return $snap;
    }

    $price = isset($snap['current_price']) ? (float)$snap['current_price'] : 0.0;
    if ($price <= 0) {
        return $snap;
    }

    // roi_prices rows and file-cache copies do not persist steam_price_source;
    // sync_roi_prices.php always writes priceoverview snapshots.
    $snap['steam_price_source'] = 'priceoverview';
    return $snap;
}

function cachedIsVerifiedSnapshot(?array $snap, string $source): bool
{
    if ($snap === null) {
        return false;
    }

    if ($source === 'steam') {
        $snap = cachedEnrichSteamSnapshot($snap);
    }

    $price = $snap['current_price'] ?? null;
    if (!is_numeric($price) || (float)$price <= 0) {
        return false;
    }

    if ($source === 'steam') {
        $origin = strtolower(trim((string)($snap['steam_price_source'] ?? '')));
        if ($origin === 'steam_catalog') {
            return false;
        }
        return in_array($origin, ['priceoverview', 'market_listing', 'market_listing_wear', 'steam_listing_buckets'], true);
    }

    return true;
}

function cachedBuildRecord(string $name, ?array $dbRow, string $source, string $range): array
{
    $rangeDays = cachedRangeDays($range);
    $history   = [];
    $cp        = null;
    $sell      = null;
    $buy       = null;

    if ($dbRow !== null) {
        if ($source === 'steam') {
            $dbRow = cachedEnrichSteamSnapshot($dbRow);
        }
        $cp   = isset($dbRow['current_price'])  ? (float)$dbRow['current_price']  : null;
        $sell = isset($dbRow['sell_orders'])     ? (int)$dbRow['sell_orders']      : null;
        $buy  = isset($dbRow['buy_orders'])      ? (int)$dbRow['buy_orders']       : null;
        if ($source === 'steam' && !is_numeric($sell)) {
            $seedListings = cachedCatalogSeedListings($name);
            if ($seedListings !== null) {
                $sell = $seedListings;
            }
        }
        $raw  = $dbRow['price_history'] ?? null;
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $history = $decoded;
            }
        }
    }

    $baseline  = cachedHistoryBaseline($history, $rangeDays, $cp);
    $sparkline = cachedSampleSparkline(array_map(static fn (array $pt) => (float)$pt['price'], $history));

    $effectiveDays = (int)($baseline['effective_days'] ?? 0);
    $rangeUsed     = ($effectiveDays > 0 && $effectiveDays + 2 < $rangeDays)
        ? "{$effectiveDays}D"
        : cachedRangeLabel($range);

    return [
        'market_hash_name'        => $name,
        'source'                  => $source,
        'source_label'            => $source === 'skinport' ? 'Skinport' : 'Steam Market',
        'range_requested'         => $range,
        'range_used'              => $rangeUsed,
        'range_notice'            => '',
        'current_price'           => $baseline['current_price'],
        'current_price_display'   => cachedFormatEuro($baseline['current_price']),
        'baseline_price'          => $baseline['baseline_price'],
        'baseline_price_display'  => cachedFormatEuro($baseline['baseline_price']),
        'roi_pct'                 => $baseline['change_pct'],
        'roi_display'             => cachedFormatSignedPct($baseline['change_pct']),
        'profit_abs'              => $baseline['change_abs'],
        'profit_display'          => cachedFormatSignedEuro($baseline['change_abs']),
        'listings'                => $sell,
        'listings_display'        => cachedFormatInt($sell),
        'secondary_metric_label'  => $source === 'skinport' ? '24h sales' : 'Buy orders',
        'secondary_metric_value'  => $buy,
        'secondary_metric_display'=> cachedFormatInt($buy),
        'market_url'              => $source === 'skinport'
            ? cachedSkinportUrl(
                $name,
                (string)($dbRow['item_page'] ?? (
                    (isset($dbRow['market_url']) && stripos((string)$dbRow['market_url'], 'skinport.com/item/') !== false)
                        ? (string)$dbRow['market_url']
                        : ''
                )),
                (string)($dbRow['market_page'] ?? ($dbRow['market_url'] ?? ''))
            )
            : cachedSteamUrl($name),
        'sparkline'               => $sparkline,
        'updated_at'              => $dbRow ? (string)($dbRow['updated_at'] ?? '') : '',
        'steam_price_source'      => $dbRow['steam_price_source'] ?? null,
        'price_verified'          => cachedIsVerifiedSnapshot($dbRow, $source),
    ];
}

// ── Live fallback via Steam priceoverview (public, no login needed) ───────────

function cachedParseSteamPrice(string $raw): ?float
{
    // Handles "0,78€", "€0.78", "41,--€", "1,234.56", "1.234,56", etc.
    $stripped = preg_replace('/[^0-9.,]/', '', $raw);
    if ($stripped === '' || $stripped === null) {
        return null;
    }
    if (preg_match('/^(\d+),--$/', $stripped, $wholeEuro)) {
        $f = (float)$wholeEuro[1];
        return $f > 0 ? round($f, 2) : null;
    }
    // If ends with exactly 2 digits after comma → European decimal separator
    if (preg_match('/,(\d{2})$/', $stripped)) {
        $stripped = str_replace(['.', ','], ['', '.'], $stripped);
    } else {
        $stripped = str_replace(',', '', $stripped);
    }
    $f = (float)$stripped;
    return $f > 0 ? round($f, 2) : null;
}

function cachedFileLoadVerified(string $name, string $source, bool $skipCatalogFallback, int $maxAgeSeconds = 43200): ?array
{
    $maxAgeSeconds = max(3600, min(7 * 86400, $maxAgeSeconds));
    $ttls = $source === 'steam'
        ? array_values(array_unique([3600, 21600, $maxAgeSeconds]))
        : ($source === 'skinport' ? [1800, 3600] : [3600, 86400, 604800]);
    foreach ($ttls as $ttl) {
        $fc = cachedFileLoad($name, $source, $ttl);
        if ($fc === null) {
            continue;
        }
        if ($source === 'steam') {
            $fc = cachedEnrichSteamSnapshot($fc);
        }
        if ($skipCatalogFallback && !cachedIsVerifiedSnapshot($fc, $source)) {
            continue;
        }
        if ($skipCatalogFallback && $source === 'steam') {
            $origin = strtolower(trim((string)($fc['steam_price_source'] ?? '')));
            if (!in_array($origin, ['priceoverview', 'market_listing', 'market_listing_wear', 'steam_listing_buckets'], true)) {
                continue;
            }
            // Reject file cache copies whose payload timestamp is older than the
            // requested max age, even if mtime was refreshed by rewriting a stale DB row.
            $updatedRaw = trim((string)($fc['updated_at'] ?? ''));
            if ($updatedRaw !== '') {
                $updatedTs = strtotime(str_replace(' ', 'T', $updatedRaw));
                if ($updatedTs !== false && (time() - $updatedTs) > $maxAgeSeconds) {
                    continue;
                }
            }
        }
        if ($source === 'steam' && !cachedWearListingSnapshotIsTrusted($name, $fc)) {
            continue;
        }
        $price = isset($fc['current_price']) && is_numeric($fc['current_price'])
            ? (float)$fc['current_price']
            : null;
        if ($price !== null && $price > 0) {
            return $fc;
        }
    }

    return null;
}

function cachedLiveFetchSteamOverview(string $name): ?array
{
    if (steamCircuitOpen()) {
        return ['_rate_limited' => true];
    }
    $url = 'https://steamcommunity.com/market/priceoverview/?appid=730&currency=3&market_hash_name='
        . rawurlencode($name);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        CURLOPT_HTTPHEADER     => [
            'Accept: application/json,text/plain,*/*',
            'Accept-Language: en-US,en;q=0.9',
        ],
    ]);
    $body = (string)(curl_exec($ch) ?: '');
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if (steamCircuitNote($code, $body)) {
        return ['_rate_limited' => true];
    }
    if ($code !== 200 || $body === '') {
        return null;
    }

    $data = json_decode($body, true);
    if (!is_array($data) || empty($data['success'])) {
        return null;
    }

    // Prefer lowest_price ("Starting at" on the Steam listing) over median_price.
    $cp = cachedParseSteamPrice((string)($data['lowest_price'] ?? $data['median_price'] ?? ''));
    if ($cp === null) {
        return null;
    }

    $volume = isset($data['volume'])
        ? (int)str_replace(',', '', (string)$data['volume'])
        : null;

    return [
        'current_price' => $cp,
        'sell_orders'   => null,
        'volume_24h'    => $volume,
        'buy_orders'    => null,
        'price_history' => null,
        'updated_at'    => gmdate(DATE_ATOM),
        'steam_price_source' => 'priceoverview',
    ];
}

function cachedLiveFetchSteam(array $names, int $listingFallbackLimit = 0, bool $listingFirst = false, bool $fastMode = false): array
{
    $results = [];
    $fallbackNames = [];

    if ($listingFirst) {
        foreach ($names as $index => $name) {
            $allowWear = cachedMarketHashHasWearSuffix($name);
            $listingSnapshot = cachedLiveFetchSteamListing($name, $allowWear);
            if ($listingSnapshot !== null) {
                $results[$name] = $listingSnapshot;
                continue;
            }

            $snap = cachedLiveFetchSteamOverview($name);
            if (is_array($snap) && empty($snap['_rate_limited']) && isset($snap['current_price']) && (float)$snap['current_price'] > 0) {
                $results[$name] = $snap;
            }
            if ($index + 1 < count($names)) {
                usleep(250000);
            }
        }

        return $results;
    }

    $wearVariantCount = count(array_filter($names, static fn (string $n) => cachedMarketHashHasWearSuffix($n)));
    if ($fastMode) {
        // Deals / bulk quotes: priceoverview first with short delays.
        // Keep an explicit listingFallbackLimit for wear rows when overview 429s.
        $batchSize = 1;
        $betweenRequestDelayUs = 120000;
        $betweenBatchDelayUs = 0;
    } else {
        $batchSize = $wearVariantCount >= 3
            ? 1
            : (count($names) > 8 ? 3 : min(6, max(1, count($names))));
        $betweenRequestDelayUs = $wearVariantCount >= 3 ? 750000 : 320000;
        $betweenBatchDelayUs = 500000;
    }

    foreach (array_chunk($names, $batchSize) as $batchIndex => $batch) {
        if ($batchIndex > 0 && $betweenBatchDelayUs > 0) {
            usleep($betweenBatchDelayUs);
        }

        foreach ($batch as $name) {
            $snap = null;
            $rateLimited = false;
            for ($attempt = 0; $attempt < ($fastMode ? 2 : 3); $attempt++) {
                $snap = cachedLiveFetchSteamOverview($name);
                if (!is_array($snap) || empty($snap['_rate_limited'])) {
                    break;
                }
                $rateLimited = true;
                usleep(($fastMode ? 900000 : 1500000) * ($attempt + 1));
            }
            if (!is_array($snap) || !empty($snap['_rate_limited'])) {
                if (!cachedMarketHashHasWearSuffix($name)) {
                    $fallbackNames[] = $name;
                } elseif ($listingFallbackLimit > 0) {
                    $fallbackNames[] = $name;
                } elseif (!$fastMode) {
                    $listingSnapshot = cachedLiveFetchSteamListing($name, true);
                    if ($listingSnapshot !== null) {
                        $results[$name] = $listingSnapshot;
                    }
                }
                // Stop hammering Steam once we're rate-limited — remaining names
                // fall through to listing fallback / file / DB cache.
                if ($rateLimited || (is_array($snap) && !empty($snap['_rate_limited']))) {
                    // Queue remaining wear names for a short listing scrape.
                    if ($listingFallbackLimit > 0) {
                        foreach ($names as $pending) {
                            if (isset($results[$pending])) {
                                continue;
                            }
                            if (cachedMarketHashHasWearSuffix($pending)) {
                                $fallbackNames[] = $pending;
                            }
                        }
                    }
                    break 2;
                }
                usleep($betweenRequestDelayUs);
                continue;
            }
            if (isset($snap['current_price']) && (float)$snap['current_price'] > 0) {
                $results[$name] = $snap;
                if ($listingFallbackLimit > 0 && cachedMarketHashHasWearSuffix($name) && !$fastMode) {
                    $listingSnapshot = cachedLiveFetchSteamListing($name, true);
                    if ($listingSnapshot !== null
                        && isset($listingSnapshot['sell_orders'])
                        && is_numeric($listingSnapshot['sell_orders'])) {
                        $results[$name]['sell_orders'] = (int)$listingSnapshot['sell_orders'];
                    }
                }
            } elseif (!cachedMarketHashHasWearSuffix($name)) {
                $fallbackNames[] = $name;
            } elseif ($listingFallbackLimit > 0) {
                $fallbackNames[] = $name;
            } elseif (!$fastMode) {
                $listingSnapshot = cachedLiveFetchSteamListing($name, true);
                if ($listingSnapshot !== null) {
                    $results[$name] = $listingSnapshot;
                }
            }
            usleep($betweenRequestDelayUs);
        }
    }

    if ($listingFallbackLimit > 0 && $fallbackNames) {
        foreach (array_slice(array_values(array_unique($fallbackNames)), 0, $listingFallbackLimit) as $index => $name) {
            if (isset($results[$name])) {
                continue;
            }
            $allowWear = cachedMarketHashHasWearSuffix($name);
            $listingSnapshot = cachedLiveFetchSteamListing($name, $allowWear);
            if ($listingSnapshot !== null) {
                $results[$name] = $listingSnapshot;
            }
            if ($index + 1 < $listingFallbackLimit) {
                usleep(250000);
            }
        }
    }

    return $results;
}

// ── Local file cache (fallback when Azure SQL is unavailable) ─────────────────

function cachedFileCachePath(string $name, string $source): string
{
    $dir = __DIR__ . '/assets/roi-price-cache';
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    return $dir . '/' . $source . '_' . md5($name) . '.json';
}

function cachedFileLoad(string $name, string $source, int $ttl): ?array
{
    $path = cachedFileCachePath($name, $source);
    if (!is_file($path)) {
        return null;
    }
    $mtime = @filemtime($path);
    if ($mtime === false || $mtime < time() - $ttl) {
        return null;
    }
    $data = json_decode((string)@file_get_contents($path), true);
    return is_array($data) ? $data : null;
}

function cachedFileSave(string $name, string $source, array $data): void
{
    @file_put_contents(cachedFileCachePath($name, $source), json_encode($data));
    if ($source === 'steam') {
        cachedDealsSteamIndexUpsert($name, $data);
    }
}

const STEAM_LAST_GOOD_MAX_AGE_SECONDS = 14 * 86400;

function cachedSteamLastGoodMaxAgeSeconds(array $payload = []): int
{
    if (isset($payload['steam_last_good_max_age_hours'])) {
        return max(24 * 3600, min(30 * 86400, (int)$payload['steam_last_good_max_age_hours'] * 3600));
    }
    return STEAM_LAST_GOOD_MAX_AGE_SECONDS;
}

function cachedSteamLastGoodOrigins(): array
{
    return ['priceoverview', 'market_listing', 'market_listing_wear', 'steam_listing_buckets'];
}

function cachedIsSteamLastGoodSnap(?array $snap, string $name): bool
{
    if ($snap === null) {
        return false;
    }
    $snap = cachedEnrichSteamSnapshot($snap);
    $price = isset($snap['current_price']) ? (float)$snap['current_price'] : 0.0;
    if ($price <= 0) {
        return false;
    }
    $origin = strtolower(trim((string)($snap['steam_price_source'] ?? '')));
    if ($origin === 'steam_catalog' || $origin === 'steam_catalog_seed') {
        return false;
    }
    if ($origin !== '' && !in_array($origin, cachedSteamLastGoodOrigins(), true)) {
        return false;
    }
    return cachedWearListingSnapshotIsTrusted($name, $snap);
}

function cachedSteamSnapAgeSeconds(array $snap, ?string $fallbackPath = null): int
{
    $updatedRaw = trim((string)($snap['updated_at'] ?? ''));
    if ($updatedRaw === '' && isset($snap['fetched_at']) && is_numeric($snap['fetched_at'])) {
        $updatedRaw = (string)$snap['fetched_at'];
    }
    $ts = 0;
    if ($updatedRaw !== '') {
        if (is_numeric($updatedRaw)) {
            $n = (int)$updatedRaw;
            $ts = $n > 20000000000 ? (int)floor($n / 1000) : $n;
        } else {
            $parsed = strtotime(str_replace(' ', 'T', $updatedRaw));
            $ts = $parsed === false ? 0 : $parsed;
        }
    }
    if ($ts <= 0 && $fallbackPath && is_file($fallbackPath)) {
        $ts = (int)@filemtime($fallbackPath);
    }
    if ($ts <= 0) {
        return PHP_INT_MAX;
    }
    return max(0, time() - $ts);
}

function cachedDealsSteamIndexPath(): string
{
    return __DIR__ . '/assets/roi-price-cache/deals_steam_quotes.json';
}

function cachedDealsSteamIndexLoad(): array
{
    if (isset($GLOBALS['_cs2_deals_steam_index']) && is_array($GLOBALS['_cs2_deals_steam_index'])) {
        return $GLOBALS['_cs2_deals_steam_index'];
    }
    $path = cachedDealsSteamIndexPath();
    $empty = ['quotes' => []];
    if (!is_file($path)) {
        $GLOBALS['_cs2_deals_steam_index'] = $empty;
        return $empty;
    }
    $decoded = json_decode((string)@file_get_contents($path), true);
    if (!is_array($decoded)) {
        $GLOBALS['_cs2_deals_steam_index'] = $empty;
        return $empty;
    }
    $quotes = $decoded['quotes'] ?? $decoded;
    $index = ['quotes' => is_array($quotes) ? $quotes : []];
    $GLOBALS['_cs2_deals_steam_index'] = $index;
    return $index;
}

function cachedDealsSteamIndexWrite(array $index): void
{
    $GLOBALS['_cs2_deals_steam_index'] = $index;
    $dir = dirname(cachedDealsSteamIndexPath());
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    @file_put_contents(cachedDealsSteamIndexPath(), json_encode([
        'updated_at' => gmdate(DATE_ATOM),
        'quotes' => $index['quotes'] ?? [],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

function cachedDealsSteamIndexUpsert(string $name, array $snap): void
{
    $name = trim($name);
    if ($name === '' || !cachedIsSteamLastGoodSnap($snap, $name)) {
        return;
    }
    $snap = cachedEnrichSteamSnapshot($snap);
    $index = cachedDealsSteamIndexLoad();
    $trustedListings = cachedSteamTrustedListingCount($snap);
    $index['quotes'][$name] = [
        'market_hash_name' => $name,
        'current_price' => (float)$snap['current_price'],
        'sell_orders' => $trustedListings,
        'buy_orders' => $snap['buy_orders'] ?? null,
        'updated_at' => $snap['updated_at'] ?? gmdate(DATE_ATOM),
        'steam_price_source' => $snap['steam_price_source'] ?? 'priceoverview',
        'price_verified' => true,
        'market_url' => cachedSteamUrl($name),
        'listings_source' => $trustedListings !== null ? (string)($snap['listings_source'] ?? '') : null,
        'total_count' => $trustedListings,
    ];
    cachedDealsSteamIndexWrite($index);
}

function cachedSteamWearBucketLastGood(string $name, int $maxAgeSeconds): ?array
{
    if (!preg_match('/^(.*)\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/iu', $name, $m)) {
        return null;
    }
    $base = trim($m[1]);
    $candidates = [$base];
    $stripped = preg_replace('/^(StatTrak™\s+|Souvenir\s+)/u', '', $base);
    if (is_string($stripped) && trim($stripped) !== $base) {
        $candidates[] = trim($stripped);
    }
    foreach ($candidates as $lookup) {
        $path = __DIR__ . '/assets/roi-price-cache/steam_wear_buckets_' . md5(mb_strtolower($lookup)) . '.json';
        if (!is_file($path)) {
            continue;
        }
        $decoded = json_decode((string)@file_get_contents($path), true);
        if (!is_array($decoded)) {
            continue;
        }
        $prices = is_array($decoded['prices'] ?? null) ? $decoded['prices'] : [];
        $price = isset($prices[$name]) ? (float)$prices[$name] : 0.0;
        if ($price <= 0) {
            continue;
        }
        $snap = [
            'current_price' => $price,
            'sell_orders' => null,
            'buy_orders' => null,
            'price_history' => null,
            'updated_at' => (string)($decoded['updated_at'] ?? gmdate(DATE_ATOM)),
            'steam_price_source' => 'steam_listing_buckets',
            'price_verified' => true,
        ];
        if (cachedSteamSnapAgeSeconds($snap, $path) > $maxAgeSeconds) {
            continue;
        }
        return $snap;
    }
    return null;
}

function cachedFileLoadSteamLastGood(string $name, int $maxAgeSeconds): ?array
{
    $path = cachedFileCachePath($name, 'steam');
    if (!is_file($path)) {
        return null;
    }
    $data = json_decode((string)@file_get_contents($path), true);
    if (!is_array($data) || !cachedIsSteamLastGoodSnap($data, $name)) {
        return null;
    }
    $data = cachedEnrichSteamSnapshot($data);
    if (cachedSteamSnapAgeSeconds($data, $path) > $maxAgeSeconds) {
        return null;
    }
    return $data;
}

function cachedLoadSteamLastGoodBatch(array $names, int $maxAgeSeconds): array
{
    $out = [];
    $quotes = cachedDealsSteamIndexLoad()['quotes'] ?? [];
    foreach ($names as $name) {
        $candidates = [];
        if (isset($quotes[$name]) && is_array($quotes[$name]) && cachedIsSteamLastGoodSnap($quotes[$name], $name)) {
            $candidates[] = cachedEnrichSteamSnapshot($quotes[$name]);
        }
        $fileSnap = cachedFileLoadSteamLastGood($name, $maxAgeSeconds);
        if ($fileSnap !== null) {
            $candidates[] = $fileSnap;
        }
        $bucketSnap = cachedSteamWearBucketLastGood($name, $maxAgeSeconds);
        if ($bucketSnap !== null) {
            $candidates[] = $bucketSnap;
        }
        $best = null;
        $bestAge = PHP_INT_MAX;
        foreach ($candidates as $cand) {
            $age = cachedSteamSnapAgeSeconds($cand);
            if ($age > $maxAgeSeconds) {
                continue;
            }
            if ($age < $bestAge) {
                $best = $cand;
                $bestAge = $age;
            }
        }
        if ($best !== null) {
            $out[$name] = $best;
            cachedDealsSteamIndexUpsert($name, $best);
        }
    }
    return $out;
}

function cachedPersistSteamQuote(string $name, array $snap, ?PDO $pdo = null): void
{
    $name = trim($name);
    if ($name === '' || !cachedIsSteamLastGoodSnap($snap, $name)) {
        return;
    }
    $snap = cachedEnrichSteamSnapshot($snap);
    if (empty($snap['updated_at'])) {
        $snap['updated_at'] = gmdate(DATE_ATOM);
    }
    $snap['price_verified'] = true;
    $snap['market_hash_name'] = $name;
    cachedFileSave($name, 'steam', $snap);
    if (!($pdo instanceof PDO)) {
        return;
    }
    try {
        roiPricesUpsert($pdo, [
            'market_hash_name' => $name,
            'source' => 'steam',
            'current_price' => $snap['current_price'],
            'sell_orders' => cachedSteamTrustedListingCount($snap),
            'buy_orders' => $snap['buy_orders'] ?? null,
            'price_history' => $snap['price_history'] ?? null,
            'market_url' => cachedSteamUrl($name),
        ]);
    } catch (Throwable) {
        // File + deals sidecar already hold last-good Steam.
    }
}

// ── Live fallback via Skinport API (gives 90D price history) ─────────────────

function cachedSteamCatalogUsdToEur(): float
{
    $config = appConfig();
    $fromEnv = getenv('STEAM_CATALOG_USD_TO_EUR');
    if ($fromEnv !== false && is_numeric($fromEnv) && (float)$fromEnv > 0) {
        return (float)$fromEnv;
    }
    $dmarketRate = $config['dmarket']['usd_to_eur'] ?? null;
    return is_numeric($dmarketRate) && (float)$dmarketRate > 0 ? (float)$dmarketRate : 0.92;
}

function cachedSteamCatalogPriceToEur(array $item): ?float
{
    $rawPrice = $item['seed_sell_price'] ?? $item['sell_price'] ?? null;
    if (!is_numeric($rawPrice) || (float)$rawPrice <= 0) {
        return null;
    }

    $price = (float)$rawPrice;
    $text = (string)($item['sell_price_text'] ?? '');
    if (str_contains($text, '$')) {
        $price *= cachedSteamCatalogUsdToEur();
    }

    return round($price, 2);
}

function cachedRoiCatalogByName(): array
{
    static $catalogByName = null;

    if ($catalogByName !== null) {
        return $catalogByName;
    }

    $catalogByName = [];
    foreach ([
        __DIR__ . '/assets/steam-market-cache/roi_catalog.json',
        __DIR__ . '/assets/steam-market-cache/catalog.json',
    ] as $path) {
        if (!is_file($path)) {
            continue;
        }
        $decoded = json_decode((string)file_get_contents($path), true);
        $items = is_array($decoded['items'] ?? null) ? $decoded['items'] : [];
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $name = trim((string)($item['market_hash_name'] ?? ''));
            if ($name !== '' && !isset($catalogByName[$name])) {
                $catalogByName[$name] = $item;
            }
        }
    }

    return $catalogByName;
}

function cachedCatalogSeedListings(string $name): ?int
{
    $item = cachedRoiCatalogByName()[trim($name)] ?? null;
    if (!is_array($item)) {
        return null;
    }

    $listings = $item['seed_sell_listings'] ?? $item['sell_listings'] ?? null;
    return is_numeric($listings) ? (int)$listings : null;
}

function cachedEnrichMissingSteamListings(array &$dbRows, array $names, int $listingFallbackLimit = 0): void
{
    $needsLive = [];

    foreach ($names as $name) {
        if (!isset($dbRows[$name]) || !is_array($dbRows[$name])) {
            continue;
        }

        $trusted = cachedSteamTrustedListingCount($dbRows[$name]);
        if ($trusted !== null && $trusted > 0) {
            $dbRows[$name] = cachedAttachSteamListingTotal(
                $dbRows[$name],
                $trusted,
                (string)($dbRows[$name]['listings_source'] ?? 'steam_total_count')
            );
            continue;
        }

        $seed = cachedCatalogSeedListings($name);
        if ($seed !== null && $seed > 0) {
            $dbRows[$name] = cachedAttachSteamListingTotal($dbRows[$name], $seed, 'steam_catalog');
        }

        $fetchedAt = (int)($dbRows[$name]['listings_fetched_at'] ?? 0);
        $source = strtolower(trim((string)($dbRows[$name]['listings_source'] ?? '')));
        $freshTrusted = $fetchedAt > 0
            && (time() - $fetchedAt) < 6 * 3600
            && in_array($source, ['steam_total_count', 'search_sell_listings', 'c_sell_listings'], true);
        if ($freshTrusted) {
            continue;
        }

        if ($listingFallbackLimit > 0) {
            $needsLive[] = $name;
        }
    }

    if (!$needsLive) {
        return;
    }

    foreach (array_slice($needsLive, 0, max(1, $listingFallbackLimit)) as $index => $name) {
        $live = cachedLiveFetchSteamListingTotalCount($name);
        if (!is_array($live) || (int)($live['count'] ?? 0) <= 0) {
            continue;
        }
        $count = (int)$live['count'];
        $source = (string)($live['source'] ?? 'steam_total_count');
        if (isset($dbRows[$name]) && is_array($dbRows[$name])) {
            $dbRows[$name] = cachedAttachSteamListingTotal($dbRows[$name], $count, $source);
        }
        cachedPersistSteamListingCount($name, $count, $source);
        if ($index + 1 < $listingFallbackLimit) {
            usleep(200000);
        }
    }
}

function cachedLoadSteamCatalogSnapshots(array $names): array
{
    $catalogByName = cachedRoiCatalogByName();

    $snapshots = [];
    foreach ($names as $name) {
        if (!isset($catalogByName[$name])) {
            continue;
        }
        $catalogItem = $catalogByName[$name];
        $price = cachedSteamCatalogPriceToEur($catalogItem);
        if ($price === null || $price <= 0 || $price > 1800) {
            continue;
        }
        $listings = $catalogItem['seed_sell_listings'] ?? $catalogItem['sell_listings'] ?? null;
        $snapshots[$name] = [
            'current_price' => $price,
            'sell_orders'   => is_numeric($listings) ? (int)$listings : null,
            'buy_orders'    => null,
            'price_history' => null,
            'updated_at'    => gmdate(DATE_ATOM),
            'steam_price_source' => 'steam_catalog',
        ];
    }

    return $snapshots;
}

function cachedResolvePython(): string
{
    $override = trim((string)getenv('PYTHON_BIN'));
    if ($override !== '') return $override;
    $localAppData = getenv('LOCALAPPDATA');
    if (is_string($localAppData) && $localAppData !== '') {
        $matches = glob($localAppData . DIRECTORY_SEPARATOR . 'Python' . DIRECTORY_SEPARATOR . 'pythoncore-*' . DIRECTORY_SEPARATOR . 'python.exe');
        if (is_array($matches) && $matches) { rsort($matches); return $matches[0]; }
        $bin = $localAppData . DIRECTORY_SEPARATOR . 'Python' . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'python.exe';
        if (is_file($bin)) return $bin;
    }
    return 'python';
}

function cachedResolveWearMarketName(string $name, ?string $wearOverride = null): string
{
    $name = trim($name);
    if ($name === '') {
        return $name;
    }
    if (preg_match('/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred|StatTrak™ Factory New|StatTrak™ Minimal Wear|StatTrak™ Field-Tested|StatTrak™ Well-Worn|StatTrak™ Battle-Scarred)\)\s*$/u', $name)) {
        return $name;
    }

    // Cases/capsules/stickers/etc. have no wear listings on Skinport — never append FN.
    if (preg_match('/\b(Case|Capsule|Package|Parcel|Pack|Box|Collection|Sticker|Charm|Agent|Patch|Pin|Music Kit|Graffiti|Collectible|Souvenir Package)\b/i', $name)) {
        return $name;
    }
    if (function_exists('itemSupportsWearVariants') && !itemSupportsWearVariants($name)) {
        return $name;
    }
    if (function_exists('looksLikePlayerAgentName') && looksLikePlayerAgentName($name)) {
        return $name;
    }

    static $catalogByKey = null;
    if ($catalogByKey === null) {
        $catalogByKey = [];
        foreach ([
            __DIR__ . '/assets/steam-market-cache/roi_catalog.json',
            __DIR__ . '/assets/steam-market-cache/catalog.json',
        ] as $path) {
            if (!is_file($path)) {
                continue;
            }
            $decoded = json_decode((string)file_get_contents($path), true);
            $items = is_array($decoded['items'] ?? null) ? $decoded['items'] : [];
            foreach ($items as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $itemName = trim((string)($item['market_hash_name'] ?? ''));
                if ($itemName !== '') {
                    $catalogByKey[strtolower($itemName)] = $item;
                }
            }
        }
    }

    $catalogItem = $catalogByKey[strtolower($name)] ?? null;
    $category = strtolower(trim((string)($catalogItem['category'] ?? $catalogItem['category_label'] ?? '')));
    if ($category !== '' && preg_match('/\b(case|capsule|sticker|charm|agent|patch|pin|music|graffiti|collectible|tool|container)\b/i', $category)) {
        return $name;
    }

    $wear = trim((string)($wearOverride ?? ''));
    if ($wear === '') {
        $wear = trim((string)($catalogItem['selected_wear'] ?? ''));
    }
    if ($wear === '') {
        // Wear skins without an explicit wear still default to FN on Skinport.
        if (!preg_match('/\|/', $name) && !(function_exists('itemSupportsWearVariants') && itemSupportsWearVariants($name))) {
            return $name;
        }
        $wear = 'Factory New';
    }

    return $name . ' (' . $wear . ')';
}

function cachedSkinportItemsIndexPath(): string
{
    return __DIR__ . '/assets/skinport-cache/items_index.json';
}

/** @return array<string, array<string, mixed>> */
function cachedSkinportLoadItemsIndex(string $authHeader, bool $allowLive = true): array
{
    static $memory = null;
    if (is_array($memory)) {
        return $memory;
    }

    $path = cachedSkinportItemsIndexPath();
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    $loadDisk = static function () use ($path): ?array {
        if (!is_file($path)) {
            return null;
        }
        $decoded = json_decode((string)file_get_contents($path), true);
        return is_array($decoded['items'] ?? null) ? $decoded['items'] : null;
    };

    if (is_file($path)) {
        $age = time() - (int)filemtime($path);
        // Keep Skinport asks fresh — listing mins move often.
        // Explorer cards pass allowLive=false so a stale index never blocks prices.
        if ($age < 180 || !$allowLive) {
            $fromDisk = $loadDisk();
            if ($fromDisk !== null) {
                $memory = $fromDisk;
                return $memory;
            }
        }
    }

    if (!$allowLive) {
        $fromDisk = $loadDisk();
        $memory = $fromDisk ?? [];
        return $memory;
    }

    $pythonScript = <<<'PY'
import base64, json, sys, requests
auth_b64 = sys.argv[1] if len(sys.argv) > 1 else ''
tradable = sys.argv[2] if len(sys.argv) > 2 else '0'
headers = {'Accept-Encoding': 'br', 'Accept': 'application/json'}
if auth_b64:
    headers['Authorization'] = 'Basic ' + auth_b64
items = requests.get('https://api.skinport.com/v1/items',
    params={'app_id': 730, 'currency': 'EUR', 'tradable': int(tradable)},
    headers=headers, timeout=90)
items.raise_for_status()
rows = {
    r['market_hash_name']: r
    for r in items.json()
    if isinstance(r, dict) and r.get('market_hash_name')
}
print(json.dumps({'items': rows}))
PY;

    $cfg = appConfig()['skinport'] ?? [];
    // Default 0: cheapest live ask on Skinport (incl. trade-locked), not tradable-only.
    $tradable = (int)($cfg['tradable'] ?? 0);
    $command = sprintf('%s - %s %s',
        escapeshellarg(cachedResolvePython()),
        escapeshellarg($authHeader),
        escapeshellarg((string)$tradable)
    );
    $pipes = [];
    $proc = function_exists('proc_open')
        ? proc_open($command, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes)
        : null;
    if (!is_resource($proc)) {
        // No process spawning on this host (shared hosting): serve the last good
        // items_index.json below instead of an empty Skinport map.
        if (is_file($path)) {
            $decoded = json_decode((string)file_get_contents($path), true);
            if (is_array($decoded['items'] ?? null) && $decoded['items']) {
                $memory = $decoded['items'];
                return $memory;
            }
        }
        $memory = [];
        return $memory;
    }

    fwrite($pipes[0], $pythonScript);
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $exit = proc_close($proc);

    if ($exit === 0 && $stdout !== '') {
        $decoded = json_decode($stdout, true);
        if (is_array($decoded['items'] ?? null) && $decoded['items']) {
            $previousMeta = skinportLoadItemsIndexMeta($path);
            $memory = skinportMergeListingStamps(
                $decoded['items'],
                is_array($previousMeta['items'] ?? null) ? $previousMeta['items'] : []
            );
            file_put_contents($path, (string)json_encode([
                'fetched_at' => time(),
                'tradable' => $tradable,
                'listings_enriched_at' => (int)($previousMeta['listings_enriched_at'] ?? 0) ?: null,
                'items' => $memory,
            ], JSON_UNESCAPED_UNICODE));
            return $memory;
        }
    }

    $nodeCandidates = [
        getenv('NODE_BIN') ?: '',
        'C:\\Users\\User\\AppData\\Local\\Programs\\cursor\\resources\\app\\resources\\helpers\\node.exe',
        'node',
    ];
    $nodeBin = 'node';
    foreach ($nodeCandidates as $candidate) {
        $candidate = trim((string)$candidate);
        if ($candidate === '') {
            continue;
        }
        if ($candidate === 'node' || is_file($candidate)) {
            $nodeBin = $candidate;
            break;
        }
    }
    $nodeScript = __DIR__ . '/scripts/fetch-skinport-index.js';
    if (is_file($nodeScript)) {
        $nodeCmd = sprintf(
            '%s %s %s %s %s',
            escapeshellarg($nodeBin),
            escapeshellarg($nodeScript),
            escapeshellarg($authHeader),
            escapeshellarg((string)$tradable),
            escapeshellarg((string)($cfg['currency'] ?? 'EUR'))
        );
        $nodePipes = [];
        $nodeProc = function_exists('proc_open') ? proc_open($nodeCmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $nodePipes) : null;
        if (is_resource($nodeProc)) {
            $nodeOut = stream_get_contents($nodePipes[1]);
            fclose($nodePipes[1]);
            fclose($nodePipes[2]);
            $nodeExit = proc_close($nodeProc);
            if ($nodeExit === 0 && $nodeOut !== '') {
                $nodeDecoded = json_decode((string)$nodeOut, true);
                if (is_array($nodeDecoded['items'] ?? null) && $nodeDecoded['items']) {
                    $previousMeta = skinportLoadItemsIndexMeta($path);
                    $memory = skinportMergeListingStamps(
                        $nodeDecoded['items'],
                        is_array($previousMeta['items'] ?? null) ? $previousMeta['items'] : []
                    );
                    file_put_contents($path, (string)json_encode([
                        'fetched_at' => time(),
                        'tradable' => $tradable,
                        'listings_enriched_at' => (int)($previousMeta['listings_enriched_at'] ?? 0) ?: null,
                        'items' => $memory,
                    ], JSON_UNESCAPED_UNICODE));
                    return $memory;
                }
            }
        }
    }

    // Keep serving the last good index if Skinport /v1/items is rate-limited.
    if (is_file($path)) {
        $decoded = json_decode((string)file_get_contents($path), true);
        if (is_array($decoded['items'] ?? null) && $decoded['items']) {
            $memory = $decoded['items'];
            return $memory;
        }
    }

    $memory = [];
    return $memory;
}

function cachedSkinportBuildHistoryPoints(array $h, float $currentPrice, int $now): array
{
    $anchors = [];
    foreach ([['last_90_days', 90], ['last_30_days', 30], ['last_7_days', 7], ['last_24_hours', 1]] as [$bucket, $days]) {
        foreach (['median', 'avg', 'min'] as $k) {
            if (isset($h[$bucket][$k]) && is_numeric($h[$bucket][$k])) {
                $anchors[] = [
                    'time' => $now - ($days * 86400),
                    'price' => round((float)$h[$bucket][$k], 4),
                ];
                break;
            }
        }
    }
    $anchors[] = ['time' => $now, 'price' => round($currentPrice, 4)];
    usort($anchors, static fn(array $left, array $right): int => $left['time'] <=> $right['time']);

    if (count($anchors) < 2) {
        return $anchors;
    }

    $points = [];
    for ($index = 0; $index < count($anchors) - 1; $index++) {
        $left = $anchors[$index];
        $right = $anchors[$index + 1];
        $spanDays = max(1, (int)round(($right['time'] - $left['time']) / 86400));
        $steps = min($spanDays, 21);
        for ($step = 0; $step < $steps; $step++) {
            $ratio = $steps <= 1 ? 0.0 : ($step / max(1, $steps - 1));
            $points[] = [
                'time' => (int)round($left['time'] + (($right['time'] - $left['time']) * $ratio)),
                'price' => round($left['price'] + (($right['price'] - $left['price']) * $ratio), 4),
            ];
        }
    }
    $points[] = $anchors[count($anchors) - 1];

    $deduped = [];
    foreach ($points as $point) {
        $deduped[(string)$point['time']] = $point;
    }
    ksort($deduped);

    return array_values($deduped);
}

function cachedLiveFetchSkinport(array $names): array
{
    $cfg          = appConfig()['skinport'] ?? [];
    $clientId     = trim((string)($cfg['client_id']     ?? ''));
    $clientSecret = trim((string)($cfg['client_secret'] ?? ''));
    $authHeader   = ($clientId !== '' && $clientSecret !== '')
        ? base64_encode($clientId . ':' . $clientSecret)
        : '';

    $requestMap = [];
    foreach ($names as $name) {
        $apiName = cachedResolveWearMarketName($name);
        $requestMap[$apiName][] = $name;
    }
    $apiNames = array_keys($requestMap);
    if (!$apiNames) {
        return [];
    }

    $itemRows = cachedSkinportLoadItemsIndex($authHeader);

    $pythonScript = <<<'PY'
import base64, json, sys, requests

names      = json.loads(base64.b64decode(sys.argv[1]).decode('utf-8'))
auth_b64   = sys.argv[2] if len(sys.argv) > 2 else ''
headers    = {'Accept-Encoding': 'br', 'Accept': 'application/json'}
if auth_b64:
    headers['Authorization'] = 'Basic ' + auth_b64

hist = requests.get('https://api.skinport.com/v1/sales/history',
    params={'app_id': 730, 'currency': 'EUR', 'market_hash_name': ','.join(names)},
    headers=headers, timeout=60)
hist.raise_for_status()

wanted = set(names)
h = {r['market_hash_name']: r for r in hist.json() if isinstance(r,dict) and r.get('market_hash_name') in wanted}
print(json.dumps({'history': h}))
PY;

    // Sales history is optional — items_index already has min_price + quantity.
    // Never abort the whole Skinport fetch when history/python fails (that was
    // wiping live listing counts and leaving the UI on synthetic chart volume).
    $histRows = [];
    $command = sprintf('%s - %s %s',
        escapeshellarg(cachedResolvePython()),
        escapeshellarg(base64_encode(json_encode($apiNames, JSON_UNESCAPED_UNICODE))),
        escapeshellarg($authHeader)
    );
    $pipes = [];
    $proc  = function_exists('proc_open')
        ? proc_open($command, [0 => ['pipe','r'], 1 => ['pipe','w'], 2 => ['pipe','w']], $pipes)
        : null;
    if (is_resource($proc)) {
        fwrite($pipes[0], $pythonScript);
        fclose($pipes[0]);
        $stdout = stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $exit = proc_close($proc);
        if ($exit === 0 && $stdout !== '') {
            $payload = json_decode($stdout, true);
            if (is_array($payload) && is_array($payload['history'] ?? null)) {
                $histRows = $payload['history'];
            }
        }
    }

    $now       = time();
    $results   = [];

    foreach ($requestMap as $apiName => $originalNames) {
        $h = $histRows[$apiName] ?? [];
        $i = is_array($itemRows[$apiName] ?? null) ? $itemRows[$apiName] : [];
        if (!$h && !$i) {
            continue;
        }

        $cp = cachedSkinportPickAskPrice($i);
        if ($cp === null) {
            foreach (['min', 'avg', 'median'] as $k) {
                if (isset($h['last_24_hours'][$k]) && is_numeric($h['last_24_hours'][$k])) {
                    $cp = round((float)$h['last_24_hours'][$k], 2); break;
                }
            }
        }
        if ($cp === null) {
            foreach (['min', 'avg', 'median'] as $k) {
                if (isset($h['last_7_days'][$k]) && is_numeric($h['last_7_days'][$k])) {
                    $cp = round((float)$h['last_7_days'][$k], 2); break;
                }
            }
        }
        if ($cp === null) {
            continue;
        }

        $pts = cachedSkinportBuildHistoryPoints($h, $cp, $now);
        $uiListings = cachedSkinportListingCountFromRow($i);
        $volume = $uiListings;

        $snapshot = [
            'current_price' => $cp,
            'sell_orders'   => $volume,
            'buy_orders'    => null,
            'price_history' => json_encode($pts),
            'updated_at'    => gmdate(DATE_ATOM),
            'item_page'     => (string)($i['item_page'] ?? ''),
            'market_page'   => (string)($i['market_page'] ?? ''),
            'market_url'    => cachedSkinportUrl(
                $apiName,
                (string)($i['item_page'] ?? ''),
                (string)($i['market_page'] ?? '')
            ),
            'price_verified' => true,
            'skinport_price_source' => isset($i['min_price']) ? 'items_min' : 'history',
        ];
        if ($uiListings !== null && $uiListings > 0) {
            $snapshot = cachedAttachSkinportListingTotal(
                $snapshot,
                $uiListings,
                (string)($i['listings_source'] ?? 'item_menus_listings')
            );
        }

        foreach ($originalNames as $originalName) {
            $results[$originalName] = $snapshot;
        }
    }
    return $results;
}

/**
 * Overlay Skinport listing quantity from the items index onto ROI snapshots.
 * Keeps donut / listing-share counts on real stock even when history or DB rows are stale.
 *
 * @param array<string, array<string, mixed>> $dbRows
 * @param list<string> $names
 */
function cachedSkinportOverlayQuantityFromIndex(array &$dbRows, array $names, bool $allowLive = true): void
{
    if (!$names) {
        return;
    }

    $cfg = appConfig()['skinport'] ?? [];
    $clientId = trim((string)($cfg['client_id'] ?? ''));
    $clientSecret = trim((string)($cfg['client_secret'] ?? ''));
    $authHeader = ($clientId !== '' && $clientSecret !== '')
        ? base64_encode($clientId . ':' . $clientSecret)
        : '';

    $itemRows = cachedSkinportLoadItemsIndex($authHeader, $allowLive);
    if (!$itemRows) {
        return;
    }

    foreach ($names as $name) {
        $apiName = cachedResolveWearMarketName($name);
        $row = is_array($itemRows[$apiName] ?? null) ? $itemRows[$apiName] : null;
        if (!$row) {
            continue;
        }
        $quantity = cachedSkinportListingCountFromRow($row);
        $listingSource = trim((string)($row['listings_source'] ?? ''));
        if ($quantity === null || $quantity <= 0) {
            $countRow = cachedSkinportListingCountsMap()[$apiName]
                ?? cachedSkinportListingCountsMap()[$name]
                ?? null;
            if (is_array($countRow) && (int)($countRow['listings'] ?? 0) > 0) {
                $quantity = (int)$countRow['listings'];
                $listingSource = trim((string)($countRow['source'] ?? 'item_menus_listings'));
            }
        }
        $price = cachedSkinportPickAskPrice($row);
        $hasListings = $quantity !== null && $quantity >= 0;
        $hasPrice = $price !== null && $price > 0;
        if (!$hasListings && !$hasPrice) {
            continue;
        }

        if ($listingSource === '') {
            $listingSource = 'item_menus_listings';
        }
        $itemPage = (string)($row['item_page'] ?? '');
        $marketPage = (string)($row['market_page'] ?? '');
        $marketUrl = cachedSkinportUrl($apiName, $itemPage, $marketPage ?: (string)($row['market_url'] ?? ''));

        if (!isset($dbRows[$name]) || !is_array($dbRows[$name])) {
            if (!$hasPrice) {
                continue;
            }
            $snap = [
                'current_price' => $price,
                'buy_orders' => null,
                'price_history' => null,
                'updated_at' => gmdate(DATE_ATOM),
                'item_page' => $itemPage,
                'market_page' => $marketPage,
                'market_url' => $marketUrl,
                'price_verified' => true,
                'skinport_price_source' => 'items_index_overlay',
            ];
            $dbRows[$name] = $hasListings
                ? cachedAttachSkinportListingTotal($snap, $quantity, $listingSource)
                : $snap;
            continue;
        }

        if ($hasListings) {
            $dbRows[$name] = cachedAttachSkinportListingTotal($dbRows[$name], $quantity, $listingSource);
        }
        if ($hasPrice) {
            $dbRows[$name]['current_price'] = $price;
            $dbRows[$name]['price_verified'] = true;
            $dbRows[$name]['skinport_price_source'] = 'items_index_overlay';
            $dbRows[$name]['updated_at'] = gmdate(DATE_ATOM);
        }
        if ($itemPage !== '') {
            $dbRows[$name]['item_page'] = $itemPage;
        }
        if ($marketPage !== '') {
            $dbRows[$name]['market_page'] = $marketPage;
        }
        $dbRows[$name]['market_url'] = cachedSkinportUrl(
            $apiName,
            (string)($dbRows[$name]['item_page'] ?? $itemPage),
            (string)($dbRows[$name]['market_page'] ?? $marketPage ?: ($dbRows[$name]['market_url'] ?? ''))
        );
    }
}

/**
 * When Steam has no usable price (Contraband / 0 listings / catalog seed capped),
 * fill from Skinport items index so Market Explorer cards are not blank.
 *
 * @param array<string, array<string, mixed>> $dbRows
 * @param list<string> $names
 */
function cachedApplySkinportFallbackForEmptySteam(array &$dbRows, array $names, bool $allowLive = true): void
{
    $empty = [];
    foreach ($names as $name) {
        $row = $dbRows[$name] ?? null;
        $price = is_array($row) && isset($row['current_price']) && is_numeric($row['current_price'])
            ? (float)$row['current_price']
            : 0.0;
        if ($price <= 0) {
            $empty[] = $name;
        }
    }
    if (!$empty) {
        return;
    }

    cachedSkinportOverlayQuantityFromIndex($dbRows, $empty, $allowLive);

    $stillEmpty = [];
    foreach ($empty as $name) {
        $row = $dbRows[$name] ?? null;
        $price = is_array($row) && isset($row['current_price']) && is_numeric($row['current_price'])
            ? (float)$row['current_price']
            : 0.0;
        if ($price <= 0) {
            $stillEmpty[] = $name;
            continue;
        }
        $dbRows[$name]['steam_price_source'] = 'skinport_fallback';
        $dbRows[$name]['price_verified'] = true;
    }

    if (!$stillEmpty || !$allowLive) {
        return;
    }

    foreach (cachedLiveFetchSkinport($stillEmpty) as $name => $snap) {
        if (!is_array($snap)) {
            continue;
        }
        $price = isset($snap['current_price']) && is_numeric($snap['current_price'])
            ? (float)$snap['current_price']
            : 0.0;
        if ($price <= 0) {
            continue;
        }
        $snap['steam_price_source'] = 'skinport_fallback';
        $snap['price_verified'] = true;
        $dbRows[$name] = $snap;
        cachedFileSave($name, 'skinport', $snap);
    }
}

function cachedIsSkinportFallbackSteamRow(?array $row): bool
{
    if ($row === null) {
        return false;
    }
    return strtolower(trim((string)($row['steam_price_source'] ?? ''))) === 'skinport_fallback';
}

/**
 * Map "Sticker Slab | Howling Dawn" → "Sticker | Howling Dawn" (general pattern).
 */
function cachedStickerNameFromSlab(string $name): ?string
{
    $name = trim($name);
    if (!str_starts_with($name, 'Sticker Slab |')) {
        return null;
    }
    $suffix = trim(substr($name, strlen('Sticker Slab |')));
    return $suffix !== '' ? ('Sticker | ' . $suffix) : null;
}

/**
 * Load a Steam-catalog snapshot for a sticker without the €1800 Market Explorer cap.
 * High-value Contraband stickers (e.g. Howling Dawn) must still price their slabs.
 *
 * @return array<string, mixed>|null
 */
function cachedSteamCatalogSnapshotForSticker(string $name): ?array
{
    $catalogItem = cachedRoiCatalogByName()[$name] ?? null;
    if (!is_array($catalogItem)) {
        return null;
    }
    $price = cachedSteamCatalogPriceToEur($catalogItem);
    if ($price === null || $price <= 0) {
        return null;
    }
    $listings = $catalogItem['seed_sell_listings'] ?? $catalogItem['sell_listings'] ?? null;

    return [
        'current_price' => $price,
        'sell_orders' => is_numeric($listings) ? (int)$listings : null,
        'buy_orders' => null,
        'price_history' => null,
        'updated_at' => gmdate(DATE_ATOM),
        'steam_price_source' => 'steam_catalog',
    ];
}

/**
 * When a Sticker Slab has no usable market price, reuse the matching Sticker | … quote.
 * Price (and history when present) are inherited; slab listing counts stay on the slab SKU.
 *
 * @param array<string, array<string, mixed>> $dbRows
 * @param list<string> $names
 */
function cachedApplyStickerSlabPriceFallback(array &$dbRows, array $names, string $source, bool $allowLive = true): void
{
    $need = [];
    foreach ($names as $name) {
        $sticker = cachedStickerNameFromSlab($name);
        if ($sticker === null) {
            continue;
        }
        $row = $dbRows[$name] ?? null;
        $price = is_array($row) && isset($row['current_price']) && is_numeric($row['current_price'])
            ? (float)$row['current_price']
            : 0.0;
        if ($price > 0) {
            continue;
        }
        $need[$name] = $sticker;
    }
    if (!$need) {
        return;
    }

    $stickerNames = array_values(array_unique(array_values($need)));
    /** @var array<string, array<string, mixed>> $stickerRows */
    $stickerRows = [];

    foreach ($stickerNames as $sticker) {
        $row = $dbRows[$sticker] ?? null;
        if (!is_array($row)) {
            continue;
        }
        $price = isset($row['current_price']) && is_numeric($row['current_price'])
            ? (float)$row['current_price']
            : 0.0;
        if ($price > 0) {
            $stickerRows[$sticker] = $row;
        }
    }

    $missing = array_values(array_filter(
        $stickerNames,
        static fn (string $n): bool => !isset($stickerRows[$n])
    ));

    if ($missing && $source === 'steam') {
        $still = [];
        foreach ($missing as $sticker) {
            $snap = cachedSteamCatalogSnapshotForSticker($sticker);
            if ($snap === null) {
                $still[] = $sticker;
                continue;
            }
            $stickerRows[$sticker] = $snap;
        }
        if ($still) {
            $tmp = [];
            cachedSkinportOverlayQuantityFromIndex($tmp, $still, $allowLive);
            foreach ($still as $sticker) {
                $row = $tmp[$sticker] ?? null;
                $price = is_array($row) && isset($row['current_price']) && is_numeric($row['current_price'])
                    ? (float)$row['current_price']
                    : 0.0;
                if ($price <= 0) {
                    continue;
                }
                $row['steam_price_source'] = 'skinport_fallback';
                $stickerRows[$sticker] = $row;
            }
            $stillLive = array_values(array_filter(
                $still,
                static fn (string $n): bool => !isset($stickerRows[$n])
            ));
            if ($stillLive && $allowLive) {
                foreach (cachedLiveFetchSkinport($stillLive) as $sticker => $snap) {
                    if (!is_array($snap)) {
                        continue;
                    }
                    $price = isset($snap['current_price']) && is_numeric($snap['current_price'])
                        ? (float)$snap['current_price']
                        : 0.0;
                    if ($price <= 0) {
                        continue;
                    }
                    $snap['steam_price_source'] = 'skinport_fallback';
                    $stickerRows[$sticker] = $snap;
                }
            }
        }
    } elseif ($missing && $source === 'skinport') {
        $tmp = [];
        cachedSkinportOverlayQuantityFromIndex($tmp, $missing, $allowLive);
        foreach ($missing as $sticker) {
            $row = $tmp[$sticker] ?? null;
            $price = is_array($row) && isset($row['current_price']) && is_numeric($row['current_price'])
                ? (float)$row['current_price']
                : 0.0;
            if ($price > 0) {
                $stickerRows[$sticker] = $row;
            }
        }
        $stillLive = array_values(array_filter(
            $missing,
            static fn (string $n): bool => !isset($stickerRows[$n])
        ));
        if ($stillLive && $allowLive) {
            foreach (cachedLiveFetchSkinport($stillLive) as $sticker => $snap) {
                if (!is_array($snap)) {
                    continue;
                }
                $price = isset($snap['current_price']) && is_numeric($snap['current_price'])
                    ? (float)$snap['current_price']
                    : 0.0;
                if ($price <= 0) {
                    continue;
                }
                $stickerRows[$sticker] = $snap;
            }
        }
        // Skinport often has no Contraband sticker ask — fall back to Steam catalog seed.
        $stillCatalog = array_values(array_filter(
            $missing,
            static fn (string $n): bool => !isset($stickerRows[$n])
        ));
        foreach ($stillCatalog as $sticker) {
            $snap = cachedSteamCatalogSnapshotForSticker($sticker);
            if ($snap === null) {
                continue;
            }
            $snap['skinport_price_source'] = 'sticker_steam_catalog_fallback';
            $stickerRows[$sticker] = $snap;
        }
    }

    foreach ($need as $slab => $sticker) {
        $src = $stickerRows[$sticker] ?? null;
        if (!is_array($src)) {
            continue;
        }
        $price = isset($src['current_price']) && is_numeric($src['current_price'])
            ? (float)$src['current_price']
            : 0.0;
        if ($price <= 0) {
            continue;
        }

        $existing = isset($dbRows[$slab]) && is_array($dbRows[$slab]) ? $dbRows[$slab] : [];
        $merged = $existing;
        $merged['current_price'] = $price;
        if (!empty($src['price_history'])) {
            $merged['price_history'] = $src['price_history'];
        }
        if (!isset($merged['updated_at']) || trim((string)$merged['updated_at']) === '') {
            $merged['updated_at'] = (string)($src['updated_at'] ?? gmdate(DATE_ATOM));
        }
        // Keep slab sell_orders / listings as-is (often 0); only price is borrowed.
        if ($source === 'steam') {
            $origin = strtolower(trim((string)($src['steam_price_source'] ?? '')));
            $merged['steam_price_source'] = $origin === 'skinport_fallback'
                ? 'skinport_fallback'
                : 'sticker_slab_fallback';
            $merged['price_verified'] = true;
        } else {
            $merged['skinport_price_source'] = 'sticker_slab_fallback';
            $merged['price_verified'] = true;
        }
        $dbRows[$slab] = $merged;
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────

$directRoiEntry = realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === realpath(__FILE__);
if ($directRoiEntry) {
try {
    $payload    = cachedParsePayload();
    $names      = cachedRequestedNames($payload);
    if (!$names) {
        throw new RuntimeException('No item names provided.');
    }

    $source = cachedNormalizeSource((string)($payload['source'] ?? 'steam'));
    $range  = cachedNormalizeRange((string)($payload['range']  ?? '1y'));
    $preferLive = !empty($payload['prefer_live']) || !empty($payload['fresh']) || !empty($payload['ignore_cache']);
    $cacheOnly = !empty($payload['cache_only']) || !empty($payload['offline_cache_only']);
    $ignoreCache = !empty($payload['ignore_cache']);
    $maxAgeHours = priceCacheMaxAgeHours($payload);
    $maxAgeSeconds = $maxAgeHours * 3600;
    $allowLiveRefresh = priceCacheAllowLive($payload);
    // Market Explorer cards: cached sell price only. Do not wait on live Steam
    // total_count or Skinport /v1/items. Item-page distribution still live-fetches.
    $explorerFast = !empty($payload['explorer_fast']) || !empty($payload['skip_live_listings']);
    if ($explorerFast) {
        $preferLive = false;
        $cacheOnly = true;
        $allowLiveRefresh = false;
        set_time_limit(15);
    }
    $fileCacheTtl = !empty($payload['db_cache_first']) || !empty($payload['db_first'])
        ? $maxAgeSeconds
        : PRICE_CACHE_FILE_TTL_SECONDS;
    $skipCatalogFallback = !empty($payload['skip_catalog_fallback']);
    $steamCatalogOnly = $source === 'steam' && !empty($payload['steam_catalog_only']);
    $steamListingFirst = $source === 'steam' && !empty($payload['steam_listing_first']);
    $steamFastMode = $source === 'steam' && (
        !empty($payload['deals_mode'])
        || !empty($payload['steam_fast_overview'])
        || !empty($payload['skip_history'])
    );
    // Deals sends steam_fast_overview + steam_listing_fallback together: keep
    // overview-first speed, but still allow a short listing scrape when 429s.
    $steamListingFallbackLimit = $source === 'steam' && !$explorerFast && (!empty($payload['steam_listing_fallback']) || $steamListingFirst)
        ? max(1, min(10, (int)($payload['steam_listing_fallback_limit'] ?? ($steamListingFirst ? count($names) : 4))))
        : 0;

    $dbRows  = [];
    $pdo = null;
    // Deals reads last-good Steam from the on-disk sidecar / per-item files so a
    // hung Supabase pooler cannot blank the column. 24h TTL is for live refresh
    // only — last-good quotes stay until a newer priceoverview succeeds.
    $dealsSteamStore = $source === 'steam' && (
        !empty($payload['deals_mode']) || !empty($payload['steam_fast_overview'])
    );
    $steamLastGoodAge = $dealsSteamStore
        ? cachedSteamLastGoodMaxAgeSeconds($payload)
        : $maxAgeSeconds;
    // Deals sends db_cache_first so Factory New overview quotes can paint
    // before Steam live. Live-all here would 429/timeout and blank the column.
    $steamCacheFirst = $source === 'steam'
        && !empty($payload['db_cache_first'])
        && !$ignoreCache
        && !$steamListingFirst;

    if ($source === 'steam' && !$ignoreCache) {
        foreach (cachedLoadSteamLastGoodBatch($names, $steamLastGoodAge) as $name => $snap) {
            $dbRows[$name] = $snap;
        }
    }

    if ($preferLive || $steamListingFirst) {
        if ($source === 'skinport') {
            $liveSnapshots = cachedLiveFetchSkinport($names);
        } elseif ($steamCacheFirst) {
            $liveSnapshots = [];
        } else {
            $liveSnapshots = cachedLiveFetchSteam($names, $steamListingFallbackLimit, $steamListingFirst, $steamFastMode);
        }

        foreach ($liveSnapshots as $name => $snap) {
            if (isset($snap['current_price']) && (float)$snap['current_price'] > 0) {
                $dbRows[$name] = $snap;
                if ($source === 'steam') {
                    cachedPersistSteamQuote($name, $snap, $pdo);
                } else {
                    cachedFileSave($name, $source, $snap);
                }
            }
        }
    }

    // Cache-aside: DB + file cache fill gaps. ignore_cache skips both so prefer_live
    // callers (inventory refresh) cannot fall back to a stale € price from roi_prices.
    // Deals Steam skips PDO reads — last-good files already loaded above.
    try {
        if (!$dealsSteamStore) {
            $pdo = marketDataPdoConnection();
            $needsDb = array_values(array_filter($names, static function (string $n) use ($dbRows): bool {
                if (!isset($dbRows[$n])) {
                    return true;
                }
                $price = isset($dbRows[$n]['current_price']) ? (float)$dbRows[$n]['current_price'] : 0.0;
                return $price <= 0;
            }));
            if ($needsDb && !$ignoreCache) {
                $freshDb = priceCacheLoadRoiBatch($pdo, $needsDb, $source, true, $maxAgeSeconds);
                foreach ($freshDb as $n => $row) {
                    if ($source === 'steam') {
                        $row = cachedEnrichSteamSnapshot($row);
                        if ($skipCatalogFallback && !cachedWearListingSnapshotIsTrusted($n, $row)) {
                            continue;
                        }
                    }
                    $price = isset($row['current_price']) ? (float)$row['current_price'] : 0.0;
                    if ($price <= 0) {
                        continue;
                    }
                    $dbRows[$n] = $row;
                    cachedFileSave($n, $source, $row);
                }
                $stillMissing = array_values(array_filter($needsDb, static fn (string $n) => !isset($dbRows[$n])));
                // Last-good Steam (priceoverview / listing buckets) may be older than
                // the fresh TTL. Catalog seeds stay blocked via skip_catalog_fallback.
                $allowStaleDb = !$preferLive && !($source === 'steam' && $skipCatalogFallback);
                if ($source === 'steam' && $stillMissing) {
                    $allowStaleDb = true;
                }
                if ($stillMissing && $allowStaleDb) {
                    $staleDb = priceCacheLoadRoiBatch($pdo, $stillMissing, $source, false, $maxAgeSeconds);
                    foreach ($staleDb as $n => $row) {
                        if ($source === 'steam') {
                            $row = cachedEnrichSteamSnapshot($row);
                            if (!cachedIsSteamLastGoodSnap($row, $n)) {
                                continue;
                            }
                            if (cachedSteamSnapAgeSeconds($row) > $steamLastGoodAge) {
                                continue;
                            }
                        }
                        $price = isset($row['current_price']) ? (float)$row['current_price'] : 0.0;
                        if ($price <= 0) {
                            continue;
                        }
                        $dbRows[$n] = $row;
                        cachedFileSave($n, $source, $row);
                    }
                }
            }
        }
    } catch (Throwable) {
        // DB unavailable — fall through to file cache / live
    }

    $missing = [];
    foreach ($names as $name) {
        if (isset($dbRows[$name])) {
            continue;
        }
        $fc = null;
        if (!$ignoreCache) {
            if ($source === 'steam') {
                $fc = cachedFileLoadSteamLastGood($name, $steamLastGoodAge);
                if ($fc === null) {
                    $fc = cachedSteamWearBucketLastGood($name, $steamLastGoodAge);
                }
            } else {
                $fc = $skipCatalogFallback
                    ? cachedFileLoadVerified($name, $source, true, $maxAgeSeconds)
                    : cachedFileLoad($name, $source, $fileCacheTtl);
            }
        }
        if ($fc !== null) {
            if ($source === 'steam' && !cachedWearListingSnapshotIsTrusted($name, $fc)) {
                $fc = null;
            }
        }
        if ($fc !== null) {
            $cachedPrice = isset($fc['current_price']) && is_numeric($fc['current_price'])
                ? (float)$fc['current_price']
                : null;
            if ($cachedPrice !== null && $cachedPrice > 0) {
                $dbRows[$name] = $fc;
                continue;
            }
            if ($cacheOnly) {
                $dbRows[$name] = $fc;
                continue;
            }
        }
        $missing[] = $name;
    }

    // 2.5. Stale price refresh — live-fetch current_price for DB rows > 6 h old.
    //      Only runs for small batches (ROI page ≤ 30 items).
    //      Skipped for large deal-page batches to avoid latency spikes.
    if (!$skipCatalogFallback && $source === 'steam' && (!$cacheOnly || $steamCatalogOnly)) {
        $missing = array_values(array_filter($names, static fn (string $n) => !isset($dbRows[$n])));
        if ($missing) {
            foreach (cachedLoadSteamCatalogSnapshots($missing) as $name => $snap) {
                $dbRows[$name] = $snap;
                cachedFileSave($name, $source, $snap);
            }
        }
        if ($steamCatalogOnly) {
            $cacheOnly = true;
        }
    }

    $staleRefreshThreshold = $maxAgeSeconds;
    $staleNames = [];
    if ($allowLiveRefresh && !$cacheOnly && count($names) <= 50) {
        foreach ($names as $name) {
            if (!isset($dbRows[$name])) continue;
            if (!priceCacheRowIsFresh($dbRows[$name], $staleRefreshThreshold)) {
                $staleNames[] = $name;
            }
        }
    }

    if ($allowLiveRefresh && $staleNames) {
        if ($source === 'steam') {
            $freshPrices = cachedLiveFetchSteam($staleNames, $steamListingFallbackLimit, false, $steamFastMode);
            foreach ($freshPrices as $name => $snap) {
                if (!isset($snap['current_price']) || (float)$snap['current_price'] <= 0) {
                    continue;
                }
                $merged = array_merge($dbRows[$name] ?? [], $snap);
                $merged['updated_at'] = gmdate(DATE_ATOM);
                $dbRows[$name] = $merged;
                cachedPersistSteamQuote($name, $merged, $pdo);
            }
        } elseif ($source === 'skinport') {
            $freshPrices = cachedLiveFetchSkinport($staleNames);
            foreach ($freshPrices as $name => $snap) {
                $dbRows[$name]['current_price'] = $snap['current_price'];
                if (isset($snap['sell_orders'])) $dbRows[$name]['sell_orders'] = $snap['sell_orders'];
                if (!empty($snap['price_history'])) $dbRows[$name]['price_history'] = $snap['price_history'];
                if (!empty($snap['market_url'])) $dbRows[$name]['market_url'] = $snap['market_url'];
                if (!empty($snap['item_page'])) $dbRows[$name]['item_page'] = $snap['item_page'];
                if (!empty($snap['market_page'])) $dbRows[$name]['market_page'] = $snap['market_page'];
                $dbRows[$name]['updated_at'] = gmdate(DATE_ATOM);
                cachedFileSave($name, $source, $dbRows[$name]);
            }
        }
    }

    // 3a. Items still missing → live Skinport fetch (gives 90D price history)
    $missing = array_values(array_filter($names, static fn (string $n) => !isset($dbRows[$n])));
    if ($allowLiveRefresh && !$cacheOnly && $missing && $source === 'skinport') {
        $liveSnapshots = cachedLiveFetchSkinport($missing);
        foreach ($liveSnapshots as $name => $snap) {
            $dbRows[$name] = $snap;
            cachedFileSave($name, $source, $snap);
            try {
                if (isset($pdo)) {
                    $pdo->prepare(<<<'SQL'
                        MERGE roi_prices WITH (HOLDLOCK) AS tgt
                        USING (SELECT ? AS market_hash_name, ? AS source) AS src
                          ON tgt.market_hash_name = src.market_hash_name AND tgt.source = src.source
                        WHEN MATCHED THEN UPDATE SET
                            current_price = ?, sell_orders = ?, buy_orders = ?,
                            price_history = ?, updated_at = SYSUTCDATETIME()
                        WHEN NOT MATCHED THEN INSERT
                            (market_hash_name, source, current_price, sell_orders, buy_orders, price_history, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, SYSUTCDATETIME());
                    SQL)->execute([
                        $name, 'skinport',
                        $snap['current_price'], $snap['sell_orders'], $snap['buy_orders'], $snap['price_history'],
                        $name, 'skinport',
                        $snap['current_price'], $snap['sell_orders'], $snap['buy_orders'], $snap['price_history'],
                    ]);
                }
            } catch (Throwable) {}
        }
    }

    // 3b. Items still missing → live Steam priceoverview fetch (current price only)
    $missing = array_values(array_filter($names, static fn (string $n) => !isset($dbRows[$n])));
    if ($allowLiveRefresh && !$cacheOnly && $missing && $source === 'steam') {
        $liveSnapshots = cachedLiveFetchSteam($missing, $steamListingFallbackLimit, false, $steamFastMode);
        foreach ($liveSnapshots as $name => $snap) {
            if ($snap !== null && isset($snap['current_price']) && (float)$snap['current_price'] > 0) {
                $dbRows[$name] = $snap;
                cachedPersistSteamQuote($name, $snap, $pdo);
            }
        }
    }

    // 3c. Deals / fast Steam: if live overview was rate-limited, fill remaining
    //     gaps from the ROI catalog so the Steam column is not blank.
    //     Skip when skip_catalog_fallback — catalog seeds are weeks-old asks.
    if ($source === 'steam' && $steamFastMode && !$skipCatalogFallback) {
        $stillMissing = array_values(array_filter($names, static fn (string $n) => !isset($dbRows[$n])));
        if ($stillMissing) {
            foreach (cachedLoadSteamCatalogSnapshots($stillMissing) as $name => $snap) {
                $dbRows[$name] = $snap;
                cachedFileSave($name, $source, $snap);
            }
        }
    }

    // Build response records
    $allowLiveMarketIo = !$cacheOnly && !$explorerFast;
    if ($source === 'steam') {
        cachedEnrichMissingSteamListings($dbRows, $names, $allowLiveMarketIo ? $steamListingFallbackLimit : 0);
        // Contraband / zero-listing skins (e.g. M4A4 | Howl) have no Steam ask;
        // catalog seeds above €1800 are also dropped. Prefer Skinport so cards
        // still show a real market price (Factory New slug when catalog wear is FN).
        cachedApplySkinportFallbackForEmptySteam($dbRows, $names, $allowLiveMarketIo);
    }
    if ($source === 'skinport') {
        cachedSkinportOverlayQuantityFromIndex($dbRows, $names, $allowLiveMarketIo);
    }
    // Sticker slabs are often unlisted; reuse Sticker | … price (e.g. Howling Dawn).
    cachedApplyStickerSlabPriceFallback($dbRows, $names, $source, $allowLiveMarketIo);

    $records = [];
    foreach ($names as $name) {
        $row = $dbRows[$name] ?? null;
        $rowSource = $source;
        if ($source === 'steam' && is_array($row) && cachedIsSkinportFallbackSteamRow($row)) {
            $rowSource = 'skinport';
        }
        $records[] = cachedBuildRecord($name, $row, $rowSource, $range);
    }

    respondJson([
        'success'     => true,
        'source'      => $source,
        'range'       => $range,
        'range_label' => cachedRangeLabel($range),
        'items'       => $records,
        'cases'       => $records,
        'updated_at'  => gmdate(DATE_ATOM),
    ]);
} catch (Throwable $e) {
    respondJson(['success' => false, 'error' => $e->getMessage()], 500);
}
}
