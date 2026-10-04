<?php
declare(strict_types=1);

require_once __DIR__ . '/steam_auth_helpers.php';

if (PHP_SAPI !== 'cli') {
    ensureSessionStarted();
    $_SESSION['steam_return_to'] = steamSafeReturnPath(
        (string)($_GET['return_to'] ?? $_SERVER['HTTP_REFERER'] ?? '')
    );

    header('Location: ' . steamLoginUrl(), true, 302);
    exit;
}

echo steamLoginUrl();
