<?php
declare(strict_types=1);

require_once __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/sync_steam_item_images.php';

const STEAM_MARKET_CATALOG_PATH = STEAM_IMAGE_CACHE_DIR . '/catalog.json';
const STEAM_MARKET_PAGE_SIZE = 10;
const STEAM_MARKET_PARALLEL_REQUESTS = 8;
const STEAM_MARKET_BATCH_PAUSE_MICROSECONDS = 120000;

function steamMarketCatalogSearchUrl(int $start, int $count = STEAM_MARKET_PAGE_SIZE): string
{
    return 'https://steamcommunity.com/market/search/render/?appid=730&norender=1&search_descriptions=0'
        . '&sort_column=name&sort_dir=asc'
        . '&count=' . max(1, $count)
        . '&start=' . max(0, $start);
}

function steamMarketCatalogNormalize(string $value): string
{
    return mb_strtolower(trim($value), 'UTF-8');
}

function steamMarketCatalogStripWear(string $marketHashName): string
{
    return preg_replace('/\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/', '', $marketHashName) ?? $marketHashName;
}

function steamMarketCatalogSplitWear(string $marketHashName): array
{
    if (preg_match('/^(.*)\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/', $marketHashName, $matches)) {
        return [
            'base_name' => trim((string)$matches[1]),
            'wear' => trim((string)$matches[2]),
        ];
    }

    return [
        'base_name' => $marketHashName,
        'wear' => '',
    ];
}

function steamMarketCatalogBuildImageUrl(array $result): string
{
    $asset = is_array($result['asset_description'] ?? null) ? $result['asset_description'] : [];
    $iconPath = trim((string)($asset['icon_url_large'] ?? $asset['icon_url'] ?? ''));
    return $iconPath !== '' ? steamImageBuildEconomyUrl($iconPath) : '';
}

function steamMarketCatalogCategoryMeta(string $marketHashName, string $type): array
{
    $name = steamMarketCatalogNormalize($marketHashName);
    $typeValue = steamMarketCatalogNormalize($type);

    $weaponTypeMatch = str_contains($typeValue, 'rifle')
        || str_contains($typeValue, 'pistol')
        || str_contains($typeValue, 'smg')
        || str_contains($typeValue, 'shotgun')
        || str_contains($typeValue, 'sniper')
        || str_contains($typeValue, 'machinegun')
        || str_contains($typeValue, 'equipment');

    if (str_starts_with($marketHashName, 'Sticker |') || str_contains($typeValue, 'sticker') || str_contains($name, 'sticker capsule') || str_contains($name, 'autograph capsule')) {
        return ['category' => 'stickers', 'label' => 'Stickers'];
    }

    if (str_starts_with($marketHashName, 'Sealed Graffiti |') || str_contains($typeValue, 'graffiti')) {
        return ['category' => 'graffiti', 'label' => 'Graffiti'];
    }

    if (str_starts_with($marketHashName, 'Patch |') || str_contains($typeValue, 'patch')) {
        return ['category' => 'patches', 'label' => 'Patches'];
    }

    if (str_starts_with($marketHashName, 'Music Kit |') || str_contains($typeValue, 'music kit')) {
        return ['category' => 'music', 'label' => 'Music Kits'];
    }

    if (str_contains($typeValue, 'agent')) {
        return ['category' => 'agents', 'label' => 'Agents'];
    }

    if (str_starts_with($marketHashName, '★ ') || str_contains($typeValue, 'knife')) {
        return ['category' => 'knives', 'label' => 'Knives'];
    }

    if (str_contains($typeValue, 'glove') || str_contains($name, 'gloves |')) {
        return ['category' => 'gloves', 'label' => 'Gloves'];
    }

    if (str_contains($typeValue, 'charm') || str_contains($name, ' charm')) {
        return ['category' => 'charms', 'label' => 'Charms'];
    }

    if (
        str_contains($typeValue, 'coin')
        || str_contains($typeValue, 'pin')
        || str_contains($typeValue, 'collectible')
        || str_contains($typeValue, 'stars for operation')
        || str_contains($name, 'star for operation')
        || str_contains($name, 'map coin')
    ) {
        return ['category' => 'collectibles', 'label' => 'Collectibles'];
    }

    if (str_contains($typeValue, 'tool') || str_contains($typeValue, 'key') || str_contains($typeValue, 'pass') || str_contains($name, 'name tag') || str_contains($name, 'storage unit')) {
        return ['category' => 'tools', 'label' => 'Tools'];
    }

    if (str_contains($typeValue, 'container') || str_contains($name, 'case') || str_contains($name, 'souvenir package') || str_contains($name, 'capsule')) {
        return ['category' => 'cases', 'label' => 'Cases'];
    }

    if ($weaponTypeMatch || str_contains($marketHashName, ' | ')) {
        return ['category' => 'skins', 'label' => 'Weapon Skins'];
    }

    return ['category' => 'other', 'label' => 'Other Items'];
}

function steamMarketCatalogInternalHref(string $marketHashName, string $image, string $type, string $category, string $nameColor): string
{
    if ($category !== 'skins') {
        return '';
    }

    $split = steamMarketCatalogSplitWear($marketHashName);
    $baseName = $split['base_name'];
    if (!str_contains($baseName, ' | ')) {
        return '';
    }

    $params = [
        'lookup_name' => $baseName,
        'display_name' => $baseName,
        'image' => $image,
        'market_url' => steamImageMarketUrl($marketHashName),
        'type' => $type,
        'color' => $nameColor,
    ];

    if ($split['wear'] !== '') {
        $params['selected_wear'] = $split['wear'];
    }

    return 'item_page.php?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
}

function steamMarketCatalogManifestIndexes(array $manifest): array
{
    $byName = [];
    $byResolved = [];
    $byBase = [];

    foreach ($manifest as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $marketHashName = trim((string)($entry['market_hash_name'] ?? ''));
        $resolvedName = trim((string)($entry['resolved_market_hash_name'] ?? ''));
        $category = trim((string)($entry['category'] ?? ''));

        if ($marketHashName !== '') {
            if (!isset($byName[$marketHashName]) || ($category !== 'inventory' && trim((string)($byName[$marketHashName]['category'] ?? '')) === 'inventory')) {
                $byName[$marketHashName] = $entry;
            }

            $baseKey = steamMarketCatalogStripWear($marketHashName);
            if (!isset($byBase[$baseKey]) || ($category !== 'inventory' && trim((string)($byBase[$baseKey]['category'] ?? '')) === 'inventory')) {
                $byBase[$baseKey] = $entry;
            }
        }

        if ($resolvedName !== '') {
            if (!isset($byResolved[$resolvedName]) || ($category !== 'inventory' && trim((string)($byResolved[$resolvedName]['category'] ?? '')) === 'inventory')) {
                $byResolved[$resolvedName] = $entry;
            }

            $resolvedBaseKey = steamMarketCatalogStripWear($resolvedName);
            if (!isset($byBase[$resolvedBaseKey]) || ($category !== 'inventory' && trim((string)($byBase[$resolvedBaseKey]['category'] ?? '')) === 'inventory')) {
                $byBase[$resolvedBaseKey] = $entry;
            }
        }
    }

    return [
        'by_name' => $byName,
        'by_resolved' => $byResolved,
        'by_base' => $byBase,
    ];
}

function steamMarketCatalogPickManifestMatch(array $manifestIndex, string $marketHashName, string $baseName, string $wear): ?array
{
    $exact = $manifestIndex['by_name'][$marketHashName] ?? null;
    $resolved = $manifestIndex['by_resolved'][$marketHashName] ?? null;
    $base = $wear !== '' ? ($manifestIndex['by_base'][$baseName] ?? null) : null;

    $exactCategory = trim((string)($exact['category'] ?? ''));
    if (is_array($exact) && $exactCategory !== '' && $exactCategory !== 'inventory') {
        return $exact;
    }

    $resolvedCategory = trim((string)($resolved['category'] ?? ''));
    if (is_array($resolved) && $resolvedCategory !== '' && $resolvedCategory !== 'inventory') {
        return $resolved;
    }

    $baseCategory = trim((string)($base['category'] ?? ''));
    if (is_array($base) && $baseCategory !== '' && $baseCategory !== 'inventory') {
        return $base;
    }

    if (is_array($exact)) {
        return $exact;
    }

    return null;
}

function steamMarketCatalogDownloadImage(string $marketHashName, string $imageUrl): ?string
{
    if ($imageUrl === '') {
        return null;
    }

    steamImageEnsureCacheDir();
    $outputPath = steamImageOutputPath($marketHashName);
    if (is_file($outputPath)) {
        return str_replace(__DIR__ . '/', '', $outputPath);
    }

    $download = steamImageFetchBinary($imageUrl);
    $extension = steamImageDetectExtension((string)($download['content_type'] ?? ''));
    if ($extension !== 'png') {
        return null;
    }

    file_put_contents($outputPath, (string)$download['body']);
    return str_replace(__DIR__ . '/', '', $outputPath);
}

function steamMarketCatalogBuildEntry(array $result, array $manifestIndex, bool $downloadImages): array
{
    $asset = is_array($result['asset_description'] ?? null) ? $result['asset_description'] : [];
    $marketHashName = trim((string)($asset['market_hash_name'] ?? $result['hash_name'] ?? ''));
    $type = trim((string)($asset['type'] ?? 'Counter-Strike Item'));
    $nameColor = strtoupper(trim((string)($asset['name_color'] ?? ''))) ?: 'B0C3D9';
    $marketUrl = steamImageMarketUrl($marketHashName);
    $steamImageUrl = steamMarketCatalogBuildImageUrl($result);
    $meta = steamMarketCatalogCategoryMeta($marketHashName, $type);
    $split = steamMarketCatalogSplitWear($marketHashName);

    $manifestMatch = steamMarketCatalogPickManifestMatch(
        $manifestIndex,
        $marketHashName,
        $split['base_name'],
        $split['wear']
    );

    if (is_array($manifestMatch) && !empty($manifestMatch['category']) && (string)$manifestMatch['category'] !== 'inventory') {
        $overrideCategory = (string)$manifestMatch['category'];
        $meta = match ($overrideCategory) {
            'skins' => ['category' => 'skins', 'label' => 'Weapon Skins'],
            'cases' => ['category' => 'cases', 'label' => 'Cases'],
            'stickers' => ['category' => 'stickers', 'label' => 'Stickers'],
            'knives' => ['category' => 'knives', 'label' => 'Knives'],
            'gloves' => ['category' => 'gloves', 'label' => 'Gloves'],
            'agents' => ['category' => 'agents', 'label' => 'Agents'],
            'patches' => ['category' => 'patches', 'label' => 'Patches'],
            'music' => ['category' => 'music', 'label' => 'Music Kits'],
            'graffiti' => ['category' => 'graffiti', 'label' => 'Graffiti'],
            'collectibles' => ['category' => 'collectibles', 'label' => 'Collectibles'],
            'charms' => ['category' => 'charms', 'label' => 'Charms'],
            'tools' => ['category' => 'tools', 'label' => 'Tools'],
            default => $meta,
        };
    }

    $projectImagePath = trim((string)($manifestMatch['project_image_path'] ?? ''));
    $localPath = trim((string)($manifestMatch['local_path'] ?? ''));

    if ($localPath === '' && $downloadImages) {
        $downloadedPath = steamMarketCatalogDownloadImage($marketHashName, $steamImageUrl);
        if (is_string($downloadedPath) && $downloadedPath !== '') {
            $localPath = $downloadedPath;
        }
    }

    $preferredImage = $localPath !== ''
        ? $localPath
        : ($projectImagePath !== '' ? $projectImagePath : $steamImageUrl);

    $internalHref = steamMarketCatalogInternalHref($marketHashName, $preferredImage, $type, $meta['category'], $nameColor);

    return [
        'market_hash_name' => $marketHashName,
        'market_url' => $marketUrl,
        'internal_href' => $internalHref,
        'image' => $preferredImage,
        'local_path' => $localPath,
        'project_image_path' => $projectImagePath,
        'steam_image_url' => $steamImageUrl,
        'category' => $meta['category'],
        'category_label' => $meta['label'],
        'type_note' => $type,
        'name_color' => $nameColor,
        'wear' => $split['wear'],
        'base_name' => $split['base_name'],
        'sell_price' => isset($result['sell_price']) ? round(((int)$result['sell_price']) / 100, 2) : null,
        'sell_price_text' => trim((string)($result['sell_price_text'] ?? '')),
        'sell_listings' => isset($result['sell_listings']) ? (int)$result['sell_listings'] : null,
    ];
}

function steamMarketCatalogLoadExisting(): array
{
    if (!is_file(STEAM_MARKET_CATALOG_PATH)) {
        return [];
    }

    $decoded = json_decode((string)file_get_contents(STEAM_MARKET_CATALOG_PATH), true);
    return is_array($decoded) ? $decoded : [];
}

function steamMarketCatalogFetchJsonPages(array $starts, int $count = STEAM_MARKET_PAGE_SIZE): array
{
    $multi = curl_multi_init();
    $handles = [];

    foreach ($starts as $start) {
        $url = steamMarketCatalogSearchUrl((int)$start, $count);
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0 Safari/537.36',
            CURLOPT_HTTPHEADER => [
                'Accept: application/json,text/plain,*/*',
                'Accept-Language: en-US,en;q=0.9',
            ],
        ]);

        curl_multi_add_handle($multi, $curl);
        $handles[(int)$curl] = [
            'start' => (int)$start,
            'handle' => $curl,
        ];
    }

    do {
        $status = curl_multi_exec($multi, $running);
        if ($running) {
            curl_multi_select($multi, 1.0);
        }
    } while ($running && $status === CURLM_OK);

    $responses = [];
    foreach ($handles as $entry) {
        $curl = $entry['handle'];
        $body = curl_multi_getcontent($curl);
        $error = curl_error($curl);
        $statusCode = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);

        curl_multi_remove_handle($multi, $curl);
        curl_close($curl);

        if ($body === false || $statusCode >= 400 || $error !== '') {
            $responses[$entry['start']] = steamMarketCatalogFetchSinglePage($entry['start'], $count, 2);
            continue;
        }

        $decoded = json_decode((string)$body, true);
        $responses[$entry['start']] = is_array($decoded) ? $decoded : null;
    }

    curl_multi_close($multi);
    ksort($responses);

    return $responses;
}

function steamMarketCatalogFetchSinglePage(int $start, int $count = STEAM_MARKET_PAGE_SIZE, int $retries = 2): ?array
{
    for ($attempt = 0; $attempt <= $retries; $attempt += 1) {
        $curl = curl_init(steamMarketCatalogSearchUrl($start, $count));
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0 Safari/537.36',
            CURLOPT_HTTPHEADER => [
                'Accept: application/json,text/plain,*/*',
                'Accept-Language: en-US,en;q=0.9',
            ],
        ]);

        $body = curl_exec($curl);
        $statusCode = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);

        if ($body !== false && $statusCode < 400 && $error === '') {
            $decoded = json_decode((string)$body, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        if ($attempt < $retries) {
            usleep(($attempt + 1) * 1100000);
        }
    }

    return null;
}

function steamMarketCatalogSync(?int $pageLimit = null, bool $downloadImages = false): array
{
    steamImageEnsureCacheDir();
    $manifestIndex = steamMarketCatalogManifestIndexes(steamImageManifestLoad());
    $existingCatalog = steamMarketCatalogLoadExisting();
    $existingItems = is_array($existingCatalog['items'] ?? null) ? $existingCatalog['items'] : [];
    $existingPagesSynced = max(0, (int)($existingCatalog['pages_synced'] ?? 0));
    $existingTotalCount = max(0, (int)($existingCatalog['total_count'] ?? 0));

    $firstPage = steamMarketCatalogFetchSinglePage(0, STEAM_MARKET_PAGE_SIZE, 3);
    $entriesByName = [];

    if (!is_array($firstPage)) {
        if ($existingTotalCount <= 0 || $existingItems === []) {
            throw new RuntimeException('Steam market catalog fetch failed for the first page.');
        }

        foreach ($existingItems as $existingEntry) {
            if (!is_array($existingEntry)) {
                continue;
            }

            $marketHashName = trim((string)($existingEntry['market_hash_name'] ?? ''));
            if ($marketHashName === '') {
                continue;
            }

            $entriesByName[$marketHashName] = $existingEntry;
        }

        $totalCount = $existingTotalCount;
        $totalPages = (int)ceil($totalCount / STEAM_MARKET_PAGE_SIZE);
        $pagesToSync = $pageLimit !== null ? min($totalPages, max(1, $pageLimit)) : $totalPages;
        $startPage = min($existingPagesSynced, max(0, $pagesToSync));
    } else {
        $totalCount = (int)($firstPage['total_count'] ?? 0);
        $totalPages = $totalCount > 0 ? (int)ceil($totalCount / STEAM_MARKET_PAGE_SIZE) : 0;
        $pagesToSync = $pageLimit !== null ? min($totalPages, max(1, $pageLimit)) : $totalPages;
        $startPage = 1;
    }

    $processPage = static function (?array $payload) use (&$entriesByName, $manifestIndex, $downloadImages): void {
        if (!is_array($payload)) {
            return;
        }

        $results = is_array($payload['results'] ?? null) ? $payload['results'] : [];
        foreach ($results as $result) {
            if (!is_array($result)) {
                continue;
            }

            $entry = steamMarketCatalogBuildEntry($result, $manifestIndex, $downloadImages);
            if ($entry['market_hash_name'] === '') {
                continue;
            }

            $entriesByName[$entry['market_hash_name']] = $entry;
        }
    };

    if (is_array($firstPage)) {
        $processPage($firstPage);
    }

    $starts = [];
    for ($page = $startPage; $page < $pagesToSync; $page += 1) {
        $starts[] = $page * STEAM_MARKET_PAGE_SIZE;
    }

    $chunks = array_chunk($starts, STEAM_MARKET_PARALLEL_REQUESTS);

    foreach ($chunks as $chunkIndex => $chunk) {
        $responses = steamMarketCatalogFetchJsonPages($chunk, STEAM_MARKET_PAGE_SIZE);
        foreach ($responses as $payload) {
            $processPage($payload);
        }

        if ($chunkIndex < count($chunks) - 1) {
            usleep(STEAM_MARKET_BATCH_PAUSE_MICROSECONDS);
        }
    }

    ksort($entriesByName, SORT_NATURAL | SORT_FLAG_CASE);
    $items = array_values($entriesByName);
    $payload = [
        'updated_at' => gmdate('c'),
        'source' => 'steam-market-search',
        'total_count' => $totalCount,
        'pages_synced' => $pagesToSync,
        'download_images' => $downloadImages,
        'saved_items' => count($items),
        'items' => $items,
    ];

    file_put_contents(
        STEAM_MARKET_CATALOG_PATH,
        json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );

    return [
        'success' => true,
        'updated_at' => $payload['updated_at'],
        'total_count' => $totalCount,
        'pages_synced' => $pagesToSync,
        'saved_items' => count($items),
        'download_images' => $downloadImages,
        'catalog_path' => str_replace(__DIR__ . '/', '', STEAM_MARKET_CATALOG_PATH),
    ];
}

function steamMarketCatalogMain(): void
{
    $pageLimitRaw = steamImageCliArg('page-limit');
    $pageLimit = $pageLimitRaw !== null && $pageLimitRaw !== '' ? max(1, (int)$pageLimitRaw) : null;
    $downloadImages = steamImageFlag('download-images');
    $result = steamMarketCatalogSync($pageLimit, $downloadImages);

    if (PHP_SAPI === 'cli') {
        echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;
        return;
    }

    respondJson($result);
}

$directCliEntry = PHP_SAPI === 'cli'
    && isset($_SERVER['SCRIPT_FILENAME'])
    && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__;
$directWebEntry = PHP_SAPI !== 'cli'
    && realpath(__FILE__) === realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? ''));

if ($directCliEntry || $directWebEntry) {
    try {
        steamMarketCatalogMain();
    } catch (Throwable $exception) {
        if (PHP_SAPI === 'cli') {
            fwrite(STDERR, $exception->getMessage() . PHP_EOL);
            exit(1);
        }

        respondJson([
            'success' => false,
            'error' => $exception->getMessage(),
        ], 500);
    }
}
