<?php
declare(strict_types=1);

function whiteMarketPartnerEndpoint(): string
{
    return 'https://api.white.market/graphql/partner';
}

function whiteMarketAccessTokenCachePath(string $cacheDir): string
{
    return rtrim($cacheDir, '\\/') . '/access_token.json';
}

function whiteMarketHistoryCachePath(string $cacheDir, string $marketHashName): string
{
    return rtrim($cacheDir, '\\/') . '/' . md5($marketHashName) . '_history.json';
}

function whiteMarketBuildItemUrl(string $marketHashName): string
{
    $marketHashName = trim($marketHashName);
    if ($marketHashName === '') {
        return 'https://white.market/';
    }

    return 'https://white.market/item?' . http_build_query([
        'appId' => '730',
        'nameHash' => $marketHashName,
    ]);
}

function whiteMarketGraphqlRequest(string $accessToken, string $query, array $variables = [], int $timeout = 30): array
{
    $payload = ['query' => $query];
    if ($variables) {
        $payload['variables'] = $variables;
    }

    $headers = ['Content-Type: application/json'];
    if ($accessToken !== '') {
        $headers[] = 'Authorization: Bearer ' . $accessToken;
    }

    $ch = curl_init(whiteMarketPartnerEndpoint());
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_POSTFIELDS     => (string)json_encode($payload),
        CURLOPT_USERAGENT      => 'CS2MarketTracker/1.0',
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $body = (string)(curl_exec($ch) ?: '');
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $json = json_decode($body, true);
    return [
        'http_code' => $httpCode,
        'json'      => is_array($json) ? $json : [],
        'errors'    => is_array($json['errors'] ?? null) ? $json['errors'] : [],
    ];
}

function whiteMarketAcquireAccessToken(string $cacheDir, string $partnerToken, bool $forceLive = false): string
{
    $partnerToken = trim($partnerToken);
    if ($partnerToken === '') {
        return '';
    }

    if (!is_dir($cacheDir)) {
        mkdir($cacheDir, 0755, true);
    }

    $cacheFile = whiteMarketAccessTokenCachePath($cacheDir);
    $ttl = 23 * 3600;

    if (!$forceLive && is_file($cacheFile)) {
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        $fetchedAt = (int)($cached['fetched_at'] ?? 0);
        $token = trim((string)($cached['token'] ?? ''));
        if ($token !== '' && $fetchedAt > 0 && (time() - $fetchedAt) < $ttl) {
            return $token;
        }
    }

    $payload = ['query' => 'mutation { auth_token { accessToken } }'];
    $ch = curl_init(whiteMarketPartnerEndpoint());
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'X-partner-token: ' . $partnerToken,
        ],
        CURLOPT_POSTFIELDS     => (string)json_encode($payload),
        CURLOPT_USERAGENT      => 'CS2MarketTracker/1.0',
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $body = (string)(curl_exec($ch) ?: '');
    curl_close($ch);
    $json = json_decode($body, true);
    $token = trim((string)($json['data']['auth_token']['accessToken'] ?? ''));
    if ($token === '') {
        if (is_file($cacheFile)) {
            $cached = json_decode((string)file_get_contents($cacheFile), true);
            $stale = trim((string)($cached['token'] ?? ''));
            if ($stale !== '') {
                return $stale;
            }
        }
        return '';
    }

    file_put_contents($cacheFile, (string)json_encode([
        'fetched_at' => time(),
        'token'      => $token,
    ], JSON_UNESCAPED_UNICODE));

    return $token;
}

function whiteMarketMoneyToEur(?array $money, float $usdToEur): ?float
{
    if (!$money || !isset($money['value']) || !is_numeric($money['value'])) {
        return null;
    }

    $value = (float)$money['value'];
    if ($value <= 0) {
        return null;
    }

    $currency = strtoupper(trim((string)($money['currency'] ?? 'USD')));
    if ($currency === 'EUR') {
        return round($value, $value < 1 ? 4 : 2);
    }

    return round($value * $usdToEur, $value < 1 ? 4 : 2);
}

function whiteMarketAggregateListingHistory(array $edges, float $usdToEur): array
{
    $byDate = [];
    foreach ($edges as $edge) {
        if (!is_array($edge)) {
            continue;
        }
        $node = is_array($edge['node'] ?? null) ? $edge['node'] : $edge;
        $day = substr((string)($node['createdAt'] ?? ''), 0, 10);
        $price = whiteMarketMoneyToEur(is_array($node['price'] ?? null) ? $node['price'] : null, $usdToEur);
        if ($day === '' || $price === null || $price <= 0) {
            continue;
        }

        if (!isset($byDate[$day]) || $price < $byDate[$day]['price']) {
            $byDate[$day] = [
                'date'   => $day,
                'price'  => $price,
                'volume' => 1,
            ];
        } else {
            $byDate[$day]['volume']++;
        }
    }

    if (count($byDate) < 2) {
        return [];
    }

    ksort($byDate);
    return array_values($byDate);
}

function whiteMarketFetchListingHistory(
    string $marketHashName,
    string $cacheDir,
    string $partnerToken,
    float $usdToEur,
    bool $forceLive
): array {
    $marketHashName = trim($marketHashName);
    if ($marketHashName === '' || trim($partnerToken) === '') {
        return [];
    }

    if (!is_dir($cacheDir)) {
        mkdir($cacheDir, 0755, true);
    }

    $historyFile = whiteMarketHistoryCachePath($cacheDir, $marketHashName);
    $historyTtl = 3600;

    if (!$forceLive && is_file($historyFile)) {
        $cached = json_decode((string)file_get_contents($historyFile), true);
        $fetchedAt = (int)($cached['fetched_at'] ?? 0);
        $points = is_array($cached['points'] ?? null) ? $cached['points'] : [];
        if ($fetchedAt > 0 && (time() - $fetchedAt) < $historyTtl && count($points) >= 2) {
            return $points;
        }
    }

    $accessToken = whiteMarketAcquireAccessToken($cacheDir, $partnerToken, $forceLive);
    if ($accessToken === '') {
        if (is_file($historyFile)) {
            $cached = json_decode((string)file_get_contents($historyFile), true);
            $points = is_array($cached['points'] ?? null) ? $cached['points'] : [];
            if (count($points) >= 2) {
                return $points;
            }
        }
        return [];
    }

    $query = <<<'GQL'
query WhiteMarketListings($nameHash: String!, $first: Int!, $after: String) {
  market_list(
    search: { appId: CSGO, nameHash: $nameHash }
    forwardPagination: { first: $first, after: $after }
  ) {
    totalCount
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        createdAt
        slug
        price { value currency }
        item { nameHash }
      }
    }
  }
}
GQL;

    $allEdges = [];
    $after = null;
    $pageSize = 100;
    $maxPages = 8;

    for ($page = 0; $page < $maxPages; $page++) {
        $variables = [
            'nameHash' => $marketHashName,
            'first'    => $pageSize,
        ];
        if (is_string($after) && $after !== '') {
            $variables['after'] = $after;
        }

        $response = whiteMarketGraphqlRequest($accessToken, $query, $variables, 35);
        if ($response['http_code'] !== 200 || !empty($response['errors'])) {
            break;
        }

        $connection = is_array($response['json']['data']['market_list'] ?? null)
            ? $response['json']['data']['market_list']
            : null;
        if (!$connection) {
            break;
        }

        $edges = is_array($connection['edges'] ?? null) ? $connection['edges'] : [];
        foreach ($edges as $edge) {
            $allEdges[] = $edge;
        }

        $pageInfo = is_array($connection['pageInfo'] ?? null) ? $connection['pageInfo'] : [];
        if (empty($pageInfo['hasNextPage'])) {
            break;
        }

        $after = (string)($pageInfo['endCursor'] ?? '');
        if ($after === '') {
            break;
        }
    }

    $points = whiteMarketAggregateListingHistory($allEdges, $usdToEur);
    if (count($points) < 2) {
        return is_file($historyFile)
            ? (is_array(($cached = json_decode((string)file_get_contents($historyFile), true))['points'] ?? null) ? $cached['points'] : [])
            : [];
    }

    file_put_contents($historyFile, (string)json_encode([
        'fetched_at' => time(),
        'points'     => $points,
    ], JSON_UNESCAPED_UNICODE));

    return $points;
}

function whiteMarketLiveQuoteCachePath(string $cacheDir, string $marketHashName): string
{
    return rtrim($cacheDir, '\\/') . '/' . md5($marketHashName) . '_quote.json';
}

function whiteMarketLoadCachedLiveQuote(string $cacheDir, string $marketHashName, int $ttl = 180): ?array
{
    $path = whiteMarketLiveQuoteCachePath($cacheDir, $marketHashName);
    if (!is_file($path)) {
        return null;
    }

    $mtime = @filemtime($path);
    if ($mtime === false || (time() - $mtime) >= max(30, $ttl)) {
        return null;
    }

    $decoded = json_decode((string)file_get_contents($path), true);
    if (!is_array($decoded) || empty($decoded['current_price'])) {
        return null;
    }

    return $decoded;
}

function whiteMarketSaveCachedLiveQuote(string $cacheDir, string $marketHashName, array $quote): void
{
    if (!is_dir($cacheDir)) {
        mkdir($cacheDir, 0755, true);
    }
    @file_put_contents(
        whiteMarketLiveQuoteCachePath($cacheDir, $marketHashName),
        (string)json_encode($quote, JSON_UNESCAPED_UNICODE)
    );
}

function whiteMarketCheapestEurFromNode(array $node, float $usdToEur): ?float
{
    $item = is_array($node['item'] ?? null) ? $node['item'] : [];
    $best = null;
    foreach ([
        $item['minPrice'] ?? null,
        $node['price'] ?? null,
    ] as $money) {
        $price = whiteMarketMoneyToEur(is_array($money) ? $money : null, $usdToEur);
        if ($price === null || $price <= 0) {
            continue;
        }
        if ($best === null || $price < $best) {
            $best = $price;
        }
    }

    return $best;
}

function whiteMarketQuoteFromLiveNode(string $marketHashName, array $node, array $connection, float $usdToEur): ?array
{
    $price = whiteMarketCheapestEurFromNode($node, $usdToEur);
    if ($price === null || $price <= 0) {
        return null;
    }

    $similarQty = max(0, (int)($node['similarQty'] ?? 0));
    $totalCount = max(0, (int)($connection['totalCount'] ?? 0));
    $listings = max(1, $similarQty > 0 ? $similarQty : $totalCount);
    $slug = trim((string)($node['slug'] ?? ''));
    $marketUrl = $slug !== ''
        ? 'https://white.market/item/' . rawurlencode($slug)
        : whiteMarketBuildItemUrl($marketHashName);

    return [
        'current_price'         => $price,
        'current_price_display' => '€' . number_format($price, $price < 1 ? 4 : 2, '.', ''),
        'listings'              => $listings,
        'listings_display'      => number_format($listings),
        'market_url'            => $marketUrl,
        'updated_at'            => date('c'),
        'source'                => 'white_market',
        'source_label'          => 'White.Market',
        'price_verified'        => true,
        '_white_market_live'    => true,
        '_white_market_similar_qty' => $similarQty,
        '_white_market_total_count' => $totalCount,
    ];
}

function whiteMarketLiveListingSelection(): string
{
    return <<<'GQL'
        slug
        createdAt
        price { value currency }
        similarQty
        item {
          nameHash
          minPrice { value currency }
        }
GQL;
}

function whiteMarketFetchCheapestQuoteUncached(
    string $marketHashName,
    string $accessToken,
    float $usdToEur
): ?array {
    $selection = whiteMarketLiveListingSelection();
    $query = <<<GQL
query WhiteMarketCheapestQuote(\$nameHash: String!) {
  market_list(
    search: {
      appId: CSGO
      nameHash: \$nameHash
      sort: { field: PRICE, type: ASC }
    }
    forwardPagination: { first: 1 }
  ) {
    totalCount
    edges {
      node {
{$selection}
      }
    }
  }
}
GQL;

    $response = whiteMarketGraphqlRequest($accessToken, $query, ['nameHash' => $marketHashName], 25);
    if ($response['http_code'] !== 200 || !empty($response['errors'])) {
        return null;
    }

    $connection = is_array($response['json']['data']['market_list'] ?? null)
        ? $response['json']['data']['market_list']
        : null;
    if (!$connection) {
        return null;
    }

    $node = $connection['edges'][0]['node'] ?? null;
    if (!is_array($node)) {
        return null;
    }

    return whiteMarketQuoteFromLiveNode($marketHashName, $node, $connection, $usdToEur);
}

function whiteMarketFetchCheapestQuotesBatch(
    array $marketHashNames,
    string $accessToken,
    float $usdToEur
): array {
    $names = [];
    foreach ($marketHashNames as $name) {
        $clean = trim((string)$name);
        if ($clean !== '') {
            $names[$clean] = true;
        }
    }
    $names = array_keys($names);
    if (!$names) {
        return [];
    }

    $selection = whiteMarketLiveListingSelection();
    $query = <<<GQL
query WhiteMarketCheapestQuotes(\$namesHash: [String!]!, \$first: Int!) {
  market_list(
    search: {
      appId: CSGO
      namesHash: \$namesHash
      distinctValues: true
      sort: { field: PRICE, type: ASC }
    }
    forwardPagination: { first: \$first }
  ) {
    totalCount
    edges {
      node {
{$selection}
      }
    }
  }
}
GQL;

    $quotes = [];
    foreach (array_chunk($names, 25) as $chunk) {
        $response = whiteMarketGraphqlRequest($accessToken, $query, [
            'namesHash' => array_values($chunk),
            'first'     => max(count($chunk), 1),
        ], 30);
        if ($response['http_code'] !== 200 || !empty($response['errors'])) {
            continue;
        }

        $connection = is_array($response['json']['data']['market_list'] ?? null)
            ? $response['json']['data']['market_list']
            : null;
        if (!$connection) {
            continue;
        }

        $edges = is_array($connection['edges'] ?? null) ? $connection['edges'] : [];
        $wanted = array_fill_keys($chunk, true);
        foreach ($edges as $edge) {
            $node = is_array($edge['node'] ?? null) ? $edge['node'] : null;
            if (!$node) {
                continue;
            }
            $item = is_array($node['item'] ?? null) ? $node['item'] : [];
            $nameHash = trim((string)($item['nameHash'] ?? ''));
            if ($nameHash === '' || !isset($wanted[$nameHash])) {
                continue;
            }
            $minAsk = whiteMarketMoneyToEur(is_array($item['minPrice'] ?? null) ? $item['minPrice'] : null, $usdToEur);
            if ($minAsk === null || $minAsk <= 0) {
                continue;
            }
            $quote = whiteMarketQuoteFromLiveNode($nameHash, $node, $connection, $usdToEur);
            if ($quote === null) {
                continue;
            }
            if (!isset($quotes[$nameHash]) || (float)$quote['current_price'] < (float)$quotes[$nameHash]['current_price']) {
                $quotes[$nameHash] = $quote;
            }
        }
    }

    return $quotes;
}

function whiteMarketFetchLiveQuotes(
    array $marketHashNames,
    string $cacheDir,
    string $partnerToken,
    float $usdToEur,
    bool $ignoreCache = false
): array {
    $names = [];
    foreach ($marketHashNames as $name) {
        $clean = trim((string)$name);
        if ($clean !== '') {
            $names[] = $clean;
        }
    }
    $names = array_values(array_unique($names));
    if (!$names || trim($partnerToken) === '') {
        return [];
    }

    $quotes = [];
    $needed = [];
    foreach ($names as $name) {
        if (!$ignoreCache) {
            $cached = whiteMarketLoadCachedLiveQuote($cacheDir, $name);
            if (is_array($cached)) {
                $quotes[$name] = $cached;
                continue;
            }
        }
        $needed[] = $name;
    }

    if (!$needed) {
        return $quotes;
    }

    $accessToken = whiteMarketAcquireAccessToken($cacheDir, $partnerToken, false);
    if ($accessToken === '') {
        return $quotes;
    }

    $live = whiteMarketFetchCheapestQuotesBatch($needed, $accessToken, $usdToEur);
    foreach ($needed as $name) {
        if (isset($live[$name])) {
            whiteMarketSaveCachedLiveQuote($cacheDir, $name, $live[$name]);
            $quotes[$name] = $live[$name];
        }
    }

    foreach ($needed as $name) {
        if (isset($quotes[$name])) {
            continue;
        }
        $quote = whiteMarketFetchCheapestQuoteUncached($name, $accessToken, $usdToEur);
        if (!is_array($quote)) {
            continue;
        }
        whiteMarketSaveCachedLiveQuote($cacheDir, $name, $quote);
        $quotes[$name] = $quote;
    }

    return $quotes;
}

function whiteMarketFetchLiveQuote(string $marketHashName, string $cacheDir, string $partnerToken, float $usdToEur): ?array
{
    $quotes = whiteMarketFetchLiveQuotes([$marketHashName], $cacheDir, $partnerToken, $usdToEur, false);
    $quote = $quotes[trim($marketHashName)] ?? null;
    return is_array($quote) ? $quote : null;
}

function whiteMarketAttachHistoryToItem(array $item, array $historyPoints): array
{
    if (count($historyPoints) < 2) {
        return $item;
    }

    $item['price_history'] = $historyPoints;
    $item['sparkline'] = array_values(array_map(
        static fn(array $point): float => (float)($point['price'] ?? 0),
        array_slice($historyPoints, -30)
    ));

    return $item;
}

function whiteMarketUsdToEurRate(): float
{
    $config = appConfig();
    return max(0.01, (float)($config['white_market']['usd_to_eur']
        ?? $config['dmarket']['usd_to_eur']
        ?? 0.92));
}

function whiteMarketExportPriceToEur($price, float $usdToEur): ?float
{
    if (!is_numeric($price)) {
        return null;
    }
    $usd = (float)$price;
    if ($usd <= 0) {
        return null;
    }
    return round($usd * $usdToEur, $usd < 1 ? 4 : 2);
}
