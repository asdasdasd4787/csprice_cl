<?php
declare(strict_types=1);
/**
 * Shared profile plumbing for profile_api.php and steam_auth_callback.php.
 */

require_once __DIR__ . '/steam_auth_helpers.php';
require_once __DIR__ . '/oauth_auth_helpers.php';

const PROFILE_AVATAR_DIR = 'assets/avatars';
const PROFILE_AVATAR_MAX_BYTES = 3145728;   // 3 MB before re-encoding
const PROFILE_AVATAR_SIZE = 256;            // square, in px

/**
 * The row id auth_email.php put in the session, or 0 when the session is not
 * an email account. Used by steam_link.php, which only makes sense for one.
 */
function profileUserIdFromSession(?array $user): int
{
    if ($user === null) {
        return 0;
    }
    $provider = strtolower((string)($user['provider'] ?? ''));
    if ($provider === 'email') {
        return (int)($user['id'] ?? 0);
    }
    // Google and Discord accounts have a row keyed by their provider id
    // (created on first profile visit), so they can connect Steam / Discord
    // from the profile too.
    if (profileOauthProvider($user) !== '') {
        try {
            require_once __DIR__ . '/app_bootstrap.php';
            return profileResolveUserId(dbPdoConnection('accounts_db', 'db'), $user);
        } catch (Throwable $exception) {
            error_log('profileUserIdFromSession: ' . $exception->getMessage());
            return 0;
        }
    }
    return 0;
}

/** "google" / "discord" for an OAuth session that carries its provider id, else "". */
function profileOauthProvider(?array $user): string
{
    if ($user === null) {
        return '';
    }
    $provider = strtolower((string)($user['provider'] ?? ''));
    if (!in_array($provider, ['google', 'discord'], true)) {
        return '';
    }
    return trim((string)($user['provider_id'] ?? '')) !== '' ? $provider : '';
}

/** users.google_id / users.discord_id, added on first use (profile_schema.sql documents both). */
function profileOauthColumnsEnsure(PDO $pdo): void
{
    static $done = false;
    if ($done) {
        return;
    }
    foreach ([
        ['google_id', 'VARCHAR(64) NULL'],
        ['discord_id', 'VARCHAR(32) NULL'],
        ['discord_name', 'VARCHAR(80) NULL'],
    ] as [$column, $definition]) {
        try {
            if (!dbColumnExists($pdo, 'users', $column)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN $column $definition");
            }
        } catch (Throwable $exception) {
            error_log('profile: could not add users.' . $column . ' - ' . $exception->getMessage());
        }
    }
    $done = true;
}

/**
 * The row id for whoever is signed in, creating one for a Steam session that
 * has never had a profile before.
 *
 * Steam users authenticate entirely through Valve, so nothing ever wrote them
 * a row. They still get to set a username and an avatar, so the row is created
 * on first visit, keyed by steam_id, with their Steam persona and avatar as
 * the starting values.
 *
 * Returns 0 only when nobody is signed in.
 */
function profileResolveUserId(PDO $pdo, ?array $user): int
{
    if ($user === null) {
        return 0;
    }

    $provider = strtolower((string)($user['provider'] ?? ''));
    if ($provider === 'email') {
        return (int)($user['id'] ?? 0);
    }

    // Google / Discord: the row is found by the provider's own id, never by
    // e-mail address, so a Discord or Google account that happens to share an
    // address with an existing e-mail account cannot open that account. A
    // Discord id that the owner of an e-mail account connected on their
    // profile (users.discord_id) does lead back to that account.
    $oauth = profileOauthProvider($user);
    if ($oauth !== '') {
        profileOauthColumnsEnsure($pdo);
        $column = $oauth === 'google' ? 'google_id' : 'discord_id';
        $providerId = mb_substr(trim((string)$user['provider_id']), 0, $oauth === 'google' ? 64 : 32);
        $stmt = $pdo->prepare("SELECT id FROM users WHERE $column = ? ORDER BY id LIMIT 1");
        $stmt->execute([$providerId]);
        $existing = $stmt->fetchColumn();
        if ($existing !== false) {
            profileSyncProviderAvatar($pdo, (int)$existing, $user);
            return (int)$existing;
        }
        $name = mb_substr(trim((string)($user['persona_name'] ?? $user['display_name'] ?? '')), 0, 40);
        $avatar = trim((string)($user['avatar'] ?? ''));
        if (strlen($avatar) > 255 || !preg_match('~^https://~i', $avatar)) {
            $avatar = '';
        }
        $columns = 'email, password_hash, display_name, avatar_url, steam_id, steam_persona, ' . $column
            . ($oauth === 'discord' ? ', discord_name' : '');
        $values = [$name, $avatar, '', '', $providerId];
        if ($oauth === 'discord') {
            $values[] = mb_substr($name, 0, 80);
        }
        $placeholders = implode(', ', array_fill(0, count($values), '?'));
        return dbInsertReturningId($pdo, "INSERT INTO users ($columns) VALUES (NULL, NULL, $placeholders)", $values);
    }

    $steamId = preg_replace('/\D+/', '', (string)($user['steamid'] ?? '')) ?? '';
    if ($steamId === '') {
        return 0;
    }

    $stmt = $pdo->prepare('SELECT id FROM users WHERE steam_id = ? LIMIT 1');
    $stmt->execute([$steamId]);
    $existing = $stmt->fetchColumn();
    if ($existing !== false) {
        profileSyncProviderAvatar($pdo, (int)$existing, $user);
        return (int)$existing;
    }

    // email and password_hash stay NULL: this account does not sign in that
    // way, and NULL is the only value uniq_email lets more than one row hold.
    $persona = mb_substr((string)($user['persona_name'] ?? $user['display_name'] ?? ''), 0, 80);
    return dbInsertReturningId(
        $pdo,
        'INSERT INTO users (email, password_hash, display_name, avatar_url, steam_id, steam_persona)
         VALUES (NULL, NULL, ?, ?, ?, ?)',
        [mb_substr($persona, 0, 40), '', $steamId, $persona]
    );
}

/**
 * Copies the picture of the provider someone signed in with (Steam, Google,
 * Discord) onto their account, so the profile shows it instead of initials
 * (user, 2026-09-30: "import my pfp"). A picture uploaded on the profile
 * (assets/avatars/...) is never replaced; a provider picture is refreshed
 * when the provider's changed.
 */
function profileSyncProviderAvatar(PDO $pdo, int $userId, ?array $user): void
{
    $avatar = trim((string)($user['avatar'] ?? ''));
    if ($userId <= 0 || $avatar === '' || strlen($avatar) > 255 || !preg_match('~^https://~i', $avatar)) {
        return;
    }
    try {
        $stmt = $pdo->prepare('SELECT avatar_url FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $current = trim((string)($stmt->fetchColumn() ?: ''));
        if ($current === $avatar || ($current !== '' && !preg_match('~^https://~i', $current))) {
            return;
        }
        $pdo->prepare('UPDATE users SET avatar_url = ? WHERE id = ?')->execute([$avatar, $userId]);
    } catch (Throwable $exception) {
        error_log('profile: could not sync the provider avatar - ' . $exception->getMessage());
    }
}

/** True when the row's only way in is Steam, so unlinking would orphan it. */
function profileIsSteamOnly(array $profile): bool
{
    return ($profile['email'] ?? null) === null
        && (string)($profile['steam_id'] ?? '') !== ''
        && (string)($profile['discord_id'] ?? '') === ''
        && (string)($profile['google_id'] ?? '') === '';
}

function profileLoad(PDO $pdo, int $userId): array
{
    // ai_instructions (ai_persona_helpers.php) is newer than the rest of the
    // row; a database that has not had the column added yet still serves the
    // profile, with the field empty.
    $hasPersona = function_exists('aiPersonaColumnExists') && aiPersonaColumnExists($pdo);
    // Email change (email_change_helpers.php) is newer still; same rule.
    $hasPending = function_exists('emailChangeColumnsExist') && emailChangeColumnsExist($pdo);
    // Discord connection (discord_link_helpers.php): newest of all; same rule.
    $hasDiscord = function_exists('discordLinkColumnsExist') && discordLinkColumnsExist($pdo);
    // Google sign-in rows (profileResolveUserId): newest column of all.
    try {
        $hasGoogle = dbColumnExists($pdo, 'users', 'google_id');
    } catch (Throwable) {
        $hasGoogle = false;
    }
    $stmt = $pdo->prepare(
        'SELECT id, email, display_name, avatar_url, steam_id, steam_persona, created_at,
                email_verified_at, verify_sent_at, (password_hash IS NOT NULL) AS has_password'
        . ($hasPersona ? ', ai_instructions' : '')
        . ($hasPending ? ', pending_email, pending_email_sent_at' : '')
        . ($hasDiscord ? ', discord_id, discord_name' : '')
        . ($hasGoogle ? ', google_id' : '') . '
           FROM users WHERE id = ? LIMIT 1'
    );
    $stmt->execute([$userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!is_array($row)) {
        return [];
    }
    $row['has_password'] = (bool)($row['has_password'] ?? false);
    $row['ai_instructions'] = isset($row['ai_instructions']) && is_string($row['ai_instructions'])
        ? $row['ai_instructions']
        : '';
    $row['pending_email'] = isset($row['pending_email']) && is_string($row['pending_email'])
        ? $row['pending_email']
        : '';
    $row['pending_email_sent_at'] = isset($row['pending_email_sent_at']) && is_string($row['pending_email_sent_at'])
        ? $row['pending_email_sent_at']
        : '';
    $row['discord_id'] = isset($row['discord_id']) && is_string($row['discord_id']) ? $row['discord_id'] : '';
    $row['discord_name'] = isset($row['discord_name']) && is_string($row['discord_name']) ? $row['discord_name'] : '';
    $row['google_id'] = isset($row['google_id']) && is_string($row['google_id']) ? $row['google_id'] : '';
    return $row;
}

/**
 * Writes the freshly-saved values back into the session, so the navbar picks
 * up a new name or avatar on the next render without a re-login.
 */
function profileRefreshSession(array $profile): void
{
    if (!$profile) {
        return;
    }

    $fields = [
        'id' => (string)($profile['id'] ?? ''),
        'display_name' => (string)($profile['display_name'] ?? ''),
        'persona_name' => (string)($profile['display_name'] ?? ''),
        'avatar' => (string)($profile['avatar_url'] ?? ''),
        'steamid' => (string)($profile['steam_id'] ?? ''),
    ];

    // The session keeps the provider the visitor signed in with; only the name
    // and picture change. Signed in with Google or Discord: stay that session
    // (the navbar reads "Connected via Discord").
    $current = steamSessionUser();
    $oauth = profileOauthProvider($current);

    // A Steam session (or a Steam-only account) has to stay a Steam session.
    // Writing it back as an email user would relabel it in the navbar and hide
    // the Inventory entry, which is gated on sessionIsSteamUser().
    if ($oauth === '' && (profileIsSteamOnly($profile) || strtolower((string)($current['provider'] ?? '')) === 'steam')) {
        storeSteamSessionUser($fields + ['provider' => 'steam']);
        return;
    }

    if ($oauth !== '') {
        storeOAuthSessionUser($fields + [
            'provider' => $oauth,
            'provider_id' => (string)$current['provider_id'],
            'email' => (string)($current['email'] ?? ''),
            'profile_url' => (string)($current['profile_url'] ?? ''),
        ]);
        return;
    }

    storeOAuthSessionUser($fields + [
        'provider' => 'email',
        'email' => (string)($profile['email'] ?? ''),
    ]);
}

function profileAvatarDir(): string
{
    return __DIR__ . '/' . PROFILE_AVATAR_DIR;
}

/**
 * Validates and stores an uploaded avatar.
 *
 * The image is re-encoded through GD rather than moved into place. That is the
 * point of this function: a file can be a valid PNG *and* carry PHP in a
 * comment chunk, and re-encoding throws away everything that is not pixels.
 * The extension is ours, never the uploader's.
 *
 * @return array{ok:bool, path?:string, error?:string}
 */
function profileStoreAvatar(mixed $file, int $userId): array
{
    if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $code = is_array($file) ? (int)($file['error'] ?? -1) : -1;
        if ($code === UPLOAD_ERR_INI_SIZE || $code === UPLOAD_ERR_FORM_SIZE) {
            return ['ok' => false, 'error' => 'That image is too large.'];
        }
        return ['ok' => false, 'error' => 'No image was uploaded.'];
    }

    $tmp = (string)($file['tmp_name'] ?? '');
    if ($tmp === '' || !is_uploaded_file($tmp)) {
        return ['ok' => false, 'error' => 'Upload failed.'];
    }
    if ((int)($file['size'] ?? 0) > PROFILE_AVATAR_MAX_BYTES) {
        return ['ok' => false, 'error' => 'Keep the image under 3 MB.'];
    }

    if (!function_exists('imagecreatefromstring')) {
        return ['ok' => false, 'error' => 'Image uploads are unavailable on this server.'];
    }

    $info = @getimagesize($tmp);
    if (!is_array($info)) {
        return ['ok' => false, 'error' => 'That file is not an image.'];
    }
    $allowed = [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP, IMAGETYPE_GIF];
    if (!in_array((int)($info[2] ?? 0), $allowed, true)) {
        return ['ok' => false, 'error' => 'Use a JPG, PNG, WEBP or GIF image.'];
    }

    $source = @imagecreatefromstring((string)file_get_contents($tmp));
    if ($source === false) {
        return ['ok' => false, 'error' => 'That image could not be read.'];
    }

    $width = imagesx($source);
    $height = imagesy($source);
    $side = min($width, $height);
    $srcX = (int)(($width - $side) / 2);
    $srcY = (int)(($height - $side) / 2);

    $canvas = imagecreatetruecolor(PROFILE_AVATAR_SIZE, PROFILE_AVATAR_SIZE);
    imagealphablending($canvas, false);
    imagesavealpha($canvas, true);
    imagecopyresampled(
        $canvas,
        $source,
        0, 0,
        $srcX, $srcY,
        PROFILE_AVATAR_SIZE, PROFILE_AVATAR_SIZE,
        $side, $side
    );
    imagedestroy($source);

    $dir = profileAvatarDir();
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        imagedestroy($canvas);
        return ['ok' => false, 'error' => 'Avatar storage is not writable.'];
    }

    // Random suffix, so a replaced avatar gets a new URL and no browser or CDN
    // serves the previous image from cache.
    $name = $userId . '-' . bin2hex(random_bytes(8)) . '.png';
    $ok = imagepng($canvas, $dir . '/' . $name, 6);
    imagedestroy($canvas);

    if (!$ok) {
        return ['ok' => false, 'error' => 'Could not save that image.'];
    }

    return ['ok' => true, 'path' => PROFILE_AVATAR_DIR . '/' . $name];
}

/**
 * The uploaded picture itself, in the shared accounts database (users.avatar_b64,
 * a base64 PNG), served by avatar.php on whichever host asks. A picture used
 * to be only a file on the host that took the upload, so the other host
 * showed nothing (user, 2026-09-30: "make that the pfp transfers as well").
 */
function profileAvatarBlobColumnEnsure(PDO $pdo): bool
{
    static $ok = null;
    if ($ok !== null) {
        return $ok;
    }
    try {
        if (!dbColumnExists($pdo, 'users', 'avatar_b64')) {
            $type = pdoDriverName($pdo) === 'pgsql' ? 'TEXT' : 'MEDIUMTEXT';
            $pdo->exec("ALTER TABLE users ADD COLUMN avatar_b64 $type NULL");
        }
        $ok = true;
    } catch (Throwable $exception) {
        error_log('profile: could not add users.avatar_b64 - ' . $exception->getMessage());
        $ok = false;
    }
    return $ok;
}

/** The URL both hosts serve the picture from; `v` changes with the picture, so browsers never keep an old one. */
function profileAvatarPublicUrl(int $userId, string $png): string
{
    return 'avatar.php?u=' . $userId . '&v=' . substr(sha1($png), 0, 10);
}

/** Stores the PNG on the row and points avatar_url at avatar.php. "" when the column is unavailable. */
function profileSaveAvatarBlob(PDO $pdo, int $userId, string $png): string
{
    if ($png === '' || !profileAvatarBlobColumnEnsure($pdo)) {
        return '';
    }
    $url = profileAvatarPublicUrl($userId, $png);
    $pdo->prepare('UPDATE users SET avatar_b64 = ?, avatar_url = ? WHERE id = ?')
        ->execute([base64_encode($png), $url, $userId]);
    return $url;
}

/**
 * Moves a file-based avatar (assets/avatars/...) into the database: from
 * this host's disk, else fetched from csprice.eu, where uploads used to
 * land. Returns the new URL, or "" when there was nothing to move.
 */
function profileMigrateAvatarToDb(PDO $pdo, int $userId, string $avatarUrl): string
{
    $avatarUrl = trim($avatarUrl);
    if ($userId <= 0 || !str_starts_with($avatarUrl, PROFILE_AVATAR_DIR . '/') || str_contains($avatarUrl, '..')) {
        return '';
    }
    $png = '';
    $local = __DIR__ . '/' . $avatarUrl;
    if (is_file($local)) {
        $png = (string)file_get_contents($local);
    }
    if ($png === '') {
        try {
            $response = httpJsonRequest('https://csprice.eu/' . $avatarUrl, ['User-Agent: Mozilla/5.0 csprice-avatar', 'Accept: image/png'], 15);
            if ((int)($response['status'] ?? 0) === 200) {
                $png = (string)($response['body'] ?? '');
            }
        } catch (Throwable $exception) {
            $png = '';
        }
    }
    if ($png === '' || strlen($png) > 2097152 || !str_starts_with($png, "\x89PNG")) {
        return '';
    }
    try {
        return profileSaveAvatarBlob($pdo, $userId, $png);
    } catch (Throwable $exception) {
        error_log('profile: avatar migration failed - ' . $exception->getMessage());
        return '';
    }
}

/** Removes a previously stored avatar. Ignores anything outside the store. */
function profileDeleteAvatarFile(string $storedPath): void
{
    $storedPath = trim($storedPath);
    if ($storedPath === '' || !str_starts_with($storedPath, PROFILE_AVATAR_DIR . '/')) {
        return;
    }
    if (str_contains($storedPath, '..')) {
        return;
    }
    $full = __DIR__ . '/' . $storedPath;
    if (is_file($full)) {
        @unlink($full);
    }
}
