<?php
declare(strict_types=1);
/**
 * Starts "connect Discord" for an email account.
 *
 * Same OAuth round trip as discord_login.php, but it flags the session first
 * so discord_callback.php (oauthHandleCallback) attaches the Discord id to the
 * signed-in user instead of replacing the session with a Discord one. Without
 * the flag, connecting Discord would silently sign you out of your email
 * account and into Discord.
 */

require_once __DIR__ . '/oauth_auth_helpers.php';
require_once __DIR__ . '/profile_helpers.php';

ensureSessionStarted();

$user = steamSessionUser();
$userId = profileUserIdFromSession($user);
if ($userId <= 0) {
    header('Location: ' . absoluteAppUrl('index.html?panel=profile&discord=not_email'), true, 302);
    exit;
}

if (!oauthProviderEnabled('discord')) {
    header('Location: ' . absoluteAppUrl('index.html?panel=profile&discord=unavailable'), true, 302);
    exit;
}

$state = bin2hex(random_bytes(16));
$_SESSION['oauth_state'] = $state;
$_SESSION['oauth_provider'] = 'discord';
$_SESSION['oauth_return_to'] = steamSafeReturnPath('index.html?panel=profile');
$_SESSION['discord_link_user_id'] = $userId;

header('Location: ' . oauthAuthorizeUrl('discord', $state), true, 302);
exit;
