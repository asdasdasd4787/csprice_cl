<?php
declare(strict_types=1);
/**
 * Starts "connect Steam" for an email account.
 *
 * Same OpenID round trip as steam_login.php, but it flags the session first so
 * steam_auth_callback.php attaches the Steam id to the signed-in user instead
 * of replacing the session with a Steam one. Without the flag, connecting
 * Steam would silently sign you out of your email account and into Steam.
 */

require_once __DIR__ . '/steam_auth_helpers.php';
require_once __DIR__ . '/profile_helpers.php';

ensureSessionStarted();

$user = steamSessionUser();
if (profileUserIdFromSession($user) <= 0) {
    header('Location: ' . absoluteAppUrl('index.html?panel=profile&steam=not_email'), true, 302);
    exit;
}

$_SESSION['steam_link_user_id'] = profileUserIdFromSession($user);
$_SESSION['steam_return_to'] = steamSafeReturnPath(
    (string)($_GET['return_to'] ?? 'index.html?panel=profile')
);

header('Location: ' . steamLoginUrl(), true, 302);
exit;
