<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';

function normalizePriceHistorySource(string $value): string
{
    $normalized = strtolower(trim($value));

    return match ($normalized) {
        '', 'all', 'all_sources', 'all sources' => '',
        'steam', 'steam market', 'steamanalyst' => 'Steam',
        'skinport' => 'Skinport',
        'csfloat', 'floatdb', 'floatdatabase', 'float database' => 'CSFloat',
        default => trim($value),
    };
}

function dbIsoDateTimeSql(string $expression, string $driver): string
{
    if ($driver === 'sqlsrv') {
        return sprintf("CONVERT(VARCHAR(19), %s, 126)", $expression);
    }

    if ($driver === 'pgsql') {
        return sprintf("TO_CHAR(%s, 'YYYY-MM-DD\"T\"HH24:MI:SS')", $expression);
    }

    return sprintf("DATE_FORMAT(%s, '%%Y-%%m-%%dT%%H:%%i:%%s')", $expression);
}

try {
    $connection = marketHistoryPdoConnection();
    $driver = pdoDriverName($connection);
    $requestedItemId = isset($_GET['item_id']) ? (int)$_GET['item_id'] : 1;
    $lookupName = trim((string)($_GET['lookup_name'] ?? ''));
    $itemId = resolveDataDbItemId($connection, $requestedItemId, $lookupName);
    $range = strtoupper($_GET['range'] ?? 'ALL');
    $source = normalizePriceHistorySource((string)($_GET['source'] ?? ''));
    $wear = trim((string)($_GET['wear'] ?? ''));

    $days = match ($range) {
        '7D' => 7,
        '1M' => 30,
        '3M' => 90,
        '6M' => 180,
        '1Y' => 365,
        default => null,
    };

    $where = [
        'item_id = :item_id',
        'recorded_at <= ' . dbCurrentTimestampSql($driver),
    ];
    $params = [
        ':item_id' => $itemId,
    ];

    if ($days !== null) {
        $where[] = 'recorded_at >= ' . dbDaysAgoSql($days, $driver);
    }

    if ($source !== '' && dbColumnExists($connection, 'price_history', 'source')) {
        $where[] = 'source = :source';
        $params[':source'] = $source;
    }

    if ($wear !== '' && dbColumnExists($connection, 'price_history', 'wear')) {
        $where[] = 'wear = :wear';
        $params[':wear'] = $wear;
    }

    $timestampExpression = dbIsoDateTimeSql('recorded_at', $driver);
    $statement = $connection->prepare(
        "SELECT
            {$timestampExpression} AS tracked_date,
            ROUND(AVG(price), 2) AS price,
            COALESCE(SUM(volume), 0) AS volume
         FROM price_history
         WHERE " . implode(' AND ', $where) . "
         GROUP BY {$timestampExpression}
         ORDER BY tracked_date ASC"
    );
    $statement->execute($params);

    $data = [];
    foreach ($statement->fetchAll() as $row) {
        $data[] = [
            'date' => (string)$row['tracked_date'],
            'price' => (float)$row['price'],
            'volume' => (int)$row['volume'],
        ];
    }

    respondJson($data);
} catch (Throwable $exception) {
    respondJson(['error' => $exception->getMessage()], 500);
}
