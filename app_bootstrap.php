<?php
declare(strict_types=1);

// Device access gate. .user.ini already prepends it to every PHP request, so
// this is a second line of defence for the day that file is lost or ignored -
// the gate guards against a double load and returns immediately.
require_once __DIR__ . '/access_gate.php';

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

// Preflight diagnostics: deploy_check.php calls the JSON endpoints with this
// token so a 500 shows its PHP error text instead of a blank page. Shared hosts
// keep display_errors off, which is right for visitors but hides the cause.
if (($_GET['preflight_errors'] ?? '') === 'csprice-preflight') {
    ini_set('display_errors', '1');
    ini_set('html_errors', '0');
    error_reporting(E_ALL);
}

/**
 * Shared hosts disable process functions (proc_open, exec, popen, shell_exec).
 * In PHP 8 a disabled function is simply undefined, so calling it is a fatal
 * error — every helper that spawns a process must check this first and fall
 * back to cached data.
 */
function appFunctionEnabled(string $name): bool
{
    static $disabled = null;
    if ($disabled === null) {
        $disabled = array_filter(array_map('trim', explode(',', strtolower((string)ini_get('disable_functions')))));
    }
    return function_exists($name) && !in_array(strtolower($name), $disabled, true);
}

function appCanSpawnProcesses(): bool
{
    return appFunctionEnabled('proc_open');
}

function appConfig(): array
{
    static $config = null;

    if ($config === null) {
        $config = require __DIR__ . '/config.php';
    }

    return $config;
}

function configuredDbSection(string $section = 'db', ?string $fallbackSection = null): array
{
    $config = appConfig();
    $settings = is_array($config[$section] ?? null) ? $config[$section] : [];

    if (!dbConfigIsUsable($settings) && $fallbackSection !== null) {
        $fallback = is_array($config[$fallbackSection] ?? null) ? $config[$fallbackSection] : [];
        if (dbConfigIsUsable($fallback)) {
            return $fallback;
        }
    }

    return $settings;
}

function dbConfigIsUsable(array $db): bool
{
    $dsn = trim((string)($db['dsn'] ?? ''));
    if ($dsn !== '') {
        return true;
    }

    $host = trim((string)($db['host'] ?? ''));
    $database = trim((string)($db['database'] ?? ''));

    return $host !== '' && $database !== '';
}

function dbDriverFromConfig(array $db): string
{
    $configured = strtolower(trim((string)($db['driver'] ?? '')));
    $dsn = strtolower(trim((string)($db['dsn'] ?? '')));

    if ($configured === '') {
        if (str_starts_with($dsn, 'sqlsrv:')) {
            return 'sqlsrv';
        }
        if (str_starts_with($dsn, 'pgsql:')) {
            return 'pgsql';
        }
        return 'mysql';
    }

    return match ($configured) {
        'sqlserver', 'mssql', 'azure', 'azuresql', 'azure_sql' => 'sqlsrv',
        'postgresql', 'postgres', 'pg', 'pgsql' => 'pgsql',
        'pdo_mysql' => 'mysql',
        default => $configured,
    };
}

function dbConnection(): mysqli
{
    if (dbDriver() !== 'mysql') {
        throw new RuntimeException(
            'Legacy mysqli connection requested while DB driver is configured as "' . dbDriver() . '". '
            . 'This endpoint still needs the MySQL driver or a PDO migration.'
        );
    }

    $db = configuredDbSection('db');
    $host = $db['host'] ?? 'localhost';
    $username = $db['username'] ?? 'root';
    $password = $db['password'] ?? '';
    $database = $db['database'] ?? 'csgo_price_tracker';
    $port = isset($db['port']) && $db['port'] !== null && $db['port'] !== ''
        ? (int)$db['port']
        : 0;

    if ($port > 0) {
        $connection = new mysqli($host, $username, $password, $database, $port);
    } else {
        $connection = new mysqli($host, $username, $password, $database);
    }

    $connection->set_charset('utf8mb4');

    return $connection;
}

function dbDriver(): string
{
    return dbDriverFromConfig(configuredDbSection('db'));
}

function assertPdoDriverIsAvailable(string $driver): void
{
    if ($driver === 'sqlsrv' && !extension_loaded('pdo_sqlsrv')) {
        throw new RuntimeException(
            'PDO SQLSRV extension is not loaded. Install and enable the Microsoft SQL Server PHP drivers first.'
        );
    }

    if ($driver === 'mysql' && !extension_loaded('pdo_mysql')) {
        throw new RuntimeException('PDO MySQL extension is not loaded.');
    }

    if ($driver === 'pgsql' && !extension_loaded('pdo_pgsql')) {
        throw new RuntimeException('PDO PostgreSQL extension is not loaded. Enable pdo_pgsql in php.ini.');
    }
}

function dbPdoConnection(string $section = 'db', ?string $fallbackSection = null): PDO
{
    static $connections = [];

    $cacheKey = $section . '|' . ($fallbackSection ?? '');
    if (isset($connections[$cacheKey]) && $connections[$cacheKey] instanceof PDO) {
        return $connections[$cacheKey];
    }

    $db = configuredDbSection($section, $fallbackSection);
    $driver = dbDriverFromConfig($db);
    $dsn = trim((string)($db['dsn'] ?? ''));
    $username = (string)($db['username'] ?? 'root');
    $password = (string)($db['password'] ?? '');
    $host = (string)($db['host'] ?? 'localhost');
    $database = (string)($db['database'] ?? 'csgo_price_tracker');
    $port = isset($db['port']) && $db['port'] !== null && $db['port'] !== ''
        ? (int)$db['port']
        : 0;
    $encrypt = array_key_exists('encrypt', $db) ? (bool)$db['encrypt'] : true;
    $trustServerCertificate = array_key_exists('trust_server_certificate', $db)
        ? (bool)$db['trust_server_certificate']
        : false;

    if ($dsn === '') {
        if ($driver === 'sqlsrv') {
            $server = $host;
            if ($port > 0) {
                $server .= ',' . $port;
            }

            $dsn = sprintf(
                'sqlsrv:Server=%s;Database=%s;%s;%s;LoginTimeout=5',
                $server,
                $database,
                $encrypt ? 'Encrypt=1' : 'Encrypt=0',
                $trustServerCertificate ? 'TrustServerCertificate=1' : 'TrustServerCertificate=0'
            );
        } elseif ($driver === 'pgsql') {
            $dsn = sprintf(
                'pgsql:host=%s;%sdbname=%s;sslmode=require;connect_timeout=5',
                $host,
                $port > 0 ? 'port=' . $port . ';' : '',
                $database
            );
        } else {
            $dsn = sprintf(
                'mysql:host=%s;%sdbname=%s;charset=utf8mb4',
                $host,
                $port > 0 ? 'port=' . $port . ';' : '',
                $database
            );
        }
    }

    assertPdoDriverIsAvailable($driver);

    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        // Transaction pooler (Supabase port 6543) requires client-side emulated prepares
        PDO::ATTR_EMULATE_PREPARES => $driver === 'pgsql',
    ];

    if ($driver === 'mysql' && defined('PDO::MYSQL_ATTR_INIT_COMMAND')) {
        $options[PDO::MYSQL_ATTR_INIT_COMMAND] = 'SET NAMES utf8mb4';
    }
    if ($driver === 'mysql' && defined('PDO::ATTR_TIMEOUT')) {
        $options[PDO::ATTR_TIMEOUT] = 5;
    }

    try {
        $connections[$cacheKey] = new PDO($dsn, $username, $password, $options);
    } catch (Throwable $exception) {
        throw new RuntimeException('PDO database connection failed: ' . $exception->getMessage(), 0, $exception);
    }

    return $connections[$cacheKey];
}

function marketDataPdoConnection(): PDO
{
    return dbPdoConnection('market_data_db', 'db');
}

function marketHistoryPdoConnection(): PDO
{
    try {
        return marketDataPdoConnection();
    } catch (Throwable) {
        return dbPdoConnection('db');
    }
}

function pdoDriverName(PDO $connection): string
{
    $driver = strtolower((string)$connection->getAttribute(PDO::ATTR_DRIVER_NAME));
    return $driver === 'dblib' ? 'sqlsrv' : $driver;
}

function dbCurrentTimestampSql(?string $driver = null): string
{
    $driver ??= dbDriver();

    return $driver === 'sqlsrv' ? 'SYSUTCDATETIME()' : 'NOW()';
}

function dbDaysAgoSql(int $days, ?string $driver = null): string
{
    $driver ??= dbDriver();
    $days = abs($days);

    if ($driver === 'sqlsrv') {
        return sprintf('DATEADD(DAY, -%d, %s)', $days, dbCurrentTimestampSql($driver));
    }
    if ($driver === 'pgsql') {
        return sprintf("%s - INTERVAL '%d days'", dbCurrentTimestampSql($driver), $days);
    }
    return sprintf('DATE_SUB(%s, INTERVAL %d DAY)', dbCurrentTimestampSql($driver), $days);
}

function dbDateOnlySql(string $expression, ?string $driver = null): string
{
    $driver ??= dbDriver();

    if ($driver === 'mysql') {
        return sprintf('DATE(%s)', $expression);
    }
    return sprintf('CAST(%s AS DATE)', $expression);
}

function dbWearOrderSql(string $column = 'wear'): string
{
    return sprintf(
        "CASE
            WHEN %s = 'Factory New' THEN 1
            WHEN %s = 'Minimal Wear' THEN 2
            WHEN %s = 'Field-Tested' THEN 3
            WHEN %s = 'Well-Worn' THEN 4
            WHEN %s = 'Battle-Scarred' THEN 5
            ELSE 99
        END",
        $column,
        $column,
        $column,
        $column,
        $column
    );
}

function dbTableExists(PDO $connection, string $table): bool
{
    $driver = pdoDriverName($connection);

    if ($driver === 'sqlsrv') {
        $statement = $connection->prepare(
            'SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_CATALOG = DB_NAME() AND TABLE_NAME = ?'
        );
    } elseif ($driver === 'pgsql') {
        $statement = $connection->prepare(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ?"
        );
    } else {
        $statement = $connection->prepare(
            'SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
        );
    }

    $statement->execute([$table]);

    return (int)$statement->fetchColumn() > 0;
}

/**
 * Columns known to exist, remembered across requests in a small JSON file
 * (assets/cache/schema-columns.json, keyed driver|table|column). Every
 * profile request used to ask information_schema a dozen times - each a
 * round trip to the Supabase pooler - which is what made the profile panel
 * slow to open after sign-up (user, 2026-10-02). Only positives are stored:
 * a column that is missing is re-checked (and added) every time, and a
 * column that was just added is found by the next real query.
 */
function dbColumnCacheFile(): string
{
    return __DIR__ . '/assets/cache/schema-columns.json';
}

function dbColumnExists(PDO $connection, string $table, string $column): bool
{
    static $known = null;
    $driver = pdoDriverName($connection);
    $key = $driver . '|' . $table . '|' . $column;
    if ($known === null) {
        $known = [];
        $file = dbColumnCacheFile();
        if (is_file($file) && (time() - (int)filemtime($file)) < 86400) {
            $decoded = json_decode((string)@file_get_contents($file), true);
            if (is_array($decoded)) {
                $known = $decoded;
            }
        }
    }
    if (!empty($known[$key])) {
        return true;
    }
    $exists = dbColumnExistsQuery($connection, $driver, $table, $column);
    if ($exists) {
        $known[$key] = true;
        $dir = dirname(dbColumnCacheFile());
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        @file_put_contents(dbColumnCacheFile(), json_encode($known), LOCK_EX);
    }
    return $exists;
}

function dbColumnExistsQuery(PDO $connection, string $driver, string $table, string $column): bool
{
    if ($driver === 'sqlsrv') {
        $statement = $connection->prepare(
            'SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_CATALOG = DB_NAME() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
        );
    } elseif ($driver === 'pgsql') {
        $statement = $connection->prepare(
            "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ? AND column_name = ?"
        );
    } else {
        $statement = $connection->prepare(
            'SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
        );
    }

    $statement->execute([$table, $column]);

    return (int)$statement->fetchColumn() > 0;
}

function dbNowUtc(): string
{
    return gmdate('Y-m-d H:i:s');
}

function dbBooleanLiteral(bool $value): int
{
    return $value ? 1 : 0;
}

function jsonHeaders(): void
{
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
}

function respondJson(mixed $payload, int $status = 200): never
{
    $json = json_encode($payload);
    if ($json === false) {
        $json = '{"error":"json_encode failed"}';
        $status = 500;
    }

    // csprice.eu's front proxy treats a 502 from PHP as a dead upstream and
    // drops the connection without a response (the browser sees "Failed to
    // fetch" instead of our JSON error). 500/503 pass through untouched.
    if ($status === 502) {
        $status = 500;
    }

    if (PHP_SAPI !== 'cli') {
        jsonHeaders();
        header('Content-Length: ' . (string)strlen($json));
        header('Connection: close');
    }

    http_response_code($status);
    echo $json;

    if (PHP_SAPI !== 'cli') {
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        } else {
            while (ob_get_level() > 0) {
                ob_end_flush();
            }
            flush();
        }
    }

    exit;
}

function httpJsonRequest(string $url, array $headers = [], int $timeoutSeconds = 20): array
{
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => $timeoutSeconds,
        CURLOPT_CONNECTTIMEOUT => min(10, $timeoutSeconds),
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 8,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $body = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);

    if ($body === false) {
        $error = curl_error($curl);
        curl_close($curl);
        throw new RuntimeException('HTTP request failed: ' . $error);
    }

    curl_close($curl);

    $decoded = json_decode($body, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Invalid JSON response received.');
    }

    return [
        'status' => $status,
        'body' => $body,
        'json' => $decoded,
    ];
}

function httpTextRequest(string $url, array $headers = [], int $timeoutSeconds = 20): array
{
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => $timeoutSeconds,
        CURLOPT_CONNECTTIMEOUT => min(10, $timeoutSeconds),
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 8,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $body = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);

    if ($body === false) {
        $error = curl_error($curl);
        curl_close($curl);
        throw new RuntimeException('HTTP request failed: ' . $error);
    }

    curl_close($curl);

    return [
        'status' => $status,
        'body' => $body,
    ];
}

function splitSteamWear(string $marketName): array
{
    if (preg_match('/^(.*)\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/', trim($marketName), $matches)) {
        return [trim($matches[1]), $matches[2]];
    }

    return [trim($marketName), ''];
}

function loadPrimaryItemById(int $itemId): ?array
{
    if ($itemId <= 0) {
        return null;
    }

    $connection = dbPdoConnection('db');
    if (!dbTableExists($connection, 'items')) {
        return null;
    }

    $statement = $connection->prepare('SELECT * FROM items WHERE id = :item_id');
    $statement->execute([':item_id' => $itemId]);
    $row = $statement->fetch();

    return is_array($row) ? $row : null;
}

function resolveDataDbItemId(PDO $connection, int $fallbackItemId, string $lookupName = ''): int
{
    if (!dbTableExists($connection, 'items')) {
        return $fallbackItemId;
    }

    $candidates = [];
    $lookupName = trim($lookupName);
    if ($lookupName !== '') {
        [$baseName] = splitSteamWear($lookupName);
        $candidates[] = $lookupName;
        if ($baseName !== '' && $baseName !== $lookupName) {
            $candidates[] = $baseName;
        }
    }

    if ($fallbackItemId > 0) {
        $primaryItem = loadPrimaryItemById($fallbackItemId);
        if (is_array($primaryItem) && !empty($primaryItem['name'])) {
            $primaryName = trim((string)$primaryItem['name']);
            if ($primaryName !== '') {
                $candidates[] = $primaryName;
            }
        }
    }

    $candidates = array_values(array_unique(array_filter($candidates, static fn (string $value): bool => $value !== '')));
    if (!$candidates) {
        return $fallbackItemId;
    }

    $statement = $connection->prepare('SELECT id FROM items WHERE name = :name ORDER BY id ASC');
    foreach ($candidates as $candidate) {
        $statement->execute([':name' => $candidate]);
        $resolvedId = $statement->fetchColumn();
        if ($resolvedId !== false) {
            return (int)$resolvedId;
        }
    }

    return $fallbackItemId;
}

function priceToFloat(mixed $value): ?float
{
    if (is_int($value) || is_float($value)) {
        return round((float)$value, 2);
    }

    if (!is_string($value)) {
        return null;
    }

    $clean = preg_replace('/[^0-9,.\-]/', '', $value);
    if ($clean === null || $clean === '') {
        return null;
    }

    if (str_contains($clean, ',') && !str_contains($clean, '.')) {
        $clean = str_replace(',', '.', $clean);
    } else {
        $clean = str_replace(',', '', $clean);
    }

    if (!is_numeric($clean)) {
        return null;
    }

    return round((float)$clean, 2);
}
