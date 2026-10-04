<?php
declare(strict_types=1);

require_once __DIR__ . '/app_bootstrap.php';

function ensureSessionStarted(): void
{
    if (PHP_SAPI === 'cli') {
        return;
    }

    if (session_status() === PHP_SESSION_NONE) {
        $https = strtolower((string)($_SERVER['HTTPS'] ?? ''));
        $forwarded = strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
        $secure = $https === 'on' || $https === '1' || $forwarded === 'https';
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
    }
}

function requestScheme(): string
{
    $https = strtolower((string)($_SERVER['HTTPS'] ?? ''));
    $forwarded = strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));

    if ($https === 'on' || $https === '1' || $forwarded === 'https') {
        return 'https';
    }

    return 'http';
}

function appBasePath(): string
{
    $scriptName = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? ''));
    $directory = rtrim(str_replace('\\', '/', dirname($scriptName)), '/.');
    return $directory === '' ? '' : $directory;
}

function absoluteAppUrl(string $path = ''): string
{
    $host = trim((string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $basePath = appBasePath();
    $relativePath = ltrim($path, '/');

    if ($relativePath === '') {
        $targetPath = $basePath . '/';
    } elseif ($basePath === '') {
        $targetPath = '/' . $relativePath;
    } else {
        $targetPath = $basePath . '/' . $relativePath;
    }

    return requestScheme() . '://' . $host . $targetPath;
}

function steamCacheConfig(): array
{
    return appConfig()['steam_cache'] ?? [];
}

function steamProfileCacheTtlSeconds(): int
{
    return max(300, (int)(steamCacheConfig()['profile_ttl_seconds'] ?? 21600));
}

function steamInventoryCacheTtlSeconds(): int
{
    return max(60, (int)(steamCacheConfig()['inventory_ttl_seconds'] ?? 1800));
}

function steamInventoryPageSize(): int
{
    return max(20, min(200, (int)(steamCacheConfig()['page_size'] ?? 200)));
}

function steamInventoryMaxPages(): int
{
    return max(1, min(100, (int)(steamCacheConfig()['max_pages'] ?? 50)));
}

function steamDbConnection(): PDO
{
    static $connection = null;

    if ($connection instanceof PDO) {
        return $connection;
    }

    // The accounts store (accounts_db: the shared Postgres since 2026-09-30,
    // so csprice.eu and tf2price.eu share one login) holds steam_users too;
    // a machine without it (local XAMPP) falls back to its own db.
    try {
        $connection = dbPdoConnection('steam_db', 'accounts_db');
    } catch (Throwable) {
        $connection = dbPdoConnection('accounts_db', 'db');
    }

    return $connection;
}

function steamEnsureCacheTables(): void
{
    static $ensured = false;

    if ($ensured) {
        return;
    }

    $connection = steamDbConnection();
    $driver = pdoDriverName($connection);

    if ($driver === 'sqlsrv') {
        $statements = [
            <<<'SQL'
IF OBJECT_ID(N'steam_users', N'U') IS NULL
BEGIN
    CREATE TABLE steam_users (
        steamid NVARCHAR(32) NOT NULL PRIMARY KEY,
        persona_name NVARCHAR(255) NOT NULL,
        avatar NVARCHAR(2048) NULL,
        profile_url NVARCHAR(2048) NULL,
        custom_url NVARCHAR(255) NULL,
        member_since NVARCHAR(255) NULL,
        state_message NVARCHAR(MAX) NULL,
        visibility_state NVARCHAR(50) NULL,
        last_profile_sync_at DATETIME2 NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
SQL,
            <<<'SQL'
IF OBJECT_ID(N'steam_inventory_cache', N'U') IS NULL
BEGIN
    CREATE TABLE steam_inventory_cache (
        steamid NVARCHAR(32) NOT NULL PRIMARY KEY,
        total_inventory_count INT NOT NULL DEFAULT 0,
        synced_asset_count INT NOT NULL DEFAULT 0,
        page_count INT NOT NULL DEFAULT 0,
        cache_status NVARCHAR(32) NOT NULL DEFAULT 'cold',
        last_full_sync_at DATETIME2 NULL,
        last_requested_at DATETIME2 NULL,
        last_error NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
SQL,
            <<<'SQL'
IF OBJECT_ID(N'steam_inventory_items', N'U') IS NULL
BEGIN
    CREATE TABLE steam_inventory_items (
        steamid NVARCHAR(32) NOT NULL,
        asset_id NVARCHAR(64) NOT NULL,
        class_id NVARCHAR(64) NULL,
        instance_id NVARCHAR(64) NULL,
        amount INT NOT NULL DEFAULT 1,
        market_hash_name NVARCHAR(255) NOT NULL,
        display_name NVARCHAR(255) NOT NULL,
        item_type NVARCHAR(255) NULL,
        name_color NVARCHAR(32) NULL,
        icon_url NVARCHAR(2048) NULL,
        tradable BIT NOT NULL DEFAULT 0,
        marketable BIT NOT NULL DEFAULT 0,
        market_url NVARCHAR(2048) NULL,
        first_seen_at DATETIME2 NOT NULL,
        last_seen_at DATETIME2 NOT NULL,
        sync_token NVARCHAR(64) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_steam_inventory_items PRIMARY KEY (steamid, asset_id)
    );
END
SQL,
            <<<'SQL'
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'idx_steam_inventory_items_seen'
      AND object_id = OBJECT_ID(N'steam_inventory_items')
)
BEGIN
    CREATE INDEX idx_steam_inventory_items_seen
    ON steam_inventory_items (steamid, last_seen_at);
END
SQL,
        ];
    } else {
        $statements = [
            <<<'SQL'
CREATE TABLE IF NOT EXISTS steam_users (
    steamid VARCHAR(32) NOT NULL PRIMARY KEY,
    persona_name VARCHAR(255) NOT NULL,
    avatar TEXT NULL,
    profile_url TEXT NULL,
    custom_url VARCHAR(255) NULL,
    member_since VARCHAR(255) NULL,
    state_message TEXT NULL,
    visibility_state VARCHAR(50) NULL,
    last_profile_sync_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS steam_inventory_cache (
    steamid VARCHAR(32) NOT NULL PRIMARY KEY,
    total_inventory_count INT NOT NULL DEFAULT 0,
    synced_asset_count INT NOT NULL DEFAULT 0,
    page_count INT NOT NULL DEFAULT 0,
    cache_status VARCHAR(32) NOT NULL DEFAULT 'cold',
    last_full_sync_at DATETIME NULL,
    last_requested_at DATETIME NULL,
    last_error TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS steam_inventory_items (
    steamid VARCHAR(32) NOT NULL,
    asset_id VARCHAR(64) NOT NULL,
    class_id VARCHAR(64) NULL,
    instance_id VARCHAR(64) NULL,
    amount INT NOT NULL DEFAULT 1,
    market_hash_name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    item_type VARCHAR(255) NULL,
    name_color VARCHAR(32) NULL,
    icon_url TEXT NULL,
    tradable TINYINT(1) NOT NULL DEFAULT 0,
    marketable TINYINT(1) NOT NULL DEFAULT 0,
    market_url TEXT NULL,
    first_seen_at DATETIME NOT NULL,
    last_seen_at DATETIME NOT NULL,
    sync_token VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (steamid, asset_id),
    INDEX idx_steam_inventory_items_seen (steamid, last_seen_at)
)
SQL,
        ];
    }

    foreach ($statements as $statement) {
        $connection->exec($statement);
    }

    $ensured = true;
}

function steamOpenIdEndpoint(): string
{
    return 'https://steamcommunity.com/openid/login';
}

function steamInventoryEndpoint(string $steamId, int $count = 36, ?string $startAssetId = null, int $appId = 730): string
{
    $query = [
        'l' => 'english',
        'count' => max(1, $count),
    ];

    if ($startAssetId !== null && trim($startAssetId) !== '') {
        $query['start_assetid'] = trim($startAssetId);
    }

    return sprintf(
        'https://steamcommunity.com/inventory/%s/%d/2?%s',
        rawurlencode($steamId),
        $appId,
        http_build_query($query, '', '&', PHP_QUERY_RFC3986)
    );
}

function steamCommunityProfileXmlUrl(string $steamId): string
{
    return sprintf('https://steamcommunity.com/profiles/%s/?xml=1', rawurlencode($steamId));
}

function steamMarketListingUrl(string $marketHashName, int $appId = 730, string $language = 'english'): string
{
    return sprintf(
        'https://steamcommunity.com/market/listings/%d/%s?l=%s',
        $appId,
        rawurlencode($marketHashName),
        rawurlencode($language)
    );
}

function steamNormalizeProfileText(string $value): string
{
    $decoded = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $decoded = preg_replace('/<br\s*\/?>/i', "\n", $decoded);
    $decoded = strip_tags((string)$decoded);
    $decoded = preg_replace("/\r\n?/", "\n", (string)$decoded);
    $decoded = preg_replace("/\n{3,}/", "\n\n", (string)$decoded);
    return trim((string)$decoded);
}

function steamCachedProfileFromRow(array $row): array
{
    return [
        'steamid' => (string)($row['steamid'] ?? ''),
        'persona_name' => (string)($row['persona_name'] ?? 'Steam User'),
        'avatar' => trim((string)($row['avatar'] ?? '')),
        'profile_url' => trim((string)($row['profile_url'] ?? '')),
        'custom_url' => trim((string)($row['custom_url'] ?? '')),
        'member_since' => trim((string)($row['member_since'] ?? '')),
        'state_message' => (string)($row['state_message'] ?? ''),
        'visibility_state' => trim((string)($row['visibility_state'] ?? '')),
    ];
}

function steamLoadCachedProfile(string $steamId): ?array
{
    steamEnsureCacheTables();

    $statement = steamDbConnection()->prepare(
        'SELECT steamid, persona_name, avatar, profile_url, custom_url, member_since, state_message, visibility_state, last_profile_sync_at
         FROM steam_users
         WHERE steamid = ?'
    );
    $statement->execute([$steamId]);
    $row = $statement->fetch();

    if (!is_array($row)) {
        return null;
    }

    $profile = steamCachedProfileFromRow($row);
    $profile['last_profile_sync_at'] = (string)($row['last_profile_sync_at'] ?? '');
    return $profile;
}

function steamProfileIsFresh(?array $profile): bool
{
    if (!is_array($profile) || empty($profile['last_profile_sync_at'])) {
        return false;
    }

    $timestamp = strtotime((string)$profile['last_profile_sync_at']);
    if ($timestamp === false) {
        return false;
    }

    return (time() - $timestamp) <= steamProfileCacheTtlSeconds();
}

function steamSaveProfileCache(array $profile): void
{
    steamEnsureCacheTables();

    $connection = steamDbConnection();
    $now = dbNowUtc();
    $steamId = (string)($profile['steamid'] ?? '');
    if ($steamId === '') {
        return;
    }

    $existsStatement = $connection->prepare('SELECT COUNT(*) FROM steam_users WHERE steamid = ?');
    $existsStatement->execute([$steamId]);
    $exists = (int)$existsStatement->fetchColumn() > 0;

    if ($exists) {
        $statement = $connection->prepare(
            'UPDATE steam_users
             SET persona_name = ?, avatar = ?, profile_url = ?, custom_url = ?, member_since = ?, state_message = ?, visibility_state = ?, last_profile_sync_at = ?, updated_at = ?
             WHERE steamid = ?'
        );
        $statement->execute([
            (string)($profile['persona_name'] ?? 'Steam User'),
            trim((string)($profile['avatar'] ?? '')),
            trim((string)($profile['profile_url'] ?? '')),
            trim((string)($profile['custom_url'] ?? '')),
            trim((string)($profile['member_since'] ?? '')),
            (string)($profile['state_message'] ?? ''),
            trim((string)($profile['visibility_state'] ?? '')),
            $now,
            $now,
            $steamId,
        ]);
        return;
    }

    $statement = $connection->prepare(
        'INSERT INTO steam_users (
            steamid, persona_name, avatar, profile_url, custom_url, member_since, state_message, visibility_state, last_profile_sync_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $statement->execute([
        $steamId,
        (string)($profile['persona_name'] ?? 'Steam User'),
        trim((string)($profile['avatar'] ?? '')),
        trim((string)($profile['profile_url'] ?? '')),
        trim((string)($profile['custom_url'] ?? '')),
        trim((string)($profile['member_since'] ?? '')),
        (string)($profile['state_message'] ?? ''),
        trim((string)($profile['visibility_state'] ?? '')),
        $now,
        $now,
        $now,
    ]);
}

function httpTextRequestWithStatus(string $url, array $headers = [], int $timeoutSeconds = 20): array
{
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => $timeoutSeconds,
        CURLOPT_CONNECTTIMEOUT => min(10, $timeoutSeconds),
        CURLOPT_FOLLOWLOCATION => true,
        // A stale auth cookie can make a site bounce the request through a
        // login/refresh redirect forever; fail fast instead of crawling 20 hops.
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

function postFormTextRequestWithStatus(string $url, array $fields, array $headers = [], int $timeoutSeconds = 20): array
{
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($fields, '', '&', PHP_QUERY_RFC3986),
        CURLOPT_HTTPHEADER => array_merge([
            'Content-Type: application/x-www-form-urlencoded',
        ], $headers),
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

/**
 * Runs an INSERT and returns the new row's id on any driver. Postgres gets
 * `RETURNING id` (the pooled connection makes lastInsertId's CURRVAL
 * unreliable); MySQL keeps lastInsertId. The accounts moved to the shared
 * Postgres on 2026-09-30 so csprice.eu and tf2price.eu share one users table.
 */
function dbInsertReturningId(PDO $pdo, string $sql, array $params): int
{
    if (pdoDriverName($pdo) === 'pgsql') {
        $statement = $pdo->prepare(rtrim($sql, "; \n\r\t") . ' RETURNING id');
        $statement->execute($params);
        return (int)$statement->fetchColumn();
    }
    $pdo->prepare($sql)->execute($params);
    return (int)$pdo->lastInsertId();
}

function steamLoginUrl(): string
{
    $realm = absoluteAppUrl('');
    $returnTo = absoluteAppUrl('steam_auth_callback.php');

    $params = [
        'openid.ns' => 'http://specs.openid.net/auth/2.0',
        'openid.mode' => 'checkid_setup',
        'openid.return_to' => $returnTo,
        'openid.realm' => $realm,
        'openid.identity' => 'http://specs.openid.net/auth/2.0/identifier_select',
        'openid.claimed_id' => 'http://specs.openid.net/auth/2.0/identifier_select',
    ];

    return steamOpenIdEndpoint() . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
}

function steamSafeReturnPath(?string $value): string
{
    // Where a sign-in lands when no usable page was given: the home page.
    // The site root ("/") is the home page too, so a Login click there comes
    // back to the home, not to the inventory page (login.html), which is
    // what the user saw after Google and Discord sign-ins (2026-09-30).
    $fallback = 'index.html';
    $rawValue = trim((string)($value ?? ''));

    if ($rawValue === '' || preg_match('/[\x00-\x1F\x7F]/', $rawValue)) {
        return $fallback;
    }

    $parts = parse_url($rawValue);
    if ($parts === false) {
        return $fallback;
    }

    $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    $targetHost = strtolower((string)($parts['host'] ?? ''));
    if ($targetHost !== '' && $host !== '' && $targetHost !== $host) {
        return $fallback;
    }

    $path = str_replace('\\', '/', (string)($parts['path'] ?? ''));
    $basePath = appBasePath();

    if ($path === '' || $path === '/') {
        $path = $fallback;
    } elseif (str_starts_with($path, '/')) {
        if ($basePath !== '' && $path === $basePath) {
            $path = 'index.html';
        } elseif ($basePath !== '' && str_starts_with($path, $basePath . '/')) {
            $path = substr($path, strlen($basePath) + 1);
        } elseif ($basePath === '') {
            $path = ltrim($path, '/');
        } else {
            return $fallback;
        }
    } else {
        $path = ltrim($path, './');
    }

    $path = ltrim($path, '/');
    if ($path === '' || preg_match('#(^|/)\.\.(/|$)#', $path)) {
        return $fallback;
    }

    if (preg_match('#^(steam_auth_callback|steam_login|steam_logout|google_login|google_callback|discord_login|discord_callback)\.php$#i', $path)) {
        return $fallback;
    }

    $query = isset($parts['query']) && (string)$parts['query'] !== ''
        ? '?' . (string)$parts['query']
        : '';
    $fragment = isset($parts['fragment']) && (string)$parts['fragment'] !== ''
        ? '#' . rawurlencode((string)$parts['fragment'])
        : '';

    return $path . $query . $fragment;
}

function steamReturnPathWithAuthStatus(string $returnPath, string $status): string
{
    $target = steamSafeReturnPath($returnPath);
    $fragment = '';
    $hashPosition = strpos($target, '#');
    if ($hashPosition !== false) {
        $fragment = substr($target, $hashPosition);
        $target = substr($target, 0, $hashPosition);
    }

    $separator = str_contains($target, '?') ? '&' : '?';
    return $target . $separator . 'auth=' . rawurlencode($status) . $fragment;
}

function steamExtractIdFromClaimedId(string $claimedId): ?string
{
    if (preg_match('#^https?://steamcommunity\.com/openid/id/(\d{17,25})$#i', trim($claimedId), $matches)) {
        return $matches[1];
    }

    return null;
}

function steamValidateAssertion(array $query): ?string
{
    $claimedId = (string)($query['openid_claimed_id'] ?? $query['openid_identity'] ?? '');
    $steamId = steamExtractIdFromClaimedId($claimedId);
    if ($steamId === null) {
        return null;
    }

    $validationPayload = [];
    foreach ($query as $key => $value) {
        if (!str_starts_with((string)$key, 'openid_')) {
            continue;
        }

        $validationPayload['openid.' . substr((string)$key, 7)] = (string)$value;
    }
    $validationPayload['openid.mode'] = 'check_authentication';

    $response = postFormTextRequestWithStatus(
        steamOpenIdEndpoint(),
        $validationPayload,
        ['User-Agent: Mozilla/5.0'],
        20
    );

    if ($response['status'] >= 400 || !str_contains($response['body'], 'is_valid:true')) {
        return null;
    }

    return $steamId;
}

function steamFetchCommunityProfileLive(string $steamId): ?array
{
    $response = httpTextRequestWithStatus(
        steamCommunityProfileXmlUrl($steamId),
        ['User-Agent: Mozilla/5.0', 'Accept: application/xml,text/xml;q=0.9,*/*;q=0.8'],
        20
    );

    if ($response['status'] >= 400) {
        return null;
    }

    $xml = @simplexml_load_string($response['body']);
    if ($xml === false) {
        return null;
    }

    $customUrl = trim((string)($xml->customURL ?? ''));
    $profileUrl = $customUrl !== ''
        ? 'https://steamcommunity.com/id/' . rawurlencode($customUrl)
        : 'https://steamcommunity.com/profiles/' . rawurlencode($steamId);

    return [
        'steamid' => $steamId,
        'persona_name' => steamNormalizeProfileText((string)($xml->steamID ?? 'Steam User')),
        'avatar' => trim((string)($xml->avatarFull ?? $xml->avatarMedium ?? $xml->avatarIcon ?? '')),
        'profile_url' => $profileUrl,
        'custom_url' => $customUrl,
        'member_since' => steamNormalizeProfileText((string)($xml->memberSince ?? '')),
        'state_message' => steamNormalizeProfileText((string)($xml->stateMessage ?? '')),
        'visibility_state' => trim((string)($xml->visibilityState ?? '')),
    ];
}

function steamFetchCommunityProfile(string $steamId, bool $forceRefresh = false): ?array
{
    $cached = null;
    try {
        $cached = steamLoadCachedProfile($steamId);
    } catch (Throwable) {
        $cached = null;
    }

    if (!$forceRefresh && steamProfileIsFresh($cached)) {
        unset($cached['last_profile_sync_at']);
        return $cached;
    }

    $profile = steamFetchCommunityProfileLive($steamId);
    if (is_array($profile)) {
        try {
            steamSaveProfileCache($profile);
        } catch (Throwable) {
            // A cache write failure should not block a successful Steam login.
        }

        return $profile;
    }

    if (is_array($cached)) {
        unset($cached['last_profile_sync_at']);
        return $cached;
    }

    return null;
}

function steamInventoryWearFromText(string $value): string
{
    if (preg_match('/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/iu', trim($value), $match)) {
        return (string)$match[1];
    }

    return '';
}

function steamInventoryTagValue(array $description, array $categories): string
{
    $wanted = [];
    foreach ($categories as $category) {
        $wanted[strtolower(trim((string)$category))] = true;
    }

    $tags = is_array($description['tags'] ?? null) ? $description['tags'] : [];
    foreach ($tags as $tag) {
        if (!is_array($tag)) {
            continue;
        }

        $category = strtolower(trim((string)($tag['category'] ?? '')));
        $localized = strtolower(trim((string)($tag['localized_category_name'] ?? '')));
        $internal = strtolower(trim((string)($tag['internal_name'] ?? '')));
        $isExteriorInternal = isset($wanted['exterior']) && str_starts_with($internal, 'wearcategory');
        if (!isset($wanted[$category]) && !isset($wanted[$localized]) && !$isExteriorInternal) {
            continue;
        }

        $label = trim((string)($tag['localized_tag_name'] ?? $tag['name'] ?? ''));
        if ($label !== '') {
            return $label;
        }
    }

    return '';
}

/**
 * Steam's `name` is wear-less ("AUG | Eye of Zapems"). Market listings and
 * priceoverview require the full hash, including StatTrak/Souvenir + exterior.
 *
 * @return array{market_hash_name: string, display_name: string, exterior: string}
 */
function steamBuildInventoryMarketIdentity(array $description): array
{
    $rawHash = trim((string)($description['market_hash_name'] ?? ''));
    $marketName = trim((string)($description['market_name'] ?? ''));
    $displayName = trim((string)($description['name'] ?? ''));
    $candidate = $rawHash !== '' ? $rawHash : ($marketName !== '' ? $marketName : $displayName);

    $exterior = steamInventoryWearFromText($rawHash);
    if ($exterior === '') {
        $exterior = steamInventoryWearFromText($marketName);
    }
    if ($exterior === '') {
        $exterior = steamInventoryWearFromText($candidate);
    }
    if ($exterior === '') {
        $tagExterior = steamInventoryTagValue($description, ['Exterior']);
        if (preg_match('/^(Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)$/iu', $tagExterior)) {
            $exterior = $tagExterior;
        }
    }

    if ($rawHash !== '' && steamInventoryWearFromText($rawHash) !== '') {
        return [
            'market_hash_name' => $rawHash,
            'display_name' => $displayName !== '' ? $displayName : $rawHash,
            'exterior' => $exterior,
        ];
    }

    $quality = steamInventoryTagValue($description, ['Quality']);
    $haystack = $quality . ' ' . $candidate . ' ' . $displayName;
    $isStatTrak = (bool)preg_match('/stattrak/iu', $haystack);
    $isSouvenir = (bool)preg_match('/souvenir/iu', $haystack);

    $base = $candidate !== '' ? $candidate : $displayName;
    $base = trim((string)preg_replace(
        '/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/iu',
        '',
        $base
    ));
    if ($base === '') {
        $base = 'Unknown Item';
    }

    if ($isStatTrak && !preg_match('/^stat.?trak/iu', $base) && !str_contains($base, 'StatTrak')) {
        $base = "StatTrak™ " . $base;
    } elseif ($isSouvenir && !preg_match('/^souvenir\b/iu', $base)) {
        $base = 'Souvenir ' . $base;
    }

    $marketHashName = $exterior !== '' && steamInventoryWearFromText($base) === ''
        ? $base . ' (' . $exterior . ')'
        : $base;

    return [
        'market_hash_name' => $marketHashName,
        'display_name' => $displayName !== '' ? $displayName : $marketHashName,
        'exterior' => $exterior,
    ];
}

function steamNormalizeInventoryItem(array $asset, array $description, int $appId = 730): array
{
    $identity = steamBuildInventoryMarketIdentity($description);
    $marketHashName = $identity['market_hash_name'];
    $icon = trim((string)($description['icon_url_large'] ?? $description['icon_url'] ?? ''));
    if ($icon !== '' && !str_starts_with($icon, 'http')) {
        $icon = 'https://community.cloudflare.steamstatic.com/economy/image/' . ltrim($icon, '/');
    }

    $tradable = (int)($description['tradable'] ?? 0) === 1;
    $marketable = (int)($description['marketable'] ?? 0) === 1;

    // TF2: an unusual's effect is a description line ("★ Unusual Effect: Burning
    // Flames"); the market name alone ("Unusual Team Captain") does not carry it.
    $effect = '';
    foreach ((array)($description['descriptions'] ?? []) as $line) {
        $value = is_array($line) ? trim((string)($line['value'] ?? '')) : '';
        if ($value !== '' && preg_match('/Unusual Effect:\s*(.+?)\s*$/u', $value, $m)) {
            $effect = $m[1];
            break;
        }
    }

    return [
        'asset_id' => (string)($asset['assetid'] ?? $asset['id'] ?? ''),
        'class_id' => (string)($asset['classid'] ?? ''),
        'instance_id' => (string)($asset['instanceid'] ?? ''),
        'amount' => (int)($asset['amount'] ?? 1),
        'name' => $marketHashName,
        'market_hash_name' => $marketHashName,
        'display_name' => $identity['display_name'],
        'exterior' => $identity['exterior'],
        'type' => (string)($description['type'] ?? ''),
        'name_color' => (string)($description['name_color'] ?? ''),
        'icon' => $icon,
        'tradable' => $tradable,
        'marketable' => $marketable,
        'effect' => $effect,
        // TF2 only: quality, slot and craftability pick the metal fallback price
        // for items Steam does not sell (tf2_inventory_helpers.php).
        'quality' => $appId === 440 ? steamInventoryTagValue($description, ['Quality']) : '',
        'slot' => $appId === 440 ? steamInventoryTagValue($description, ['Type']) : '',
        'craftable' => $appId === 440 ? steamTf2Craftable($description) : true,
        'market_url' => $marketable ? steamMarketListingUrl($marketHashName, $appId) : '',
    ];
}

/** TF2: an uncraftable item carries a "( Not Usable in Crafting )" description line. */
function steamTf2Craftable(array $description): bool
{
    foreach ((array)($description['descriptions'] ?? []) as $line) {
        $value = is_array($line) ? (string)($line['value'] ?? '') : '';
        if ($value !== '' && stripos($value, 'Not Usable in Crafting') !== false) {
            return false;
        }
    }
    return true;
}

function steamCachedInventoryItemFromRow(array $row): array
{
    $marketHashName = trim((string)($row['market_hash_name'] ?? ''));
    $displayName = trim((string)($row['display_name'] ?? ''));
    $exterior = steamInventoryWearFromText($marketHashName);

    return [
        'asset_id' => (string)($row['asset_id'] ?? ''),
        'class_id' => (string)($row['class_id'] ?? ''),
        'instance_id' => (string)($row['instance_id'] ?? ''),
        'amount' => (int)($row['amount'] ?? 1),
        'name' => $marketHashName,
        'market_hash_name' => $marketHashName,
        'display_name' => $displayName !== '' ? $displayName : $marketHashName,
        'exterior' => $exterior,
        'type' => (string)($row['item_type'] ?? ''),
        'name_color' => (string)($row['name_color'] ?? ''),
        'icon' => trim((string)($row['icon_url'] ?? '')),
        'tradable' => (int)($row['tradable'] ?? 0) === 1,
        'marketable' => (int)($row['marketable'] ?? 0) === 1,
        'market_url' => trim((string)($row['market_url'] ?? '')),
    ];
}

function steamInventoryCacheMeta(string $steamId): ?array
{
    steamEnsureCacheTables();

    $statement = steamDbConnection()->prepare(
        'SELECT steamid, total_inventory_count, synced_asset_count, page_count, cache_status, last_full_sync_at, last_requested_at, last_error
         FROM steam_inventory_cache
         WHERE steamid = ?'
    );
    $statement->execute([$steamId]);
    $row = $statement->fetch();

    return is_array($row) ? $row : null;
}

function steamCachedInventoryItems(string $steamId): array
{
    steamEnsureCacheTables();

    $statement = steamDbConnection()->prepare(
        'SELECT asset_id, class_id, instance_id, amount, market_hash_name, display_name, item_type, name_color, icon_url, tradable, marketable, market_url
         FROM steam_inventory_items
         WHERE steamid = ?
         ORDER BY display_name ASC, asset_id ASC'
    );
    $statement->execute([$steamId]);

    $items = [];
    foreach ($statement->fetchAll() as $row) {
        if (!is_array($row)) {
            continue;
        }

        $items[] = steamCachedInventoryItemFromRow($row);
    }

    return $items;
}

function steamInventoryCacheIsFresh(?array $meta): bool
{
    if (!is_array($meta) || empty($meta['last_full_sync_at'])) {
        return false;
    }

    $timestamp = strtotime((string)$meta['last_full_sync_at']);
    if ($timestamp === false) {
        return false;
    }

    return (time() - $timestamp) <= steamInventoryCacheTtlSeconds();
}

function steamUpsertInventoryCacheMeta(
    string $steamId,
    int $totalInventoryCount,
    int $syncedAssetCount,
    int $pageCount,
    string $cacheStatus,
    ?string $lastFullSyncAt,
    ?string $lastError
): void {
    steamEnsureCacheTables();

    $connection = steamDbConnection();
    $now = dbNowUtc();
    $existsStatement = $connection->prepare('SELECT COUNT(*) FROM steam_inventory_cache WHERE steamid = ?');
    $existsStatement->execute([$steamId]);
    $exists = (int)$existsStatement->fetchColumn() > 0;

    if ($exists) {
        $statement = $connection->prepare(
            'UPDATE steam_inventory_cache
             SET total_inventory_count = ?, synced_asset_count = ?, page_count = ?, cache_status = ?, last_full_sync_at = ?, last_requested_at = ?, last_error = ?, updated_at = ?
             WHERE steamid = ?'
        );
        $statement->execute([
            $totalInventoryCount,
            $syncedAssetCount,
            $pageCount,
            $cacheStatus,
            $lastFullSyncAt,
            $now,
            $lastError,
            $now,
            $steamId,
        ]);
        return;
    }

    $statement = $connection->prepare(
        'INSERT INTO steam_inventory_cache (
            steamid, total_inventory_count, synced_asset_count, page_count, cache_status, last_full_sync_at, last_requested_at, last_error, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $statement->execute([
        $steamId,
        $totalInventoryCount,
        $syncedAssetCount,
        $pageCount,
        $cacheStatus,
        $lastFullSyncAt,
        $now,
        $lastError,
        $now,
        $now,
    ]);
}

function steamFetchAllInventoryPages(string $steamId): array
{
    $cursor = null;
    $allItems = [];
    $seenAssetIds = [];
    $pageCount = 0;
    $totalInventoryCount = 0;

    while ($pageCount < steamInventoryMaxPages()) {
        $page = steamFetchInventory($steamId, steamInventoryPageSize(), $cursor);
        $items = is_array($page['items'] ?? null) ? $page['items'] : [];

        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }

            $assetId = (string)($item['asset_id'] ?? '');
            if ($assetId !== '' && isset($seenAssetIds[$assetId])) {
                continue;
            }

            if ($assetId !== '') {
                $seenAssetIds[$assetId] = true;
            }

            $allItems[] = $item;
        }

        $pageCount += 1;
        $totalInventoryCount = max($totalInventoryCount, (int)($page['total_inventory_count'] ?? count($allItems)));

        $nextCursor = isset($page['last_assetid']) ? trim((string)$page['last_assetid']) : '';
        if (empty($page['more_items']) || $nextCursor === '' || $nextCursor === (string)$cursor) {
            break;
        }

        $cursor = $nextCursor;
    }

    return [
        'items' => $allItems,
        'total_inventory_count' => max($totalInventoryCount, count($allItems)),
        'page_count' => $pageCount,
    ];
}

function steamPersistInventoryCache(string $steamId, array $payload): void
{
    steamEnsureCacheTables();

    $connection = steamDbConnection();
    $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
    $now = dbNowUtc();
    $syncToken = bin2hex(random_bytes(12));

    $existingStatement = $connection->prepare('SELECT asset_id FROM steam_inventory_items WHERE steamid = ?');
    $existingStatement->execute([$steamId]);
    $existingAssetIds = [];
    foreach ($existingStatement->fetchAll(PDO::FETCH_COLUMN) as $assetId) {
        $existingAssetIds[(string)$assetId] = true;
    }

    $updateStatement = $connection->prepare(
        'UPDATE steam_inventory_items
         SET class_id = ?, instance_id = ?, amount = ?, market_hash_name = ?, display_name = ?, item_type = ?, name_color = ?, icon_url = ?, tradable = ?, marketable = ?, market_url = ?, last_seen_at = ?, sync_token = ?, updated_at = ?
         WHERE steamid = ? AND asset_id = ?'
    );
    $insertStatement = $connection->prepare(
        'INSERT INTO steam_inventory_items (
            steamid, asset_id, class_id, instance_id, amount, market_hash_name, display_name, item_type, name_color, icon_url, tradable, marketable, market_url, first_seen_at, last_seen_at, sync_token, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $deleteStatement = $connection->prepare('DELETE FROM steam_inventory_items WHERE steamid = ? AND sync_token <> ?');

    $connection->beginTransaction();
    try {
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }

            $assetId = (string)($item['asset_id'] ?? '');
            if ($assetId === '') {
                continue;
            }

            $parameters = [
                (string)($item['class_id'] ?? ''),
                (string)($item['instance_id'] ?? ''),
                max(1, (int)($item['amount'] ?? 1)),
                (string)($item['name'] ?? ''),
                (string)($item['display_name'] ?? $item['name'] ?? ''),
                (string)($item['type'] ?? ''),
                (string)($item['name_color'] ?? ''),
                trim((string)($item['icon'] ?? '')),
                dbBooleanLiteral((bool)($item['tradable'] ?? false)),
                dbBooleanLiteral((bool)($item['marketable'] ?? false)),
                trim((string)($item['market_url'] ?? '')),
                $now,
                $syncToken,
                $now,
                $steamId,
                $assetId,
            ];

            if (isset($existingAssetIds[$assetId])) {
                $updateStatement->execute($parameters);
                continue;
            }

            $insertStatement->execute([
                $steamId,
                $assetId,
                (string)($item['class_id'] ?? ''),
                (string)($item['instance_id'] ?? ''),
                max(1, (int)($item['amount'] ?? 1)),
                (string)($item['name'] ?? ''),
                (string)($item['display_name'] ?? $item['name'] ?? ''),
                (string)($item['type'] ?? ''),
                (string)($item['name_color'] ?? ''),
                trim((string)($item['icon'] ?? '')),
                dbBooleanLiteral((bool)($item['tradable'] ?? false)),
                dbBooleanLiteral((bool)($item['marketable'] ?? false)),
                trim((string)($item['market_url'] ?? '')),
                $now,
                $now,
                $syncToken,
                $now,
                $now,
            ]);
        }

        $deleteStatement->execute([$steamId, $syncToken]);

        steamUpsertInventoryCacheMeta(
            $steamId,
            max((int)($payload['total_inventory_count'] ?? count($items)), count($items)),
            count($items),
            (int)($payload['page_count'] ?? 1),
            'fresh',
            $now,
            null
        );

        $connection->commit();
    } catch (Throwable $exception) {
        if ($connection->inTransaction()) {
            $connection->rollBack();
        }

        steamUpsertInventoryCacheMeta(
            $steamId,
            0,
            0,
            0,
            'error',
            null,
            $exception->getMessage()
        );

        throw $exception;
    }
}

function steamCachedInventoryResponse(string $steamId, array $meta, array $items, bool $stale = false, bool $fallback = false): array
{
    return [
        'total_inventory_count' => max((int)($meta['total_inventory_count'] ?? count($items)), count($items)),
        'success' => true,
        'more_items' => false,
        'last_assetid' => null,
        'items' => $items,
        'page_count' => (int)($meta['page_count'] ?? 1),
        'synced_asset_count' => (int)($meta['synced_asset_count'] ?? count($items)),
        'source' => $fallback ? 'cache_fallback' : 'cache',
        'cached' => true,
        'stale' => $stale,
        'last_synced_at' => (string)($meta['last_full_sync_at'] ?? ''),
        'last_requested_at' => (string)($meta['last_requested_at'] ?? ''),
        'last_error' => (string)($meta['last_error'] ?? ''),
    ];
}

function steamSyncInventoryCache(string $steamId, bool $forceRefresh = false): array
{
    $meta = [];
    $cachedItems = [];
    $cacheError = '';

    // The cache is an optimisation only. A missing or broken database must never
    // stop a live Steam inventory from being returned.
    try {
        steamEnsureCacheTables();
        $meta = steamInventoryCacheMeta($steamId) ?? [];
        $cachedItems = steamCachedInventoryItems($steamId);
    } catch (Throwable $exception) {
        $cacheError = $exception->getMessage();
        $meta = [];
        $cachedItems = [];
    }

    if (!$forceRefresh && $cachedItems) {
        return steamCachedInventoryResponse(
            $steamId,
            $meta,
            $cachedItems,
            !steamInventoryCacheIsFresh($meta),
            false
        );
    }

    try {
        $payload = steamFetchAllInventoryPages($steamId);
    } catch (Throwable $exception) {
        if ($cachedItems) {
            return steamCachedInventoryResponse($steamId, $meta, $cachedItems, true, true);
        }

        throw $exception;
    }

    if ($cacheError === '') {
        try {
            steamPersistInventoryCache($steamId, $payload);
        } catch (Throwable $exception) {
            $cacheError = $exception->getMessage();
        }
    }

    return [
        'total_inventory_count' => max((int)($payload['total_inventory_count'] ?? count($payload['items'] ?? [])), count($payload['items'] ?? [])),
        'success' => true,
        'more_items' => false,
        'last_assetid' => null,
        'items' => is_array($payload['items'] ?? null) ? $payload['items'] : [],
        'page_count' => (int)($payload['page_count'] ?? 1),
        'synced_asset_count' => is_array($payload['items'] ?? null) ? count($payload['items']) : 0,
        'source' => 'steam',
        'cached' => false,
        'stale' => false,
        'last_synced_at' => dbNowUtc(),
        'last_requested_at' => dbNowUtc(),
        'last_error' => '',
        'cache_error' => $cacheError,
    ];
}

function steamFetchInventory(string $steamId, int $count = 36, ?string $startAssetId = null, int $appId = 730): array
{
    $response = httpJsonRequest(
        steamInventoryEndpoint($steamId, $count, $startAssetId, $appId),
        ['User-Agent: Mozilla/5.0', 'Accept: application/json, text/plain, */*'],
        25
    );

    if ($response['status'] >= 400) {
        throw new RuntimeException('Steam inventory request failed with status ' . $response['status'] . '.');
    }

    $payload = $response['json'];
    if (!is_array($payload)) {
        throw new RuntimeException('Steam inventory payload was not valid JSON.');
    }

    $assets = is_array($payload['assets'] ?? null) ? $payload['assets'] : [];
    $descriptions = is_array($payload['descriptions'] ?? null) ? $payload['descriptions'] : [];
    $descriptionMap = [];

    foreach ($descriptions as $description) {
        if (!is_array($description)) {
            continue;
        }

        $key = (string)($description['classid'] ?? '') . '_' . (string)($description['instanceid'] ?? '');
        $descriptionMap[$key] = $description;
    }

    $items = [];
    foreach ($assets as $asset) {
        if (!is_array($asset)) {
            continue;
        }

        $key = (string)($asset['classid'] ?? '') . '_' . (string)($asset['instanceid'] ?? '');
        $description = $descriptionMap[$key] ?? [];
        $items[] = steamNormalizeInventoryItem($asset, $description, $appId);

        if (count($items) >= $count) {
            break;
        }
    }

    return [
        'total_inventory_count' => (int)($payload['total_inventory_count'] ?? count($assets)),
        'success' => (bool)($payload['success'] ?? false),
        'more_items' => (bool)($payload['more_items'] ?? false),
        'last_assetid' => isset($payload['last_assetid']) ? (string)$payload['last_assetid'] : null,
        'items' => $items,
    ];
}

function steamNormalizeSessionUser(array $user): array
{
    $provider = strtolower(trim((string)($user['provider'] ?? '')));
    $steamId = preg_replace('/\D+/', '', (string)($user['steamid'] ?? '')) ?? '';
    if ($provider === '') {
        $provider = strlen($steamId) >= 17 ? 'steam' : '';
    }

    $displayName = trim((string)($user['persona_name'] ?? ''));
    if ($displayName === '') {
        $displayName = trim((string)($user['display_name'] ?? ''));
    }
    if ($displayName === '') {
        $displayName = trim((string)($user['name'] ?? ''));
    }
    if ($displayName === '') {
        $displayName = trim((string)($user['email'] ?? ''));
    }
    if ($displayName === '') {
        $displayName = $provider === 'google' ? 'Google User' : ($provider === 'discord' ? 'Discord User' : 'User');
    }

    $avatar = trim((string)($user['avatar'] ?? ''));
    if ($avatar === '') {
        $avatar = trim((string)($user['picture'] ?? ''));
    }
    if ($avatar === '') {
        $avatar = trim((string)($user['avatarfull'] ?? ''));
    }

    $user['provider'] = $provider !== '' ? $provider : 'steam';
    $user['persona_name'] = $displayName;
    $user['display_name'] = $displayName;
    $user['name'] = $displayName;
    $user['avatar'] = $avatar;
    $user['picture'] = $avatar;

    return $user;
}

function steamSessionUser(): ?array
{
    ensureSessionStarted();
    $steam = $_SESSION['steam_user'] ?? null;
    if (is_array($steam)) {
        return steamNormalizeSessionUser($steam);
    }

    $oauth = $_SESSION['auth_user'] ?? null;
    return is_array($oauth) ? steamNormalizeSessionUser($oauth) : null;
}

function storeSteamSessionUser(array $user): void
{
    ensureSessionStarted();
    unset($_SESSION['auth_user']);
    $_SESSION['steam_user'] = steamNormalizeSessionUser($user);
}

function clearSteamSessionUser(): void
{
    ensureSessionStarted();
    unset($_SESSION['steam_user'], $_SESSION['auth_user']);
}
