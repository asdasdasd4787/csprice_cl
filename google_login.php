<?php
declare(strict_types=1);

require_once __DIR__ . '/oauth_auth_helpers.php';

if (PHP_SAPI !== 'cli') {
    oauthBeginLogin('google');
}

if (!oauthProviderEnabled('google')) {
    echo "Google OAuth is not configured. Set google.client_id and google.client_secret in config.local.php.\n";
    echo 'Redirect URI: ' . oauthRedirectUri('google') . "\n";
    exit(1);
}

echo oauthAuthorizeUrl('google', 'cli-preview');
echo "\n";
