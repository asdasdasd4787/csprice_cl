<?php
declare(strict_types=1);

require_once __DIR__ . '/steam_auth_helpers.php';

function oauthProviderName(string $provider): string
{
    $normalized = strtolower(trim($provider));
    return in_array($normalized, ['google', 'discord'], true) ? $normalized : '';
}

function oauthProviderConfig(string $provider): array
{
    $name = oauthProviderName($provider);
    if ($name === '') {
        return [];
    }

    $section = appConfig()[$name] ?? [];
    return is_array($section) ? $section : [];
}

function oauthProviderEnabled(string $provider): bool
{
    $config = oauthProviderConfig($provider);
    $clientId = trim((string)($config['client_id'] ?? ''));
    $clientSecret = trim((string)($config['client_secret'] ?? ''));

    if ($clientId === '' || $clientSecret === '') {
        return false;
    }

    $placeholderMarkers = [
        'paste-your-',
        'your-google-',
        'your-discord-',
    ];
    foreach ($placeholderMarkers as $marker) {
        if (str_contains(strtolower($clientId), $marker) || str_contains(strtolower($clientSecret), $marker)) {
            return false;
        }
    }

    return true;
}

function oauthProvidersPublicStatus(): array
{
    return [
        'google' => oauthProviderEnabled('google'),
        'discord' => oauthProviderEnabled('discord'),
    ];
}

function oauthCallbackFile(string $provider): string
{
    return oauthProviderName($provider) . '_callback.php';
}

function oauthRedirectUri(string $provider): string
{
    $configured = trim((string)(oauthProviderConfig($provider)['redirect_uri'] ?? ''));
    if ($configured !== '') {
        // One config.local.php serves csprice.eu and tf2price.eu, and the
        // configured URI names csprice.eu. A sign-in started on tf2price.eu
        // must come back to tf2price.eu (the state and session cookies live
        // there), so the callback host follows the request host. Local
        // development keeps the configured URI, as before.
        $host = strtolower(trim((string)($_SERVER['HTTP_HOST'] ?? '')));
        $configuredHost = strtolower((string)(parse_url($configured, PHP_URL_HOST) ?? ''));
        $isLocal = $host === '' || $host === 'localhost' || str_starts_with($host, 'localhost:')
            || str_starts_with($host, '127.') || str_starts_with($host, '192.168.') || str_ends_with($host, '.test');
        if (!$isLocal && $configuredHost !== '' && $configuredHost !== $host) {
            return absoluteAppUrl(oauthCallbackFile($provider));
        }
        return $configured;
    }

    return absoluteAppUrl(oauthCallbackFile($provider));
}

function oauthScopes(string $provider): string
{
    return oauthProviderName($provider) === 'discord' ? 'identify email' : 'openid email profile';
}

function oauthAuthorizeUrl(string $provider, string $state): string
{
    $name = oauthProviderName($provider);
    $clientId = trim((string)(oauthProviderConfig($name)['client_id'] ?? ''));
    $redirectUri = oauthRedirectUri($name);

    if ($name === 'discord') {
        $params = [
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => oauthScopes($name),
            'state' => $state,
            'prompt' => 'consent',
        ];

        return 'https://discord.com/oauth2/authorize?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
    }

    $params = [
        'client_id' => $clientId,
        'redirect_uri' => $redirectUri,
        'response_type' => 'code',
        'scope' => oauthScopes($name),
        'state' => $state,
        'access_type' => 'online',
        'prompt' => 'consent',
    ];

    return 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
}

function oauthCaptureReturnTo(?string $value): string
{
    $raw = trim((string)$value);
    if ($raw === '') {
        return steamSafeReturnPath('index.html');
    }

    return steamSafeReturnPath($raw);
}

function oauthBeginLogin(string $provider): never
{
    ensureSessionStarted();
    $name = oauthProviderName($provider);
    $returnTo = oauthCaptureReturnTo(
        (string)($_GET['return_to'] ?? $_SERVER['HTTP_REFERER'] ?? 'index.html')
    );

    $_SESSION['oauth_return_to'] = $returnTo;

    if ($name === '' || !oauthProviderEnabled($name)) {
        header('Location: ' . absoluteAppUrl(steamReturnPathWithAuthStatus($returnTo, 'failed')), true, 302);
        exit;
    }

    $state = bin2hex(random_bytes(16));
    $_SESSION['oauth_state'] = $state;
    $_SESSION['oauth_provider'] = $name;

    header('Location: ' . oauthAuthorizeUrl($name, $state), true, 302);
    exit;
}

function oauthPostFormJson(string $url, array $fields, array $headers = [], int $timeoutSeconds = 20): array
{
    $response = postFormTextRequestWithStatus($url, $fields, $headers, $timeoutSeconds);
    $decoded = json_decode((string)$response['body'], true);

    return [
        'status' => (int)$response['status'],
        'body' => (string)$response['body'],
        'json' => is_array($decoded) ? $decoded : [],
    ];
}

function oauthExchangeCode(string $provider, string $code): array
{
    $name = oauthProviderName($provider);
    $config = oauthProviderConfig($name);
    $fields = [
        'client_id' => trim((string)($config['client_id'] ?? '')),
        'client_secret' => trim((string)($config['client_secret'] ?? '')),
        'grant_type' => 'authorization_code',
        'code' => $code,
        'redirect_uri' => oauthRedirectUri($name),
    ];

    if ($name === 'discord') {
        $basic = base64_encode(
            trim((string)($config['client_id'] ?? '')) . ':' . trim((string)($config['client_secret'] ?? ''))
        );
        $response = oauthPostFormJson(
            'https://discord.com/api/v10/oauth2/token',
            $fields,
            [
                'Accept: application/json',
                'User-Agent: CS2PriceTracker/1.0',
                'Authorization: Basic ' . $basic,
            ],
            20
        );
    } else {
        $response = oauthPostFormJson(
            'https://oauth2.googleapis.com/token',
            $fields,
            ['Accept: application/json', 'User-Agent: CS2PriceTracker/1.0'],
            20
        );
    }

    $accessToken = trim((string)($response['json']['access_token'] ?? ''));
    if ((int)$response['status'] >= 400 || $accessToken === '') {
        $error = trim((string)($response['json']['error'] ?? ''));
        if ($error === '') {
            $error = 'token_exchange_failed';
        }
        throw new RuntimeException('OAuth token exchange failed: ' . $error);
    }

    return [
        'access_token' => $accessToken,
        'id_token' => trim((string)($response['json']['id_token'] ?? '')),
        'token_type' => trim((string)($response['json']['token_type'] ?? 'Bearer')),
        'scope' => trim((string)($response['json']['scope'] ?? '')),
    ];
}

function oauthJwtPayload(string $jwt): array
{
    $parts = explode('.', $jwt);
    if (count($parts) < 2) {
        return [];
    }

    $payload = strtr($parts[1], '-_', '+/');
    $pad = strlen($payload) % 4;
    if ($pad > 0) {
        $payload .= str_repeat('=', 4 - $pad);
    }

    $decoded = json_decode((string)base64_decode($payload, true), true);
    return is_array($decoded) ? $decoded : [];
}

function oauthDiscordAvatarUrl(array $profile): string
{
    $userId = trim((string)($profile['id'] ?? ''));
    $avatar = trim((string)($profile['avatar'] ?? ''));
    if ($userId === '') {
        return '';
    }

    if ($avatar !== '') {
        $ext = str_starts_with($avatar, 'a_') ? 'gif' : 'png';
        return sprintf('https://cdn.discordapp.com/avatars/%s/%s.%s?size=256', rawurlencode($userId), rawurlencode($avatar), $ext);
    }

    $discriminator = trim((string)($profile['discriminator'] ?? '0'));
    if ($discriminator !== '' && $discriminator !== '0') {
        $index = abs((int)$discriminator) % 5;
    } elseif (PHP_INT_SIZE >= 8) {
        $index = (int)(((int)$userId >> 22) % 6);
    } else {
        $index = abs(crc32($userId)) % 6;
    }

    return sprintf('https://cdn.discordapp.com/embed/avatars/%d.png', $index);
}

function oauthFetchIdentity(string $provider, string $accessToken): array
{
    $name = oauthProviderName($provider);
    $headers = [
        'Authorization: Bearer ' . $accessToken,
        'Accept: application/json',
        'User-Agent: CS2PriceTracker/1.0',
    ];

    if ($name === 'discord') {
        $response = httpJsonRequest('https://discord.com/api/v10/users/@me', $headers, 20);
        if ((int)$response['status'] >= 400 || !is_array($response['json'] ?? null)) {
            throw new RuntimeException('Discord profile request failed.');
        }

        $profile = $response['json'];
        $providerId = trim((string)($profile['id'] ?? ''));
        $globalName = trim((string)($profile['global_name'] ?? ''));
        $username = trim((string)($profile['username'] ?? ''));
        $email = trim((string)($profile['email'] ?? ''));
        $displayName = $globalName !== '' ? $globalName : ($username !== '' ? $username : 'Discord User');

        if ($providerId === '') {
            throw new RuntimeException('Discord profile did not include a user id.');
        }

        $avatar = oauthDiscordAvatarUrl($profile);

        return [
            'provider' => 'discord',
            'provider_id' => $providerId,
            'email' => $email,
            'persona_name' => $displayName,
            'display_name' => $displayName,
            'name' => $displayName,
            'avatar' => $avatar,
            'picture' => $avatar,
            'profile_url' => 'https://discord.com/users/' . rawurlencode($providerId),
        ];
    }

    $profile = [];
    $userinfoUrls = [
        'https://openidconnect.googleapis.com/v1/userinfo',
        'https://www.googleapis.com/oauth2/v3/userinfo',
    ];
    foreach ($userinfoUrls as $userinfoUrl) {
        try {
            $response = httpJsonRequest($userinfoUrl, $headers, 20);
        } catch (Throwable) {
            continue;
        }
        if ((int)$response['status'] < 400 && is_array($response['json'] ?? null)) {
            $profile = $response['json'];
            break;
        }
    }

    $providerId = trim((string)($profile['sub'] ?? ''));
    $email = trim((string)($profile['email'] ?? ''));
    $displayName = trim((string)($profile['name'] ?? ''));
    if ($displayName === '') {
        $displayName = trim((string)($profile['given_name'] ?? ''));
    }
    if ($displayName === '' && $email !== '') {
        $displayName = $email;
    }
    if ($displayName === '') {
        $displayName = 'Google User';
    }

    if ($providerId === '') {
        throw new RuntimeException('Google profile did not include a subject id.');
    }

    return [
        'provider' => 'google',
        'provider_id' => $providerId,
        'email' => $email,
        'persona_name' => $displayName,
        'display_name' => $displayName,
        'name' => $displayName,
        'avatar' => trim((string)($profile['picture'] ?? '')),
        'picture' => trim((string)($profile['picture'] ?? '')),
        'profile_url' => '',
    ];
}

function oauthEnrichGoogleIdentity(array $identity, array $tokenPayload): array
{
    $jwt = oauthJwtPayload((string)($tokenPayload['id_token'] ?? ''));
    if ($jwt === []) {
        return $identity;
    }

    $displayName = trim((string)($identity['persona_name'] ?? ''));
    if ($displayName === '' || $displayName === 'Google User') {
        $fromJwt = trim((string)($jwt['name'] ?? ''));
        if ($fromJwt === '') {
            $fromJwt = trim((string)($jwt['given_name'] ?? ''));
        }
        if ($fromJwt !== '') {
            $identity['persona_name'] = $fromJwt;
            $identity['display_name'] = $fromJwt;
            $identity['name'] = $fromJwt;
        }
    }

    $avatar = trim((string)($identity['avatar'] ?? ''));
    if ($avatar === '') {
        $picture = trim((string)($jwt['picture'] ?? ''));
        $identity['avatar'] = $picture;
        $identity['picture'] = $picture;
    }

    if (trim((string)($identity['email'] ?? '')) === '') {
        $identity['email'] = trim((string)($jwt['email'] ?? ''));
    }

    if (trim((string)($identity['provider_id'] ?? '')) === '') {
        $identity['provider_id'] = trim((string)($jwt['sub'] ?? ''));
    }

    return $identity;
}

function oauthEnsureUsersTable(): void
{
    static $ensured = false;
    if ($ensured) {
        return;
    }

    $connection = steamDbConnection();
    $driver = pdoDriverName($connection);

    if ($driver === 'sqlsrv') {
        $sql = <<<'SQL'
IF OBJECT_ID(N'oauth_users', N'U') IS NULL
BEGIN
    CREATE TABLE oauth_users (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        provider NVARCHAR(32) NOT NULL,
        provider_id NVARCHAR(128) NOT NULL,
        email NVARCHAR(255) NULL,
        display_name NVARCHAR(255) NOT NULL,
        avatar NVARCHAR(2048) NULL,
        profile_url NVARCHAR(2048) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_oauth_users_provider_id UNIQUE (provider, provider_id)
    );
END
SQL;
    } elseif ($driver === 'pgsql') {
        $sql = <<<'SQL'
CREATE TABLE IF NOT EXISTS oauth_users (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(32) NOT NULL,
    provider_id VARCHAR(128) NOT NULL,
    email VARCHAR(255) NULL,
    display_name VARCHAR(255) NOT NULL,
    avatar TEXT NULL,
    profile_url TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_oauth_users_provider_id UNIQUE (provider, provider_id)
)
SQL;
    } else {
        $sql = <<<'SQL'
CREATE TABLE IF NOT EXISTS oauth_users (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    provider VARCHAR(32) NOT NULL,
    provider_id VARCHAR(128) NOT NULL,
    email VARCHAR(255) NULL,
    display_name VARCHAR(255) NOT NULL,
    avatar TEXT NULL,
    profile_url TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_oauth_users_provider_id (provider, provider_id)
)
SQL;
    }

    $connection->exec($sql);
    $ensured = true;
}

function oauthSessionUserFromIdentity(array $identity): array
{
    $displayName = trim((string)($identity['persona_name'] ?? ''));
    if ($displayName === '') {
        $displayName = trim((string)($identity['display_name'] ?? $identity['name'] ?? $identity['email'] ?? 'User'));
    }
    $avatar = trim((string)($identity['avatar'] ?? $identity['picture'] ?? ''));

    return steamNormalizeSessionUser([
        'provider' => (string)($identity['provider'] ?? ''),
        'provider_id' => (string)($identity['provider_id'] ?? ''),
        'steamid' => '',
        'persona_name' => $displayName,
        'display_name' => $displayName,
        'name' => $displayName,
        'avatar' => $avatar,
        'picture' => $avatar,
        'email' => trim((string)($identity['email'] ?? '')),
        'profile_url' => trim((string)($identity['profile_url'] ?? '')),
        'custom_url' => '',
        'member_since' => '',
        'state_message' => '',
        'visibility_state' => '',
    ]);
}

function oauthUpsertUser(array $identity): array
{
    $sessionUser = oauthSessionUserFromIdentity($identity);
    $provider = (string)$sessionUser['provider'];
    $providerId = (string)$sessionUser['provider_id'];
    if ($provider === '' || $providerId === '') {
        return $sessionUser;
    }

    try {
        oauthEnsureUsersTable();
        $connection = steamDbConnection();
        $now = dbNowUtc();

        $existsStatement = $connection->prepare(
            'SELECT id FROM oauth_users WHERE provider = ? AND provider_id = ?'
        );
        $existsStatement->execute([$provider, $providerId]);
        $existingId = $existsStatement->fetchColumn();

        if ($existingId !== false && $existingId !== null) {
            $statement = $connection->prepare(
                'UPDATE oauth_users
                 SET email = ?, display_name = ?, avatar = ?, profile_url = ?, updated_at = ?
                 WHERE provider = ? AND provider_id = ?'
            );
            $statement->execute([
                $sessionUser['email'],
                $sessionUser['persona_name'],
                $sessionUser['avatar'],
                $sessionUser['profile_url'],
                $now,
                $provider,
                $providerId,
            ]);
        } else {
            $statement = $connection->prepare(
                'INSERT INTO oauth_users (
                    provider, provider_id, email, display_name, avatar, profile_url, created_at, updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $statement->execute([
                $provider,
                $providerId,
                $sessionUser['email'],
                $sessionUser['persona_name'],
                $sessionUser['avatar'],
                $sessionUser['profile_url'],
                $now,
                $now,
            ]);
        }
    } catch (Throwable) {
        // Session login still succeeds if the identity table cannot be written.
    }

    return $sessionUser;
}

function storeOAuthSessionUser(array $user): void
{
    ensureSessionStarted();
    unset($_SESSION['steam_user']);
    $_SESSION['auth_user'] = steamNormalizeSessionUser($user);
}

function oauthHandleCallback(string $provider): never
{
    ensureSessionStarted();
    $name = oauthProviderName($provider);
    $returnTo = oauthCaptureReturnTo((string)($_SESSION['oauth_return_to'] ?? 'index.html'));
    $expectedState = (string)($_SESSION['oauth_state'] ?? '');
    $expectedProvider = (string)($_SESSION['oauth_provider'] ?? '');
    // "Connect Discord" from the profile panel (discord_link.php set this):
    // attach the Discord account to the signed-in user and keep that session,
    // rather than signing them in as the Discord identity.
    $linkUserId = (int)($_SESSION['discord_link_user_id'] ?? 0);
    unset(
        $_SESSION['oauth_return_to'],
        $_SESSION['oauth_state'],
        $_SESSION['oauth_provider'],
        $_SESSION['discord_link_user_id']
    );
    $linkOutcome = static function (string $status): never {
        header('Location: ' . absoluteAppUrl('index.html?panel=profile&discord=' . $status), true, 302);
        exit;
    };

    $error = trim((string)($_GET['error'] ?? ''));
    if ($error !== '') {
        $status = strtolower($error) === 'access_denied' ? 'cancelled' : 'failed';
        if ($linkUserId > 0) {
            $linkOutcome($status === 'cancelled' ? 'cancelled' : 'error');
        }
        header('Location: ' . absoluteAppUrl(steamReturnPathWithAuthStatus($returnTo, $status)), true, 302);
        exit;
    }

    $state = trim((string)($_GET['state'] ?? ''));
    $code = trim((string)($_GET['code'] ?? ''));
    if (
        $name === ''
        || $code === ''
        || $expectedState === ''
        || !hash_equals($expectedState, $state)
        || ($expectedProvider !== '' && $expectedProvider !== $name)
        || !oauthProviderEnabled($name)
    ) {
        error_log(sprintf(
            'OAuth callback rejected [%s]: code=%s expected_state=%s state_match=%s enabled=%s',
            $name !== '' ? $name : 'unknown',
            $code === '' ? 'missing' : 'present',
            $expectedState === '' ? 'missing' : 'present',
            ($expectedState !== '' && $state !== '' && hash_equals($expectedState, $state)) ? 'yes' : 'no',
            oauthProviderEnabled($name) ? 'yes' : 'no'
        ));
        if ($linkUserId > 0) {
            $linkOutcome('error');
        }
        header('Location: ' . absoluteAppUrl(steamReturnPathWithAuthStatus($returnTo, 'failed')), true, 302);
        exit;
    }

    try {
        $tokenPayload = oauthExchangeCode($name, $code);
        $accessToken = trim((string)($tokenPayload['access_token'] ?? ''));
        try {
            $identity = oauthFetchIdentity($name, $accessToken);
        } catch (Throwable $profileError) {
            if ($name !== 'google') {
                throw $profileError;
            }
            $identity = [
                'provider' => 'google',
                'provider_id' => '',
                'email' => '',
                'persona_name' => 'Google User',
                'display_name' => 'Google User',
                'name' => 'Google User',
                'avatar' => '',
                'picture' => '',
                'profile_url' => '',
            ];
        }
        if ($name === 'google') {
            $identity = oauthEnrichGoogleIdentity($identity, $tokenPayload);
        }
        if (trim((string)($identity['provider_id'] ?? '')) === '') {
            throw new RuntimeException('OAuth profile did not include a user id.');
        }
        $accessToken = '';
        unset($tokenPayload);

        if ($linkUserId > 0 && $name === 'discord') {
            require_once __DIR__ . '/app_bootstrap.php';
            require_once __DIR__ . '/profile_helpers.php';
            require_once __DIR__ . '/discord_link_helpers.php';
            $pdo = dbPdoConnection('accounts_db', 'db');
            if (!discordLinkColumnsEnsure($pdo)) {
                throw new RuntimeException('users.discord_id / discord_name are missing.');
            }
            $outcome = discordLinkAttach($pdo, $linkUserId, $identity);
            if ($outcome === 'linked') {
                profileRefreshSession(profileLoad($pdo, $linkUserId));
            }
            $linkOutcome($outcome);
        }

        $sessionUser = oauthUpsertUser($identity);
        storeOAuthSessionUser($sessionUser);
        header('Location: ' . absoluteAppUrl(steamReturnPathWithAuthStatus($returnTo, 'success')), true, 302);
        exit;
    } catch (Throwable $exception) {
        error_log('OAuth callback failed [' . ($name !== '' ? $name : 'unknown') . ']: ' . $exception->getMessage());
        if ($linkUserId > 0) {
            $linkOutcome('error');
        }
        header('Location: ' . absoluteAppUrl(steamReturnPathWithAuthStatus($returnTo, 'failed')), true, 302);
        exit;
    }
}
