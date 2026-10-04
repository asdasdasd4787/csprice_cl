<?php
declare(strict_types=1);

require_once __DIR__ . '/oauth_auth_helpers.php';

try {
    $user = steamSessionUser();

    respondJson([
        'authenticated' => $user !== null,
        'user' => $user,
        'oauth' => oauthProvidersPublicStatus(),
    ]);
} catch (Throwable $exception) {
    respondJson([
        'authenticated' => false,
        'error' => $exception->getMessage(),
        'oauth' => [
            'google' => false,
            'discord' => false,
        ],
    ], 500);
}
