<?php
declare(strict_types=1);

function socialAvatarUrl(string $author): string
{
    $seed = trim($author) !== '' ? trim($author) : 'steam-user';
    return 'https://api.dicebear.com/7.x/thumbs/svg?seed=' . rawurlencode($seed);
}

function socialReadJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || $raw === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

/**
 * Posts are keyed by the item's name, not by the numeric catalog id: on hosts
 * without the local items table every page resolved to item_id 1, so a post on
 * one skin showed up on every other. All wears of a skin share one thread.
 */
function socialItemIdFromName(string $name): int
{
    $base = trim($name);
    $base = (string)preg_replace('/\s*\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/iu', '', $base);
    $base = mb_strtolower(trim((string)preg_replace('/\s+/u', ' ', $base)));
    if ($base === '') {
        return 0;
    }
    return max(2, crc32($base) & 0x7FFFFFFF);
}

function socialResolveItemId(array $payload): int
{
    $name = trim((string)($payload['item_name'] ?? ''));
    if ($name !== '') {
        $derived = socialItemIdFromName($name);
        if ($derived > 0) {
            return $derived;
        }
    }
    return max(1, (int)($payload['item_id'] ?? 1));
}

function socialRequestPayload(): array
{
    $contentType = (string)($_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '');
    if (stripos($contentType, 'multipart/form-data') !== false || ($_FILES !== [] && $_POST !== [])) {
        return [
            'item_id' => $_POST['item_id'] ?? null,
            'item_name' => $_POST['item_name'] ?? '',
            'post_id' => $_POST['post_id'] ?? null,
            'body' => $_POST['body'] ?? '',
            'sentiment' => $_POST['sentiment'] ?? null,
            'target_price' => $_POST['target_price'] ?? null,
            'action' => $_POST['action'] ?? null,
        ];
    }
    return socialReadJsonBody();
}

function socialSessionActorId(array $user): string
{
    $steamId = preg_replace('/\D+/', '', (string)($user['steamid'] ?? $user['steam_id'] ?? '')) ?? '';
    if (strlen($steamId) >= 17) {
        return substr($steamId, 0, 32);
    }

    $provider = strtolower(trim((string)($user['provider'] ?? '')));
    $providerId = preg_replace('/[^a-zA-Z0-9_\-]/', '', (string)($user['provider_id'] ?? $user['email'] ?? '')) ?? '';
    if ($provider !== '' && $providerId !== '') {
        return substr($provider[0] . $providerId, 0, 32);
    }

    return '';
}

function socialCurrentSteamSession(): ?array
{
    if (!function_exists('steamSessionUser')) {
        return null;
    }
    $user = steamSessionUser();
    if ($user === null) {
        return null;
    }

    $steamId = socialSessionActorId($user);
    if ($steamId === '') {
        return null;
    }

    $author = trim((string)($user['persona_name'] ?? $user['author'] ?? $user['display_name'] ?? 'User'));
    if ($author === '') {
        $author = 'User';
    }

    return [
        'steam_id' => $steamId,
        'author' => $author,
        'avatar_url' => trim((string)($user['avatar'] ?? $user['avatar_url'] ?? $user['picture'] ?? '')),
    ];
}

/**
 * Require an authenticated Steam/OAuth session for social write endpoints.
 * Always uses server session identity — never client-supplied display names.
 *
 * @return array{steam_id:string, author:string, avatar_url:string}
 */
function socialRequireSteamSession(): array
{
    $session = socialCurrentSteamSession();
    if ($session === null) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Not logged in. Sign in with Steam first.']);
        exit;
    }

    return $session;
}

function socialUploadDir(): string
{
    return __DIR__ . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'community';
}

function socialPublicImagePrefix(): string
{
    return 'uploads/community/';
}

function socialSanitizeImageUrl(mixed $raw): ?string
{
    $url = trim((string)$raw);
    if ($url === '') {
        return null;
    }
    if (!preg_match('#^uploads/community/[a-f0-9]{16,64}\.(jpe?g|png|webp|gif)$#i', $url)) {
        return null;
    }
    return $url;
}

function socialGenericBlockMessage(): string
{
    return 'This post was blocked because it may violate community guidelines.';
}

function ensureSocialTable(PDO $pdo): void
{
    $driver = pdoDriverName($pdo);
    if ($driver === 'sqlsrv') {
        $pdo->exec("
            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='item_social_posts')
            CREATE TABLE item_social_posts (
                id            BIGINT IDENTITY(1,1) PRIMARY KEY,
                item_id       INT NOT NULL,
                steam_id      VARCHAR(32) NOT NULL,
                author        NVARCHAR(128) NOT NULL DEFAULT '',
                avatar_url    NVARCHAR(512) NOT NULL DEFAULT '',
                sentiment     VARCHAR(10) NULL,
                target_price  DECIMAL(10,2) NULL,
                body          NVARCHAR(1000) NOT NULL,
                image_url     NVARCHAR(512) NULL,
                likes         INT NOT NULL DEFAULT 0,
                dislikes      INT NOT NULL DEFAULT 0,
                created_at    DATETIME2 NOT NULL DEFAULT GETUTCDATE()
            )
        ");
        $pdo->exec("
            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='item_social_comments')
            CREATE TABLE item_social_comments (
                id            BIGINT IDENTITY(1,1) PRIMARY KEY,
                post_id       BIGINT NOT NULL,
                item_id       INT NOT NULL,
                steam_id      VARCHAR(32) NOT NULL,
                author        NVARCHAR(128) NOT NULL DEFAULT '',
                avatar_url    NVARCHAR(512) NOT NULL DEFAULT '',
                body          NVARCHAR(1000) NOT NULL,
                image_url     NVARCHAR(512) NULL,
                created_at    DATETIME2 NOT NULL DEFAULT GETUTCDATE()
            )
        ");
    } elseif ($driver === 'pgsql') {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS item_social_posts (
                id            BIGSERIAL PRIMARY KEY,
                item_id       INTEGER NOT NULL,
                steam_id      VARCHAR(32) NOT NULL,
                author        VARCHAR(128) NOT NULL DEFAULT '',
                avatar_url    VARCHAR(512) NOT NULL DEFAULT '',
                sentiment     VARCHAR(10) NULL,
                target_price  DECIMAL(10,2) NULL,
                body          TEXT NOT NULL,
                image_url     VARCHAR(512) NULL,
                likes         INTEGER NOT NULL DEFAULT 0,
                dislikes      INTEGER NOT NULL DEFAULT 0,
                created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        ");
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_social_item ON item_social_posts (item_id, created_at DESC)");
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS item_social_comments (
                id            BIGSERIAL PRIMARY KEY,
                post_id       BIGINT NOT NULL,
                item_id       INTEGER NOT NULL,
                steam_id      VARCHAR(32) NOT NULL,
                author        VARCHAR(128) NOT NULL DEFAULT '',
                avatar_url    VARCHAR(512) NOT NULL DEFAULT '',
                body          TEXT NOT NULL,
                image_url     VARCHAR(512) NULL,
                created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        ");
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_social_comments_post ON item_social_comments (post_id, created_at ASC)");
    } else {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS item_social_posts (
                id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                item_id       INT NOT NULL,
                steam_id      VARCHAR(32) NOT NULL,
                author        VARCHAR(128) NOT NULL DEFAULT '',
                avatar_url    VARCHAR(512) NOT NULL DEFAULT '',
                sentiment     VARCHAR(10) NULL,
                target_price  DECIMAL(10,2) NULL,
                body          TEXT NOT NULL,
                image_url     VARCHAR(512) NULL,
                likes         INT NOT NULL DEFAULT 0,
                dislikes      INT NOT NULL DEFAULT 0,
                created_at    DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
                INDEX idx_social_item (item_id, created_at DESC)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS item_social_comments (
                id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                post_id       BIGINT UNSIGNED NOT NULL,
                item_id       INT NOT NULL,
                steam_id      VARCHAR(32) NOT NULL,
                author        VARCHAR(128) NOT NULL DEFAULT '',
                avatar_url    VARCHAR(512) NOT NULL DEFAULT '',
                body          TEXT NOT NULL,
                image_url     VARCHAR(512) NULL,
                created_at    DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
                INDEX idx_social_comments_post (post_id, created_at ASC)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
    }

    $imageDef = $driver === 'sqlsrv' ? 'NVARCHAR(512) NULL' : 'VARCHAR(512) NULL';
    ensureSocialColumn($pdo, 'item_social_posts', 'image_url', $imageDef);
    ensureSocialColumn($pdo, 'item_social_comments', 'image_url', $imageDef);
}

function ensureSocialColumn(PDO $pdo, string $table, string $column, string $definition): void
{
    if (dbColumnExists($pdo, $table, $column)) {
        return;
    }
    $driver = pdoDriverName($pdo);
    $sql = $driver === 'sqlsrv'
        ? "ALTER TABLE {$table} ADD {$column} {$definition}"
        : "ALTER TABLE {$table} ADD COLUMN {$column} {$definition}";
    try {
        $pdo->exec($sql);
    } catch (Throwable $e) {
        if (dbColumnExists($pdo, $table, $column)) {
            return;
        }
        throw $e;
    }
}

/**
 * @param list<string> $columns
 */
function socialPrepareInsert(PDO $pdo, string $table, array $columns): PDOStatement
{
    $driver = pdoDriverName($pdo);
    $colList = implode(', ', $columns);
    $placeholders = implode(', ', array_map(static fn(string $column): string => ':' . $column, $columns));
    if ($driver === 'sqlsrv') {
        $sql = "INSERT INTO {$table} ({$colList}) OUTPUT INSERTED.id, INSERTED.created_at VALUES ({$placeholders})";
    } elseif ($driver === 'pgsql') {
        $sql = "INSERT INTO {$table} ({$colList}) VALUES ({$placeholders}) RETURNING id, created_at";
    } else {
        $sql = "INSERT INTO {$table} ({$colList}) VALUES ({$placeholders})";
    }
    return $pdo->prepare($sql);
}

/**
 * @return array{id:int, created_at:string}
 */
function socialFetchInsertResult(PDO $pdo, PDOStatement $stmt): array
{
    $driver = pdoDriverName($pdo);
    if ($driver === 'sqlsrv' || $driver === 'pgsql') {
        $row = $stmt->fetch();
        return [
            'id' => (int)($row['id'] ?? 0),
            'created_at' => (string)($row['created_at'] ?? gmdate('Y-m-d\TH:i:s')),
        ];
    }

    return [
        'id' => (int)$pdo->lastInsertId(),
        'created_at' => gmdate('Y-m-d\TH:i:s'),
    ];
}

function socialCommentsTableExists(PDO $pdo): bool
{
    try {
        return dbTableExists($pdo, 'item_social_comments');
    } catch (Throwable) {
        return false;
    }
}

function formatSocialPostRow(array $row): array
{
    $author = (string)($row['author'] ?? 'Steam User');
    $avatar = trim((string)($row['avatar_url'] ?? ''));
    if ($avatar === '') {
        $avatar = socialAvatarUrl($author);
    }

    return [
        'id'           => (int)($row['id'] ?? 0),
        'item_id'      => (int)($row['item_id'] ?? 0),
        'steam_id'     => (string)($row['steam_id'] ?? ''),
        'author'       => $author,
        'avatar_url'   => $avatar,
        'sentiment'    => ($row['sentiment'] ?? null) !== null ? (string)$row['sentiment'] : null,
        'target_price' => ($row['target_price'] ?? null) !== null ? (float)$row['target_price'] : null,
        'body'         => (string)($row['body'] ?? ''),
        'image_url'    => socialSanitizeImageUrl($row['image_url'] ?? null),
        'likes'        => (int)($row['likes'] ?? 0),
        'dislikes'     => (int)($row['dislikes'] ?? 0),
        'created_at'   => (string)($row['created_at'] ?? ''),
        'comments'     => is_array($row['comments'] ?? null) ? $row['comments'] : [],
    ];
}

function formatSocialCommentRow(array $row): array
{
    $author = (string)($row['author'] ?? 'Steam User');
    $avatar = trim((string)($row['avatar_url'] ?? ''));
    if ($avatar === '') {
        $avatar = socialAvatarUrl($author);
    }

    return [
        'id'         => (int)($row['id'] ?? 0),
        'post_id'    => (int)($row['post_id'] ?? 0),
        'item_id'    => (int)($row['item_id'] ?? 0),
        'steam_id'   => (string)($row['steam_id'] ?? ''),
        'author'     => $author,
        'avatar_url' => $avatar,
        'body'       => (string)($row['body'] ?? ''),
        'image_url'  => socialSanitizeImageUrl($row['image_url'] ?? null),
        'created_at' => (string)($row['created_at'] ?? ''),
    ];
}

function socialFetchCommentsForPosts(PDO $pdo, array $postIds): array
{
    $postIds = array_values(array_filter(array_map('intval', $postIds), static fn(int $id): bool => $id > 0));
    if ($postIds === [] || !socialCommentsTableExists($pdo)) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($postIds), '?'));
    $driver = pdoDriverName($pdo);
    $order = $driver === 'sqlsrv' ? 'ORDER BY created_at ASC' : 'ORDER BY created_at ASC, id ASC';
    $stmt = $pdo->prepare("SELECT * FROM item_social_comments WHERE post_id IN ({$placeholders}) {$order}");
    $stmt->execute($postIds);
    $grouped = [];
    foreach ($stmt->fetchAll() as $row) {
        $comment = formatSocialCommentRow($row);
        $grouped[$comment['post_id']][] = $comment;
    }
    return $grouped;
}

function socialDeleteStoredImage(?string $publicUrl): void
{
    $safe = socialSanitizeImageUrl($publicUrl);
    if ($safe === null) {
        return;
    }
    $path = __DIR__ . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $safe);
    $root = realpath(socialUploadDir());
    $resolved = is_file($path) ? realpath($path) : false;
    if ($root === false || $resolved === false) {
        return;
    }
    if (!str_starts_with($resolved, $root)) {
        return;
    }
    @unlink($resolved);
}

/**
 * @return array{ok:bool, error?:string, path?:string, public_url?:string, mime?:string}
 */
function socialAcceptUploadedImage(array $file): array
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return ['ok' => true];
    }
    if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
        return ['ok' => false, 'error' => 'Could not upload that image. Please try another file.'];
    }

    $tmp = (string)($file['tmp_name'] ?? '');
    $size = (int)($file['size'] ?? 0);
    if ($tmp === '' || !is_uploaded_file($tmp)) {
        return ['ok' => false, 'error' => 'Could not upload that image. Please try another file.'];
    }
    if ($size <= 0 || $size > 5 * 1024 * 1024) {
        return ['ok' => false, 'error' => 'Images must be 5 MB or smaller.'];
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = strtolower((string)$finfo->file($tmp));
    $extMap = [
        'image/jpeg' => 'jpg',
        'image/jpg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
    ];
    if (!isset($extMap[$mime])) {
        return ['ok' => false, 'error' => 'Please attach a JPG, PNG, WEBP, or GIF image.'];
    }

    $info = @getimagesize($tmp);
    if (!is_array($info) || (int)($info[0] ?? 0) < 1 || (int)($info[1] ?? 0) < 1) {
        return ['ok' => false, 'error' => 'Please attach a valid image file.'];
    }

    $dir = socialUploadDir();
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        return ['ok' => false, 'error' => 'Could not store that image. Please try again.'];
    }

    $name = bin2hex(random_bytes(16)) . '.' . $extMap[$mime];
    $dest = $dir . DIRECTORY_SEPARATOR . $name;
    if (!@move_uploaded_file($tmp, $dest)) {
        return ['ok' => false, 'error' => 'Could not store that image. Please try again.'];
    }
    // PHP's upload temp files are 0600; on hosts where the web server is a
    // different user than PHP-FPM that serves as 403. Make it world-readable.
    @chmod($dest, 0644);

    return [
        'ok' => true,
        'path' => $dest,
        'public_url' => socialPublicImagePrefix() . $name,
        'mime' => $mime,
    ];
}

/**
 * Download a Giphy media URL and store it like a community upload.
 *
 * @return array{ok:bool, error?:string, path?:string, public_url?:string, mime?:string}
 */
function socialAcceptGiphyUrl(string $url): array
{
    require_once __DIR__ . '/giphy_helpers.php';

    if (!giphyIsAllowedMediaUrl($url)) {
        return ['ok' => false, 'error' => 'That GIF link is not allowed.'];
    }

    if (!function_exists('curl_init')) {
        return ['ok' => false, 'error' => 'Could not download that GIF. Please try again.'];
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_USERAGENT => 'CSGOPriceTracker/1.0',
    ]);
    $bin = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $contentType = strtolower((string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE));
    curl_close($ch);

    if ($bin === false || $bin === '' || $status < 200 || $status >= 300) {
        return ['ok' => false, 'error' => 'Could not download that GIF. Please try another.'];
    }
    if (strlen($bin) > 5 * 1024 * 1024) {
        return ['ok' => false, 'error' => 'Images must be 5 MB or smaller.'];
    }

    $tmp = tempnam(sys_get_temp_dir(), 'giphy_');
    if ($tmp === false || @file_put_contents($tmp, $bin) === false) {
        if ($tmp) {
            @unlink($tmp);
        }
        return ['ok' => false, 'error' => 'Could not store that GIF. Please try again.'];
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = strtolower((string)$finfo->file($tmp));
    if ($mime === '' && str_contains($contentType, 'image/gif')) {
        $mime = 'image/gif';
    }
    $extMap = [
        'image/jpeg' => 'jpg',
        'image/jpg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
    ];
    if (!isset($extMap[$mime])) {
        @unlink($tmp);
        return ['ok' => false, 'error' => 'Please attach a JPG, PNG, WEBP, or GIF image.'];
    }

    $info = @getimagesize($tmp);
    if (!is_array($info) || (int)($info[0] ?? 0) < 1 || (int)($info[1] ?? 0) < 1) {
        @unlink($tmp);
        return ['ok' => false, 'error' => 'Please attach a valid image file.'];
    }

    $dir = socialUploadDir();
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        @unlink($tmp);
        return ['ok' => false, 'error' => 'Could not store that GIF. Please try again.'];
    }

    $name = bin2hex(random_bytes(16)) . '.' . $extMap[$mime];
    $dest = $dir . DIRECTORY_SEPARATOR . $name;
    if (!@rename($tmp, $dest)) {
        if (!@copy($tmp, $dest)) {
            @unlink($tmp);
            return ['ok' => false, 'error' => 'Could not store that GIF. Please try again.'];
        }
        @unlink($tmp);
    }
    // tempnam() creates 0600 files; the web server must be able to read the result.
    @chmod($dest, 0644);

    return [
        'ok' => true,
        'path' => $dest,
        'public_url' => socialPublicImagePrefix() . $name,
        'mime' => $mime,
    ];
}

function socialRateLimitBlocked(string $steamId, string $bucket = 'publish', int $max = 10, int $windowSec = 600): bool
{
    $hash = hash('sha256', $bucket . '|' . $steamId);
    $file = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'csprice_social_rl_' . $hash . '.json';
    $now = time();
    $hits = [];
    if (is_file($file)) {
        $decoded = json_decode((string)@file_get_contents($file), true);
        if (is_array($decoded)) {
            foreach ($decoded as $ts) {
                if (is_numeric($ts) && (int)$ts > ($now - $windowSec)) {
                    $hits[] = (int)$ts;
                }
            }
        }
    }
    if (count($hits) >= $max) {
        return true;
    }
    $hits[] = $now;
    @file_put_contents($file, json_encode($hits), LOCK_EX);
    return false;
}
