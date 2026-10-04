<?php
declare(strict_types=1);

require_once __DIR__ . '/steam_auth_helpers.php';

ensureSessionStarted();
$returnTo = steamSafeReturnPath((string)($_SESSION['steam_return_to'] ?? 'login.html'));
unset($_SESSION['steam_return_to']);

$steamId = steamValidateAssertion($_GET);
if ($steamId === null) {
    header('Location: ' . absoluteAppUrl(steamReturnPathWithAuthStatus($returnTo, 'failed')), true, 302);
    exit;
}

$profile = steamFetchCommunityProfile($steamId);
if ($profile === null) {
    header('Location: ' . absoluteAppUrl(steamReturnPathWithAuthStatus($returnTo, 'profile_error')), true, 302);
    exit;
}

// "Connect Steam" from the profile panel (steam_link.php set this). Attach the
// Steam account to the signed-in email user and keep them signed in as that
// user - storeSteamSessionUser() below would swap the session to Steam, which
// from the visitor's side looks like being logged out of their own account.
$linkUserId = (int)($_SESSION['steam_link_user_id'] ?? 0);
unset($_SESSION['steam_link_user_id']);

if ($linkUserId > 0) {
    require_once __DIR__ . '/app_bootstrap.php';
    require_once __DIR__ . '/profile_helpers.php';

    try {
        $pdo = dbPdoConnection('accounts_db', 'db');

        // One Steam account per user: claiming one already attached elsewhere
        // would let two accounts share an inventory.
        $taken = $pdo->prepare('SELECT id FROM users WHERE steam_id = ? AND id <> ? LIMIT 1');
        $taken->execute([$steamId, $linkUserId]);
        if ($taken->fetchColumn() !== false) {
            header('Location: ' . absoluteAppUrl('index.html?panel=profile&steam=taken'), true, 302);
            exit;
        }

        $pdo->prepare('UPDATE users SET steam_id = ?, steam_persona = ? WHERE id = ?')->execute([
            $steamId,
            mb_substr((string)($profile['persona_name'] ?? ''), 0, 80),
            $linkUserId,
        ]);

        profileRefreshSession(profileLoad($pdo, $linkUserId));
    } catch (Throwable $exception) {
        error_log('steam_link: ' . $exception->getMessage());
        header('Location: ' . absoluteAppUrl('index.html?panel=profile&steam=error'), true, 302);
        exit;
    }

    header('Location: ' . absoluteAppUrl('index.html?panel=profile&steam=linked'), true, 302);
    exit;
}

storeSteamSessionUser($profile);
header('Location: ' . absoluteAppUrl(steamReturnPathWithAuthStatus($returnTo, 'success')), true, 302);
exit;
