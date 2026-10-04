<?php
declare(strict_types=1);

require_once __DIR__ . '/steam_auth_helpers.php';

ensureSessionStarted();
$_SESSION = [];

if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(
        session_name(),
        '',
        time() - 42000,
        $params['path'] ?? '/',
        $params['domain'] ?? '',
        (bool)($params['secure'] ?? false),
        (bool)($params['httponly'] ?? false)
    );
}

session_destroy();
// ?auth=logout: the navbar's session hook treats an auth flag as "ignore the
// cached session and ask the server", so the chip does not keep showing the
// account that was just signed out (the cache lives up to five minutes).
header('Location: ' . absoluteAppUrl('index.html?auth=logout'), true, 302);
exit;
