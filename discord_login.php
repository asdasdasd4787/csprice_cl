<?php
declare(strict_types=1);

require_once __DIR__ . '/oauth_auth_helpers.php';

if (PHP_SAPI !== 'cli') {
    oauthBeginLogin('discord');
}

if (!oauthProviderEnabled('discord')) {
    echo "Discord OAuth is not configured. Set discord.client_id and discord.client_secret in config.local.php.\n";
    echo 'Redirect URI: ' . oauthRedirectUri('discord') . "\n";
    exit(1);
}

echo oauthAuthorizeUrl('discord', 'cli-preview');
echo "\n";
