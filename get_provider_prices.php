<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';

function providerIsoDateTimeSql(string $expression, string $driver): string
{
    if ($driver === 'sqlsrv') {
        return sprintf("CONVERT(VARCHAR(19), %s, 126)", $expression);
    }

    if ($driver === 'pgsql') {
        return sprintf("TO_CHAR(%s, 'YYYY-MM-DD\"T\"HH24:MI:SS')", $expression);
    }

    return sprintf("DATE_FORMAT(%s, '%%Y-%%m-%%dT%%H:%%i:%%s')", $expression);
}

function providerRangeDays(string $range): int
{
    return match (strtoupper(trim($range))) {
        '30D' => 30,
        '180D' => 180,
        '1Y'  => 365,
        'ALL', 'MAX' => 0,
        default => 90,
    };
}

function providerPreferredSources(): array
{
    return [
        'Steam' => 1.0,
        'Skinport' => 1.0,
        'CSFloat' => 1.0,
        'White.Market' => 1.0,
        'Buff.163' => 1.0,
        'DMarket' => 1.0,
    ];
}

function providerSplitLookupName(string $lookupName): array
{
    $cleanName = trim($lookupName);
    if (preg_match('/^(.*)\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i', $cleanName, $matches)) {
        return [trim((string)$matches[1]), trim((string)$matches[2])];
    }

    return [$cleanName, ''];
}

function providerCatalogPrice(string $lookupName): ?float
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

    [$baseName] = providerSplitLookupName($cleanName);
    if ($baseName !== '' && isset($priceLookup[$baseName]) && $priceLookup[$baseName] > 0) {
        return (float)$priceLookup[$baseName];
    }

    return null;
}

function providerReferenceAnchor(PDO $connection, int $itemId, string $lookupName, string $wear, array $providerRatios): float
{
    $steamAnchor = providerLatestAnchor($connection, $itemId, 'Steam', $wear);
    if ($steamAnchor !== null && $steamAnchor > 0) {
        return $steamAnchor;
    }

    foreach ($providerRatios as $provider => $ratio) {
        if ($provider === 'Steam' || $ratio <= 0) {
            continue;
        }
        $providerAnchor = providerLatestAnchor($connection, $itemId, $provider, $wear);
        if ($providerAnchor !== null && $providerAnchor > 0) {
            return round($providerAnchor / $ratio, 2);
        }
    }

    $catalogPrice = providerCatalogPrice($lookupName);
    if ($catalogPrice !== null && $catalogPrice > 0) {
        return $catalogPrice;
    }

    return 162.41;
}

function providerGeneratedDateList(int $days): array
{
    $points = match (true) {
        $days <= 30 => 8,
        $days <= 90 => 14,
        $days <= 180 => 18,
        default => 24,
    };

    $step = max(1, (int)floor($days / max(1, $points - 1)));
    $today = new DateTimeImmutable('today 18:00:00', new DateTimeZone('UTC'));
    $dates = [];

    for ($index = $points - 1; $index >= 0; $index--) {
        $dates[] = $today->modify('-' . ($index * $step) . ' days')->format('Y-m-d\TH:i:s');
    }

    return $dates;
}

function providerDbSourceName(string $provider): string
{
    $normalized = strtolower((string)preg_replace('/[^a-z0-9]+/i', '', $provider));

    return match ($normalized) {
        'steam', 'steammarket' => 'Steam',
        'skinport' => 'Skinport',
        'csfloat', 'float' => 'CSFloat',
        'whitemarket' => 'White.Market',
        'buff163', 'buff' => 'Buff.163',
        'dmarket', 'dm' => 'DMarket',
        default => match ($provider) {
        'Steam' => 'Steam',
        'Skinport' => 'Skinport',
        'CSFloat' => 'CSFloat',
        'White.Market' => 'White.Market',
        'Buff.163' => 'Buff.163',
        'DMarket' => 'DMarket',
        default => $provider,
        },
    };
}

function providerLatestAnchor(PDO $connection, int $itemId, string $provider, string $wear): ?float
{
    $driver = pdoDriverName($connection);
    $source = providerDbSourceName($provider);

    try {
        if (dbTableExists($connection, 'price_history') && dbColumnExists($connection, 'price_history', 'source')) {
            $wearClause = '';
            $params = [':item_id' => $itemId, ':source' => $source];
            if ($wear !== '' && dbColumnExists($connection, 'price_history', 'wear')) {
                $wearClause = ' AND wear = :wear';
                $params[':wear'] = $wear;
            }

            $sql = $driver === 'sqlsrv'
                ? "SELECT TOP 1 price FROM price_history WHERE item_id = :item_id AND source = :source{$wearClause} ORDER BY recorded_at DESC"
                : "SELECT price FROM price_history WHERE item_id = :item_id AND source = :source{$wearClause} ORDER BY recorded_at DESC LIMIT 1";
            $statement = $connection->prepare($sql);
            $statement->execute($params);
            $price = (float)$statement->fetchColumn();
            if ($price > 0) {
                return $price;
            }
        }
    } catch (Throwable) {
    }

    try {
        if (dbTableExists($connection, 'market_listings')) {
            $wearClause = '';
            $params = [':item_id' => $itemId, ':marketplace' => $source];
            if ($wear !== '' && dbColumnExists($connection, 'market_listings', 'wear')) {
                $wearClause = ' AND wear = :wear';
                $params[':wear'] = $wear;
            }

            $sql = $driver === 'sqlsrv'
                ? "SELECT TOP 1 price FROM market_listings WHERE item_id = :item_id AND marketplace = :marketplace{$wearClause} ORDER BY recorded_at DESC"
                : "SELECT price FROM market_listings WHERE item_id = :item_id AND marketplace = :marketplace{$wearClause} ORDER BY recorded_at DESC LIMIT 1";
            $statement = $connection->prepare($sql);
            $statement->execute($params);
            $price = (float)$statement->fetchColumn();
            if ($price > 0) {
                return $price;
            }
        }
    } catch (Throwable) {
    }

    return null;
}

function providerGeneratedPoints(string $provider, array $dateList, float $anchor, string $wear): array
{
    $seed = crc32((string)($GLOBALS['__provider_seed'] ?? 'provider') . ':' . $provider . ':' . $wear);
    $count = max(1, count($dateList));
    $points = [];

    foreach ($dateList as $index => $date) {
        $progress = $count > 1 ? $index / ($count - 1) : 1;
        $wave = sin(($index + 1) * 0.82 + ($seed % 97) / 17);
        $micro = sin(($index + 3) * 1.71 + ($seed % 211) / 31);
        $trend = match ($provider) {
            'DMarket' => -0.028 + ($progress * 0.018),
            'Buff.163' => -0.018 + ($progress * 0.026),
            'CSFloat' => -0.012 + ($progress * 0.018),
            'Skinport' => -0.008 + ($progress * 0.014),
            default => -0.004 + ($progress * 0.010),
        };

        $price = $anchor * (1 + $trend + ($wave * 0.012) + ($micro * 0.006));
        $points[] = [
            'date' => (string)$date,
            'price' => round(max(0.01, $price), 2),
        ];
    }

    return $points;
}

function providerIntegrationStatus(): array
{
    $config = appConfig();
    $dmarket = $config['dmarket'] ?? [];
    $buff = $config['buff163'] ?? [];

    return [
        'dmarket' => [
            'configured' => trim((string)($dmarket['public_key'] ?? '')) !== ''
                && trim((string)($dmarket['secret_key'] ?? '')) !== '',
            'base_url' => (string)($dmarket['base_url'] ?? 'https://api.dmarket.com'),
        ],
        'buff163' => [
            'configured' => trim((string)($buff['session_cookie'] ?? '')) !== '',
            'base_url' => (string)($buff['base_url'] ?? 'https://buff.163.com'),
        ],
    ];
}

try {
    $connection = marketHistoryPdoConnection();
    $driver = pdoDriverName($connection);
    $requestedItemId = isset($_GET['item_id']) ? (int)$_GET['item_id'] : 1;
    $lookupName = trim((string)($_GET['lookup_name'] ?? ''));
    $itemId = resolveDataDbItemId($connection, $requestedItemId, $lookupName);
    $range = strtoupper($_GET['range'] ?? '90D');
    $wear = trim((string)($_GET['wear'] ?? ''));
    $days = providerRangeDays($range);
    $GLOBALS['__provider_seed'] = $lookupName !== '' ? $lookupName : (string)$itemId;

    $dateExpression = providerIsoDateTimeSql('recorded_at', $driver);
    $where = [
        'item_id = :item_id',
        'recorded_at <= ' . dbCurrentTimestampSql($driver),
    ];
    if ($days > 0) {
        $where[] = 'recorded_at >= ' . dbDaysAgoSql($days, $driver);
    }
    $params = [':item_id' => $itemId];

    $hasProviderHistory = dbTableExists($connection, 'provider_price_history');

    if ($hasProviderHistory && $wear !== '' && dbColumnExists($connection, 'provider_price_history', 'wear')) {
        $where[] = 'wear = :wear';
        $params[':wear'] = $wear;
    }

    $dates = [];
    $providers = [];

    if ($hasProviderHistory) {
        $statement = $connection->prepare(
            "SELECT
                provider,
                {$dateExpression} AS tracked_date,
                ROUND(AVG(price), 2) AS price
             FROM provider_price_history
             WHERE " . implode(' AND ', $where) . "
             GROUP BY provider, {$dateExpression}
             ORDER BY tracked_date ASC, provider ASC"
        );
        $statement->execute($params);

        foreach ($statement->fetchAll() as $row) {
            $provider = providerDbSourceName((string)$row['provider']);
            $date = (string)$row['tracked_date'];
            $price = (float)$row['price'];

            $dates[$date] = true;
            if (!isset($providers[$provider])) {
                $providers[$provider] = [];
            }
            $providers[$provider][$date] = $price;
        }
    }

    $dateList = array_keys($dates);
    sort($dateList);

    $preferredSources = array_keys(providerPreferredSources());
    $series = [];

    foreach ($preferredSources as $name) {
        if (!isset($providers[$name])) {
            continue;
        }

        ksort($providers[$name]);
        $points = [];
        foreach ($providers[$name] as $date => $price) {
            $numericPrice = (float)$price;
            if ($numericPrice <= 0) {
                continue;
            }
            $points[] = ['date' => $date, 'price' => round($numericPrice, 2)];
        }

        if (!$points) {
            continue;
        }

        $series[] = [
            'name' => $name,
            'points' => $points,
            'source' => 'database',
        ];
    }

    foreach ($providers as $name => $pointsByDate) {
        if (in_array($name, $preferredSources, true)) {
            continue;
        }

        ksort($pointsByDate);
        $points = [];
        foreach ($pointsByDate as $date => $price) {
            $numericPrice = (float)$price;
            if ($numericPrice <= 0) {
                continue;
            }
            $points[] = ['date' => $date, 'price' => round($numericPrice, 2)];
        }

        if (!$points) {
            continue;
        }

        $series[] = [
            'name' => $name,
            'points' => $points,
            'source' => 'database',
        ];
    }

    respondJson([
        'dates' => $dateList,
        'providers' => $series,
        'integrations' => providerIntegrationStatus(),
    ]);
} catch (Throwable $exception) {
    respondJson(['error' => $exception->getMessage()], 500);
}

