<?php
declare(strict_types=1);

require_once __DIR__ . '/dmarket_helpers.php';

function inspectLinkCacheFile(string $cacheKey): string
{
    $safe = preg_replace('/[^a-zA-Z0-9_-]+/', '_', $cacheKey) ?: 'default';
    return rtrim(sys_get_temp_dir(), '\\/') . DIRECTORY_SEPARATOR . 'csgo_price_tracker_inspect_links_v15_' . $safe . '.json';
}

function loadInspectLinkCache(string $cacheKey, int $ttlSeconds = 900): ?array
{
    $path = inspectLinkCacheFile($cacheKey);
    if (!is_file($path)) {
        return null;
    }

    $modifiedAt = @filemtime($path);
    if ($modifiedAt === false || $modifiedAt < time() - $ttlSeconds) {
        return null;
    }

    $payload = json_decode((string)@file_get_contents($path), true);
    return is_array($payload) ? $payload : null;
}

function saveInspectLinkCache(string $cacheKey, array $payload): void
{
    @file_put_contents(inspectLinkCacheFile($cacheKey), json_encode($payload));
}

function supportedInspectWears(): array
{
    return ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
}

function looksLikePlayerAgentName(string $baseName): bool
{
    $name = trim($baseName);
    if ($name === '') {
        return false;
    }
    if (preg_match('/\bAgent\b/i', $name)) {
        return true;
    }
    if (!str_contains($name, '|')) {
        return false;
    }
    if (preg_match('/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i', $name)) {
        return false;
    }
    if (preg_match('/^(?:★|StatTrak|Souvenir)/u', $name)) {
        return false;
    }

    $parts = array_map('trim', explode('|', $name, 2));
    $left = (string)($parts[0] ?? '');
    $right = (string)($parts[1] ?? '');
    if ($left === '' || $right === '') {
        return false;
    }

    // Person-style agent titles: quotes, military ranks, or multi-word character names.
    if (preg_match('/[\'\"]/', $left)) {
        return true;
    }
    if (preg_match('/\b(Cmdr\.|Lt\.|Sgt\.|Col\.|Capt\.|Officer|Soldier|Specialist|Operator|Primeiro|Sous-Lieutenant|Chem-Haz|Ground Rebel|Osiris|Number K|Sir Bloody|The Doctor|Dragomir|Maximus|Getaway Sally|Safe Conduct|Bloody Darryl)\b/i', $left)) {
        return true;
    }
    if (str_word_count($left) >= 3) {
        return true;
    }

    return (bool)preg_match(
        '/\b(SEAL|FBI|SAS|GIGN|SWAT|Phoenix|Elite Crew|Sabre|KSK|GSG|Professionals|Anarchist|Separatist|Gendarmerie|BOPE|Guerrilla|Tactical|Frogman|Jungle Rebel|D Squadron|NZSAS|Brazilian|Portuguese|Swedish|French|Iranian|Balkan|Pirate)\b/i',
        $right
    );
}

function itemSupportsWearVariants(string $baseName): bool
{
    if (preg_match('/\b(Patch|Music Kit|Graffiti|Pin|Sticker|Case|Capsule|Sealed Graffiti|Charm|Collectible)\b/i', $baseName)) {
        return false;
    }

    // Player agents are "Name | Team" without a weapon-style wear listing.
    if (looksLikePlayerAgentName($baseName)) {
        return false;
    }

    if (str_starts_with($baseName, '★')) {
        return true;
    }

    return (bool)preg_match('/\|/', $baseName);
}

function buildSteamMarketListingUrl(string $baseItemName, string $wear): string
{
    if ($wear === '' || $wear === 'Standard') {
        return buildSteamMarketGroupUrl($baseItemName);
    }

    return sprintf(
        'https://steamcommunity.com/market/listings/730/%s?l=english',
        rawurlencode(sprintf('%s (%s)', $baseItemName, $wear))
    );
}

function buildSteamMarketGroupUrl(string $baseItemName): string
{
    return sprintf(
        'https://steamcommunity.com/market/listings/730/%s?l=english',
        rawurlencode($baseItemName)
    );
}

function cs2InspectSteamContextId(): string
{
    return '76561202255233023';
}

function normalizeInspectUrl(string $url): string
{
    $value = trim($url);
    if ($value === '') {
        return '';
    }

    if (str_starts_with($value, 'csgo://')) {
        $value = 'steam' . substr($value, 4);
    }

    $value = str_replace('steam://run/730//', 'steam://run/730/', $value);

    $contextId = cs2InspectSteamContextId();
    if (preg_match('#^steam://run/730/(?!' . preg_quote($contextId, '#') . '/)#i', $value) === 1) {
        $value = preg_replace(
            '#^steam://run/730/#i',
            'steam://run/730/' . $contextId . '/',
            $value,
            1
        ) ?? $value;
    }

    return $value;
}

function buildInspectLinkEntry(string $wear, ?string $inspectUrl, string $marketUrl, string $groupUrl, string $source = ''): array
{
    $normalized = normalizeInspectUrl((string)$inspectUrl);

    return [
        'wear' => $wear,
        'market_url' => $marketUrl,
        'steam_group_url' => $groupUrl,
        'available_on_steam' => $normalized !== '',
        'listing_id' => null,
        'asset_id' => null,
        'inspect_code' => null,
        'inspect_url' => $normalized !== '' ? $normalized : null,
        'source' => $source !== '' ? $source : null,
    ];
}

function fetchDmarketInspectLink(string $marketHashName): ?string
{
    $config = appConfig()['dmarket'] ?? [];
    $baseUrl = rtrim((string)($config['base_url'] ?? 'https://api.dmarket.com'), '/');
    $timeout = max(5, (int)($config['timeout_seconds'] ?? 20));
    $gameId = trim((string)($config['game_id'] ?? 'a8db')) ?: 'a8db';

    $titles = [$marketHashName];
    if (function_exists('dmarketTitleAliases')) {
        $titles = dmarketTitleAliases($marketHashName);
    } else {
        $titles[] = str_ireplace('Holo-Foil', 'Holo/Foil', $marketHashName);
        $titles[] = str_ireplace('Holo/Foil', 'Holo-Foil', $marketHashName);
        $titles = array_values(array_unique(array_filter(array_map('trim', $titles))));
    }

    foreach ($titles as $title) {
        $query = [
            'gameId' => $gameId,
            'title' => $title,
            'limit' => '8',
            'currency' => 'USD',
            'orderBy' => 'price',
            'orderDir' => 'asc',
        ];
        $queryString = '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
        $path = '/marketplace-api/v2/offers' . $queryString;

        try {
            if (function_exists('dmarketSignedGet')) {
                $response = dmarketSignedGet('/marketplace-api/v2/offers', $query, $config, $timeout);
            } else {
                $headers = [
                    'Accept: application/json',
                    'User-Agent: CS2MarketTracker/1.0',
                ];
                $publicKey = trim((string)($config['public_key'] ?? ''));
                if ($publicKey !== '') {
                    $headers[] = 'X-Api-Key: ' . $publicKey;
                }
                $response = httpJsonRequest($baseUrl . $path, $headers, $timeout);
            }
        } catch (Throwable) {
            continue;
        }

        if ((int)($response['status'] ?? 500) >= 400) {
            continue;
        }

        $items = is_array($response['json']['items'] ?? null) ? $response['json']['items'] : [];
        foreach ($items as $row) {
            if (!is_array($row)) {
                continue;
            }
            $rowTitle = trim((string)($row['attributes']['title'] ?? $row['title'] ?? ''));
            if ($rowTitle !== '' && strcasecmp($rowTitle, $title) !== 0 && strcasecmp($rowTitle, $marketHashName) !== 0) {
                continue;
            }
            $inspect = normalizeInspectUrl((string)(
                $row['attributes']['inspectInGame']
                ?? $row['attributes']['cs2Attributes']['inspectInGame']
                ?? $row['extra']['inspectInGame']
                ?? $row['inspectInGame']
                ?? ''
            ));
            if ($inspect !== '') {
                return $inspect;
            }
        }
    }

    return null;
}

function fetchCsfloatInspectLink(string $marketHashName): ?string
{
    $apiKey = trim((string)(appConfig()['csfloat']['api_key'] ?? ''));
    if ($apiKey === '') {
        return null;
    }

    $config = appConfig()['csfloat'] ?? [];
    $isContainer = (bool)preg_match(
        '/\b(case|capsule|package|parcel|pack|box|collection|souvenir package)\b/i',
        $marketHashName
    );
    // category 1 = normal weapon skins; containers need 0 (any) or the listing is missed.
    $category = $isContainer
        ? 0
        : (int)($config['category'] ?? 1);

    $query = http_build_query([
        'market_hash_name' => $marketHashName,
        'limit' => max(1, min(10, (int)($config['limit'] ?? 10))),
        'sort_by' => (string)($config['sort_by'] ?? 'lowest_price'),
        'type' => (string)($config['listing_type'] ?? 'buy_now'),
        'category' => $category,
    ], '', '&', PHP_QUERY_RFC3986);
    $url = rtrim((string)($config['base_url'] ?? 'https://csfloat.com'), '/') . '/api/v1/listings?' . $query;

    try {
        $response = httpJsonRequest($url, [
            'Accept: application/json',
            'Authorization: ' . $apiKey,
            'User-Agent: CS2MarketTracker/1.0',
        ], max(5, (int)($config['timeout_seconds'] ?? 20)));
    } catch (Throwable) {
        return null;
    }

    if ((int)($response['status'] ?? 500) >= 400) {
        return null;
    }

    $json = $response['json'] ?? [];
    $listings = [];
    if (is_array($json['data'] ?? null)) {
        $listings = $json['data'];
    } elseif (is_array($json)) {
        $listings = array_values(array_filter($json, static fn ($row): bool => is_array($row)));
    }

    foreach ($listings as $listing) {
        if (!is_array($listing)) {
            continue;
        }
        $item = is_array($listing['item'] ?? null) ? $listing['item'] : [];
        $inspect = normalizeInspectUrl((string)($item['inspect_link'] ?? ''));
        if ($inspect !== '') {
            return $inspect;
        }
    }

    return null;
}

function fetchWhiteMarketInspectLink(string $marketHashName): ?string
{
    $config = appConfig()['white_market'] ?? [];
    $exportUrl = trim((string)($config['export_url'] ?? 'https://export.white.market/v1/prices/730.json'));
    $timeout = max(5, (int)($config['timeout_seconds'] ?? 20));
    $cacheFile = __DIR__ . '/assets/white-market-cache/prices_730.json';
    $cacheDir = dirname($cacheFile);
    if (!is_dir($cacheDir)) {
        mkdir($cacheDir, 0755, true);
    }

    $payload = null;
    $ttl = max(60, (int)($config['cache_ttl_seconds'] ?? 600));
    if (is_file($cacheFile) && (time() - (int)filemtime($cacheFile)) < $ttl) {
        $payload = json_decode((string)file_get_contents($cacheFile), true);
    }

    if (!is_array($payload)) {
        $ch = curl_init($exportUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => min(6, $timeout),
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
            CURLOPT_USERAGENT => 'CS2MarketTracker/1.0',
        ]);
        $body = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if ($body !== false && $status >= 200 && $status < 300) {
            $decoded = json_decode((string)$body, true);
            if (is_array($decoded)) {
                $payload = $decoded;
                @file_put_contents($cacheFile, (string)json_encode($decoded));
            }
        } elseif (is_file($cacheFile)) {
            $payload = json_decode((string)file_get_contents($cacheFile), true);
        }
    }

    if (!is_array($payload)) {
        return null;
    }

    $rows = [];
    if (isset($payload['items']) && is_array($payload['items'])) {
        $rows = array_values($payload['items']);
    } elseif (isset($payload['data']) && is_array($payload['data'])) {
        $rows = array_values($payload['data']);
    } else {
        $rows = array_values($payload);
    }

    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $name = trim((string)($row['market_hash_name'] ?? $row['name'] ?? ''));
        if ($name === '' || strcasecmp($name, $marketHashName) !== 0) {
            continue;
        }
        $inspect = normalizeInspectUrl((string)($row['inspect_link'] ?? ''));
        if ($inspect !== '') {
            return $inspect;
        }
    }

    return null;
}

function resolveWearInspectUrl(string $marketHashName): array
{
    $sources = [
        'csfloat' => static fn (string $name): ?string => fetchCsfloatInspectLink($name),
        'dmarket' => static fn (string $name): ?string => fetchDmarketInspectLink($name),
        'white_market' => static fn (string $name): ?string => fetchWhiteMarketInspectLink($name),
    ];

    foreach ($sources as $source => $fetcher) {
        $inspectUrl = $fetcher($marketHashName);
        if ($inspectUrl) {
            return ['inspect_url' => $inspectUrl, 'source' => $source];
        }
    }

    return ['inspect_url' => null, 'source' => null];
}

function looksLikeStandaloneStickerName(string $baseName): bool
{
    return (bool)preg_match('/^Sticker\s*\|/i', trim($baseName));
}

function resolveGeneratedContainerInspectUrl(string $marketHashName): array
{
    if (
        !function_exists('resolveCraftCrateEcon')
        || !function_exists('resolveCraftAgentEcon')
        || !function_exists('resolveCraftStickerEcon')
    ) {
        $craftLookup = __DIR__ . '/lib/craft_econ_lookup.php';
        if (is_file($craftLookup)) {
            require_once $craftLookup;
        }
    }

    if (function_exists('resolveCraftStickerEcon') && looksLikeStandaloneStickerName($marketHashName)) {
        $sticker = resolveCraftStickerEcon($marketHashName);
        $stickerUrl = normalizeInspectUrl((string)($sticker['inspect_url'] ?? ''));
        if ($stickerUrl !== '') {
            return ['inspect_url' => $stickerUrl, 'source' => 'generated-sticker'];
        }
    }

    if (function_exists('resolveCraftAgentEcon')) {
        $agent = resolveCraftAgentEcon($marketHashName);
        $agentUrl = normalizeInspectUrl((string)($agent['inspect_url'] ?? ''));
        if ($agentUrl !== '') {
            return ['inspect_url' => $agentUrl, 'source' => 'generated-agent'];
        }
    }

    if (function_exists('resolveCraftStickerEcon')) {
        $sticker = resolveCraftStickerEcon($marketHashName);
        $stickerUrl = normalizeInspectUrl((string)($sticker['inspect_url'] ?? ''));
        if ($stickerUrl !== '') {
            return ['inspect_url' => $stickerUrl, 'source' => 'generated-sticker'];
        }
    }

    if (!function_exists('resolveCraftCrateEcon')) {
        return ['inspect_url' => null, 'source' => null];
    }

    $crate = resolveCraftCrateEcon($marketHashName);
    $inspectUrl = normalizeInspectUrl((string)($crate['inspect_url'] ?? ''));
    if ($inspectUrl === '') {
        return ['inspect_url' => null, 'source' => null];
    }

    return ['inspect_url' => $inspectUrl, 'source' => 'generated-container'];
}

function resolveInspectLinksForBaseName(string $baseItemName): array
{
    $groupUrl = buildSteamMarketGroupUrl($baseItemName);
    $links = [];

    if (!itemSupportsWearVariants($baseItemName)) {
        $marketHashName = $baseItemName;
        // Agents / stickers get a stable generated inspect first (no live listing needed).
        $resolved = (looksLikePlayerAgentName($marketHashName) || looksLikeStandaloneStickerName($marketHashName))
            ? resolveGeneratedContainerInspectUrl($marketHashName)
            : ['inspect_url' => null, 'source' => null];
        if (empty($resolved['inspect_url'])) {
            $resolved = resolveWearInspectUrl($marketHashName);
        }
        if (empty($resolved['inspect_url'])) {
            $resolved = resolveGeneratedContainerInspectUrl($marketHashName);
        }
        $links['Standard'] = buildInspectLinkEntry(
            'Standard',
            $resolved['inspect_url'],
            $groupUrl,
            $groupUrl,
            (string)($resolved['source'] ?? '')
        );
        return $links;
    }

    $resolvedByWear = [];
    foreach (supportedInspectWears() as $wear) {
        $marketHashName = sprintf('%s (%s)', $baseItemName, $wear);
        $inspect = fetchDmarketInspectLink($marketHashName);
        if ($inspect) {
            $resolvedByWear[$wear] = ['inspect_url' => $inspect, 'source' => 'dmarket'];
        }
    }

    foreach (supportedInspectWears() as $wear) {
        $marketUrl = buildSteamMarketListingUrl($baseItemName, $wear);
        $marketHashName = sprintf('%s (%s)', $baseItemName, $wear);
        $resolved = $resolvedByWear[$wear] ?? null;

        if (!$resolved || empty($resolved['inspect_url'])) {
            $resolved = resolveWearInspectUrl($marketHashName);
        }

        $links[$wear] = buildInspectLinkEntry(
            $wear,
            $resolved['inspect_url'] ?? null,
            $marketUrl,
            $groupUrl,
            (string)($resolved['source'] ?? '')
        );
    }

    return $links;
}
