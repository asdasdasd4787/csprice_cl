<?php
declare(strict_types=1);

require_once __DIR__ . '/app_bootstrap.php';

const STEAM_IMAGE_CACHE_DIR = __DIR__ . '/assets/steam-market-cache';
const STEAM_IMAGE_MANIFEST = STEAM_IMAGE_CACHE_DIR . '/manifest.json';

function steamImageCliArg(string $name, ?string $default = null): ?string
{
    global $argv;

    if (!isset($argv) || !is_array($argv)) {
        return $default;
    }

    foreach ($argv as $argument) {
        if (!str_starts_with((string)$argument, '--' . $name . '=')) {
            continue;
        }

        return substr((string)$argument, strlen($name) + 3);
    }

    return $default;
}

function steamImageFlag(string $name): bool
{
    global $argv;

    if (!isset($argv) || !is_array($argv)) {
        return false;
    }

    return in_array('--' . $name, array_map('strval', $argv), true);
}

function steamImageSlug(string $value): string
{
    $value = preg_replace('/[^\pL\pN]+/u', '-', trim($value)) ?? '';
    $value = trim((string)$value, '-');
    $value = strtolower($value);

    return $value !== '' ? $value : 'item';
}

function steamImageOutputPath(string $marketHashName): string
{
    $slug = steamImageSlug($marketHashName);
    $hash = substr(sha1($marketHashName), 0, 10);
    return STEAM_IMAGE_CACHE_DIR . '/' . $slug . '--' . $hash . '.png';
}

function steamImageMarketUrl(string $marketHashName): string
{
    return 'https://steamcommunity.com/market/listings/730/' . rawurlencode($marketHashName);
}

function steamImageFetchText(string $url, int $timeoutSeconds = 25): string
{
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => $timeoutSeconds,
        CURLOPT_CONNECTTIMEOUT => min(10, $timeoutSeconds),
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0 Safari/537.36',
        CURLOPT_HTTPHEADER => [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language: en-US,en;q=0.9',
        ],
    ]);

    $body = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);

    if ($body === false) {
        throw new RuntimeException('Steam page request failed: ' . $error);
    }

    if ($status >= 400) {
        throw new RuntimeException('Steam page request returned HTTP ' . $status . '.');
    }

    return (string)$body;
}

function steamImageFetchBinary(string $url, int $timeoutSeconds = 25): array
{
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => $timeoutSeconds,
        CURLOPT_CONNECTTIMEOUT => min(10, $timeoutSeconds),
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0 Safari/537.36',
        CURLOPT_HTTPHEADER => [
            'Accept: image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'Accept-Language: en-US,en;q=0.9',
        ],
    ]);

    $body = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $contentType = (string)curl_getinfo($curl, CURLINFO_CONTENT_TYPE);
    $error = curl_error($curl);
    curl_close($curl);

    if ($body === false) {
        throw new RuntimeException('Steam image request failed: ' . $error);
    }

    if ($status >= 400) {
        throw new RuntimeException('Steam image request returned HTTP ' . $status . '.');
    }

    return [
        'body' => (string)$body,
        'content_type' => $contentType,
    ];
}

function steamImageFetchJson(string $url, int $timeoutSeconds = 25): array
{
    $body = steamImageFetchText($url, $timeoutSeconds);
    $body = preg_replace('/^\xEF\xBB\xBF/', '', $body) ?? $body;
    $decoded = json_decode((string)$body, true);

    if (!is_array($decoded)) {
        throw new RuntimeException('Steam JSON response was not valid.');
    }

    return $decoded;
}

function steamImageExtractUrl(string $html): ?string
{
    if (preg_match('/<meta property="og:image" content="([^"]+)"/i', $html, $matches)) {
        return html_entity_decode($matches[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    if (preg_match('#https://community\.steamstatic\.com/economy/image/[A-Za-z0-9_\-+/=]+#', $html, $matches)) {
        return $matches[0];
    }

    return null;
}

function steamImageBaseMarketName(string $marketHashName): string
{
    return preg_replace('/\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/', '', $marketHashName) ?? $marketHashName;
}

function steamImageWearRank(string $marketHashName): int
{
    return match (true) {
        str_ends_with($marketHashName, '(Factory New)') => 1,
        str_ends_with($marketHashName, '(Minimal Wear)') => 2,
        str_ends_with($marketHashName, '(Field-Tested)') => 3,
        str_ends_with($marketHashName, '(Well-Worn)') => 4,
        str_ends_with($marketHashName, '(Battle-Scarred)') => 5,
        default => 99,
    };
}

function steamImageSearchUrl(string $query): string
{
    return 'https://steamcommunity.com/market/search/render/?appid=730&norender=1&count=20&search_descriptions=0&sort_column=name&sort_dir=asc&query='
        . rawurlencode($query);
}

function steamImageBuildEconomyUrl(string $iconPath): string
{
    return 'https://community.steamstatic.com/economy/image/' . ltrim($iconPath, '/');
}

function steamImageResolveFromSearch(string $query): ?array
{
    $payload = steamImageFetchJson(steamImageSearchUrl($query));
    $results = is_array($payload['results'] ?? null) ? $payload['results'] : [];

    if ($results === []) {
        return null;
    }

    $queryBase = steamImageBaseMarketName($query);
    usort($results, static function (array $left, array $right) use ($query, $queryBase): int {
        $leftHash = trim((string)($left['hash_name'] ?? ''));
        $rightHash = trim((string)($right['hash_name'] ?? ''));
        $leftBase = steamImageBaseMarketName($leftHash);
        $rightBase = steamImageBaseMarketName($rightHash);

        $leftExact = $leftHash === $query ? 0 : 1;
        $rightExact = $rightHash === $query ? 0 : 1;
        if ($leftExact !== $rightExact) {
            return $leftExact <=> $rightExact;
        }

        $leftBaseMatch = $leftBase === $queryBase ? 0 : 1;
        $rightBaseMatch = $rightBase === $queryBase ? 0 : 1;
        if ($leftBaseMatch !== $rightBaseMatch) {
            return $leftBaseMatch <=> $rightBaseMatch;
        }

        $leftWear = steamImageWearRank($leftHash);
        $rightWear = steamImageWearRank($rightHash);
        if ($leftWear !== $rightWear) {
            return $leftWear <=> $rightWear;
        }

        return $leftHash <=> $rightHash;
    });

    $best = $results[0];
    $asset = is_array($best['asset_description'] ?? null) ? $best['asset_description'] : [];
    $iconPath = trim((string)($asset['icon_url_large'] ?? $asset['icon_url'] ?? ''));

    return [
        'resolved_market_hash_name' => trim((string)($best['hash_name'] ?? $query)),
        'image_url' => $iconPath !== '' ? steamImageBuildEconomyUrl($iconPath) : '',
        'result' => $best,
    ];
}

function steamImageEnsureCacheDir(): void
{
    if (is_dir(STEAM_IMAGE_CACHE_DIR)) {
        return;
    }

    if (!mkdir(STEAM_IMAGE_CACHE_DIR, 0777, true) && !is_dir(STEAM_IMAGE_CACHE_DIR)) {
        throw new RuntimeException('Unable to create Steam image cache directory.');
    }
}

function steamImageManifestLoad(): array
{
    if (!is_file(STEAM_IMAGE_MANIFEST)) {
        return [];
    }

    $decoded = json_decode((string)file_get_contents(STEAM_IMAGE_MANIFEST), true);
    return is_array($decoded) ? $decoded : [];
}

function steamImageManifestSave(array $manifest): void
{
    steamImageEnsureCacheDir();
    file_put_contents(
        STEAM_IMAGE_MANIFEST,
        json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );
}

function steamImageSectionBlock(string $content, string $constName): string
{
    if (preg_match('/const\s+' . preg_quote($constName, '/') . '\s*=\s*\[(.*?)\n\s*\];/s', $content, $matches)) {
        return (string)$matches[1];
    }

    return '';
}

function steamImageCollectSharedDataPairs(string $block, string $category): array
{
    $records = [];

    if ($block === '') {
        return $records;
    }

    preg_match_all('/\{\s*img:\s*"([^"]+)",\s*name:\s*"([^"]+)"/', $block, $matches, PREG_SET_ORDER);
    foreach ($matches as $match) {
        $records[] = [
            'market_hash_name' => trim((string)$match[2]),
            'project_image_path' => trim((string)$match[1]),
            'category' => $category,
            'sources' => ['project'],
        ];
    }

    return $records;
}

function steamImageCollectManualSkinPairs(string $content): array
{
    $records = [];
    $block = steamImageSectionBlock($content, 'MANUAL_SKIN_ITEMS');
    if ($block === '') {
        return $records;
    }

    preg_match_all('/\{\s*market_hash_name:\s*"([^"]+)",\s*image:\s*"([^"]+)"/', $block, $matches, PREG_SET_ORDER);
    foreach ($matches as $match) {
        $records[] = [
            'market_hash_name' => trim((string)$match[1]),
            'project_image_path' => trim((string)$match[2]),
            'category' => 'skins',
            'sources' => ['project'],
        ];
    }

    return $records;
}

function steamImageCollectProjectCatalog(): array
{
    $sharedData = (string)file_get_contents(__DIR__ . '/react/shared-data.js');
    $roiPage = (string)file_get_contents(__DIR__ . '/react/roi-page.jsx');

    return array_merge(
        steamImageCollectSharedDataPairs(steamImageSectionBlock($sharedData, 'navCases'), 'cases'),
        steamImageCollectSharedDataPairs(steamImageSectionBlock($sharedData, 'navStickers'), 'stickers'),
        steamImageCollectSharedDataPairs(steamImageSectionBlock($sharedData, 'navOtherSections'), 'other'),
        steamImageCollectManualSkinPairs($roiPage)
    );
}

function steamImageCollectInventoryCatalog(): array
{
    $records = [];

    try {
        $connection = dbPdoConnection('db');
        $statement = $connection->query(
            'SELECT DISTINCT market_hash_name
             FROM steam_inventory_items
             WHERE market_hash_name IS NOT NULL AND market_hash_name <> ""
             ORDER BY market_hash_name ASC'
        );
    } catch (Throwable) {
        return $records;
    }

    foreach ($statement->fetchAll() as $row) {
        if (!is_array($row)) {
            continue;
        }

        $marketHashName = trim((string)($row['market_hash_name'] ?? ''));
        if ($marketHashName === '') {
            continue;
        }

        $records[] = [
            'market_hash_name' => $marketHashName,
            'project_image_path' => '',
            'category' => 'inventory',
            'sources' => ['inventory'],
        ];
    }

    return $records;
}

function steamImageCollectRoiCatalog(): array
{
    $path = STEAM_IMAGE_CACHE_DIR . '/roi_catalog.json';
    if (!is_file($path)) {
        return [];
    }

    $decoded = json_decode((string)file_get_contents($path), true);
    $items = is_array($decoded['items'] ?? null) ? $decoded['items'] : [];
    $records = [];

    foreach ($items as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $marketHashName = trim((string)($entry['market_hash_name'] ?? ''));
        if ($marketHashName === '') {
            continue;
        }

        $records[] = [
            'market_hash_name' => $marketHashName,
            'project_image_path' => '',
            'category' => trim((string)($entry['category'] ?? 'other')),
            'sources' => ['roi'],
        ];
    }

    return $records;
}

function steamImageMergeCatalog(array ...$groups): array
{
    $merged = [];

    foreach ($groups as $group) {
        foreach ($group as $entry) {
            $marketHashName = trim((string)($entry['market_hash_name'] ?? ''));
            if ($marketHashName === '') {
                continue;
            }

            if (!isset($merged[$marketHashName])) {
                $merged[$marketHashName] = [
                    'market_hash_name' => $marketHashName,
                    'project_image_path' => trim((string)($entry['project_image_path'] ?? '')),
                    'category' => trim((string)($entry['category'] ?? 'other')),
                    'sources' => array_values(array_unique(array_map('strval', (array)($entry['sources'] ?? [])))),
                ];
                continue;
            }

            if ($merged[$marketHashName]['project_image_path'] === '' && !empty($entry['project_image_path'])) {
                $merged[$marketHashName]['project_image_path'] = trim((string)$entry['project_image_path']);
            }

            $merged[$marketHashName]['sources'] = array_values(array_unique(array_merge(
                $merged[$marketHashName]['sources'],
                array_map('strval', (array)($entry['sources'] ?? []))
            )));
        }
    }

    ksort($merged, SORT_NATURAL | SORT_FLAG_CASE);
    return array_values($merged);
}

function steamImageDetectExtension(string $contentType): string
{
    $normalized = strtolower(trim(strtok($contentType, ';') ?: ''));

    return match ($normalized) {
        'image/jpeg', 'image/jpg' => 'jpg',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
        default => 'png',
    };
}

function steamImageDownloadCatalog(array $catalog, bool $overwrite = false, ?int $limit = null): array
{
    steamImageEnsureCacheDir();
    $manifest = steamImageManifestLoad();
    $manifestByName = [];

    foreach ($manifest as $entry) {
        if (!is_array($entry) || empty($entry['market_hash_name'])) {
            continue;
        }

        $manifestByName[(string)$entry['market_hash_name']] = $entry;
    }

    $stats = [
        'processed' => 0,
        'downloaded' => 0,
        'skipped' => 0,
        'failed' => 0,
        'items' => [],
    ];

    $slice = $limit !== null ? array_slice($catalog, 0, max(0, $limit)) : $catalog;

    foreach ($slice as $entry) {
        $stats['processed']++;
        $marketHashName = (string)$entry['market_hash_name'];
        $outputPath = steamImageOutputPath($marketHashName);
        $relativeOutput = str_replace(__DIR__ . '/', '', $outputPath);

        if (!$overwrite && is_file($outputPath)) {
            $stats['skipped']++;
            $existing = $manifestByName[$marketHashName] ?? [];
            $stats['items'][] = [
                'market_hash_name' => $marketHashName,
                'status' => 'skipped',
                'local_path' => $relativeOutput,
                'steam_image_url' => (string)($existing['steam_image_url'] ?? ''),
            ];
            continue;
        }

        try {
            $resolvedMarketHashName = $marketHashName;
            $html = steamImageFetchText(steamImageMarketUrl($resolvedMarketHashName));
            $imageUrl = steamImageExtractUrl($html);

            if ($imageUrl === null || $imageUrl === '') {
                $resolved = steamImageResolveFromSearch($marketHashName);
                if (!is_array($resolved)) {
                    throw new RuntimeException('Steam market page did not expose an image URL.');
                }

                $resolvedMarketHashName = trim((string)($resolved['resolved_market_hash_name'] ?? $marketHashName));
                $html = steamImageFetchText(steamImageMarketUrl($resolvedMarketHashName));
                $imageUrl = steamImageExtractUrl($html);

                if (($imageUrl === null || $imageUrl === '') && !empty($resolved['image_url'])) {
                    $imageUrl = (string)$resolved['image_url'];
                }
            }

            if ($imageUrl === null || $imageUrl === '') {
                throw new RuntimeException('Steam market page did not expose an image URL.');
            }

            $download = steamImageFetchBinary($imageUrl);
            $extension = steamImageDetectExtension((string)$download['content_type']);

            if ($extension !== 'png') {
                throw new RuntimeException(
                    'Steam returned "' . $extension . '" bytes, but this environment cannot convert images to PNG/WebP safely.'
                );
            }

            file_put_contents($outputPath, (string)$download['body']);

            $manifestByName[$marketHashName] = [
                'market_hash_name' => $marketHashName,
                'resolved_market_hash_name' => $resolvedMarketHashName,
                'local_path' => $relativeOutput,
                'steam_market_url' => steamImageMarketUrl($marketHashName),
                'steam_image_url' => $imageUrl,
                'project_image_path' => (string)($entry['project_image_path'] ?? ''),
                'category' => (string)($entry['category'] ?? 'other'),
                'sources' => array_values(array_unique(array_map('strval', (array)($entry['sources'] ?? [])))),
                'downloaded_at' => gmdate('c'),
            ];

            $stats['downloaded']++;
            $stats['items'][] = [
                'market_hash_name' => $marketHashName,
                'resolved_market_hash_name' => $resolvedMarketHashName,
                'status' => 'downloaded',
                'local_path' => $relativeOutput,
                'steam_image_url' => $imageUrl,
            ];
        } catch (Throwable $exception) {
            $stats['failed']++;
            $stats['items'][] = [
                'market_hash_name' => $marketHashName,
                'status' => 'failed',
                'error' => $exception->getMessage(),
            ];
        }
    }

    ksort($manifestByName, SORT_NATURAL | SORT_FLAG_CASE);
    steamImageManifestSave(array_values($manifestByName));

    return $stats;
}

function steamImageMain(): void
{
    $source = strtolower((string)steamImageCliArg('source', PHP_SAPI === 'cli' ? 'all' : 'project'));
    $limitRaw = steamImageCliArg('limit');
    $limit = $limitRaw !== null && $limitRaw !== '' ? max(0, (int)$limitRaw) : null;
    $overwrite = steamImageFlag('overwrite');

    $groups = [];
    if ($source === 'project' || $source === 'all') {
        $groups[] = steamImageCollectProjectCatalog();
    }

    if ($source === 'inventory' || $source === 'all') {
        $groups[] = steamImageCollectInventoryCatalog();
    }

    if ($source === 'roi' || $source === 'all') {
        $groups[] = steamImageCollectRoiCatalog();
    }

    if ($groups === []) {
        throw new RuntimeException('Unsupported source. Use --source=project, --source=inventory, --source=roi, or --source=all.');
    }

    $catalog = steamImageMergeCatalog(...$groups);
    $stats = steamImageDownloadCatalog($catalog, $overwrite, $limit);
    $stats['catalog_size'] = count($catalog);
    $stats['source'] = $source;
    $stats['manifest'] = str_replace(__DIR__ . '/', '', STEAM_IMAGE_MANIFEST);

    if (PHP_SAPI === 'cli') {
        echo json_encode($stats, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;
        return;
    }

    respondJson($stats);
}

$directCliEntry = PHP_SAPI === 'cli'
    && isset($_SERVER['SCRIPT_FILENAME'])
    && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__;
$directWebEntry = PHP_SAPI !== 'cli'
    && realpath(__FILE__) === realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? ''));

if ($directCliEntry || $directWebEntry) {
    try {
        steamImageMain();
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
